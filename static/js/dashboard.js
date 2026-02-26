let chart1, chart2, chart3;

document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    updateData();
    setInterval(updateData, 30000); // Refresco cada 30 seg
});

function initCharts() {
    const getOptions = () => ({
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { 
                type: 'time', 
                time: { 
                    unit: 'minute',
                    displayFormats: { 
                        minute: 'HH:mm', // Formato 24h
                        hour: 'HH:mm'
                    },
                    tooltipFormat: 'dd/MM HH:mm'
                },
                ticks: {
                    maxRotation: 0,
                    autoSkip: true,
                    font: { size: 12 }
                },
                title: { display: true, text: 'Hora de lectura (24h)', font: { weight: 'bold' } }
            },
            y: { 
                type: 'linear', 
                position: 'left', 
                title: { display: true, text: 'Temperatura (°C)', font: { weight: 'bold' } } 
            },
            y1: { 
                type: 'linear', 
                position: 'right', 
                min: 0, max: 100, 
                grid: { drawOnChartArea: false }, 
                title: { display: true, text: 'Humedad (%)', font: { weight: 'bold' } } 
            }
        },
        plugins: { 
            legend: { position: 'bottom' },
            zoom: { 
                pan: { enabled: true, mode: 'x' }, 
                zoom: { wheel: { enabled: false }, mode: 'x' } 
            } 
        }
    });

    chart1 = new Chart(document.getElementById('chart1'), { type: 'line', data: { datasets: [] }, options: getOptions() });
    chart2 = new Chart(document.getElementById('chart2'), { type: 'line', data: { datasets: [] }, options: getOptions() });
    chart3 = new Chart(document.getElementById('chart3'), { type: 'line', data: { datasets: [] }, options: getOptions() });
}

async function updateData() {
    try {
        const res = await fetch('/api/history');
        const fbData = await res.json();
        let data = Array.isArray(fbData) ? fbData : Object.values(fbData);
        if (!data || data.length === 0) return;

        data.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Filtramos por dispositivo (Aceptamos Estacion_1 y el ID antiguo para d1)
        const deviceIds = [['Estacion_1', 'Estacion_Remota'], ['Estacion_2'], ['Estacion_3']];
        const charts = [chart1, chart2, chart3];

        deviceIds.forEach((ids, index) => {
            const d = data.filter(i => ids.includes(i.device_id));
            if (charts[index] && d.length > 0) {
                const last = d[d.length - 1];
                const clean = (key) => d.map(i => (i[key] != null && i[key] > -100) ? i[key] : null);

                charts[index].data.labels = d.map(i => new Date(i.timestamp));
                charts[index].data.datasets = [
                    { label: 'Ambiente', data: clean('t_aht'), borderColor: '#f1c40f', yAxisID: 'y', tension: 0.3 },
                    { label: 'Humedad', data: clean('h_aht'), borderColor: '#3498db', yAxisID: 'y1', borderDash: [5, 5], tension: 0.3 },
                    { label: 'S1', data: clean('t1'), borderColor: '#e67e22', yAxisID: 'y' },
                    { label: 'S2', data: clean('t2'), borderColor: '#2ecc71', yAxisID: 'y' },
                    { label: 'S3', data: clean('t3'), borderColor: '#9b59b6', yAxisID: 'y' },
                    { label: 'S4', data: clean('t4'), borderColor: '#95a5a6', yAxisID: 'y' }
                ];
                charts[index].update('none');
                updateUI(last, index + 1);
            }
        });
    } catch (e) { console.error("Error cargando datos:", e); }
}

function updateUI(l, id) {
    const fmt = (v) => (v != null && v > -100) ? parseFloat(v).toFixed(1) : "--";
    
    // Ambiente
    const tElem = document.getElementById(`d${id}-t`);
    const hElem = document.getElementById(`d${id}-h`);
    if(tElem) tElem.textContent = fmt(l.t_aht) + "°";
    if(hElem) hElem.textContent = fmt(l.h_aht) + "%";

    // Sondas
    for(let s=1; s<=4; s++) {
        const sElem = document.getElementById(`d${id}-s${s}`);
        if(sElem) sElem.textContent = fmt(l[`t${s}`]) + " °C";
    }

    // Señal
    const rElem = document.getElementById(`d${id}-rssi`);
    if(rElem) rElem.textContent = (l.rssi || "--") + " dBm";
    
    // Solo actualizamos el reloj principal con el último dato del primer dispositivo activo
    if(id === 1 || !document.getElementById('currentTime').textContent.includes(":")) {
        document.getElementById('currentTime').textContent = "Último dato: " + new Date(l.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
}

function goToDate(chart, dateStr) {
    if (!dateStr) return;
    const start = new Date(dateStr + "T00:00:00").getTime();
    const end = start + 86400000;
    chart.options.scales.x.min = start;
    chart.options.scales.x.max = end;
    chart.update();
}
