let chart1, chart2, chart3;

document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    updateData();
    setInterval(updateData, 30000);
});

function initCharts() {
    const getOptions = () => ({
        responsive: true, 
        maintainAspectRatio: false,
        scales: {
            x: { 
                type: 'time', 
                time: { unit: 'minute', displayFormats: { minute: 'HH:mm', hour: 'HH:mm' } },
                ticks: { 
                    autoSkip: true, 
                    minRotation: 45, // Etiquetas tumbadas
                    maxRotation: 45, // Etiquetas tumbadas
                    font: { size: 13, weight: '500' } // Fuente más grande
                },
                title: { 
                    display: true, 
                    text: 'Hora de lectura (24h)', 
                    font: { weight: 'bold', size: 14 } 
                }
            },
            y: { 
                type: 'linear', 
                position: 'left', 
                title: { 
                    display: true, 
                    text: 'Temperatura (°C)', 
                    font: { weight: 'bold', size: 15 }, 
                    color: '#c0392b' 
                },
                ticks: { font: { size: 13, weight: 'bold' } }
            },
            y1: { 
                type: 'linear', 
                position: 'right', 
                min: 0, max: 100, 
                grid: { drawOnChartArea: false }, 
                title: { 
                    display: true, 
                    text: 'Humedad (%)', 
                    font: { weight: 'bold', size: 15 }, 
                    color: '#2980b9' 
                },
                ticks: { font: { size: 13, weight: 'bold' } }
            }
        },
        plugins: { 
            legend: { 
                position: 'bottom',
                labels: { 
                    boxWidth: 20, // Cuadrado de color más grande
                    padding: 20,
                    font: { size: 16, weight: 'bold' } // LEYENDA MUCHO MÁS GRANDE
                } 
            },
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
        if (!data.length) return;
        data.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));

        const deviceIds = [['Estacion_1', 'Estacion_Remota'], ['Estacion_2'], ['Estacion_3']];
        const charts = [chart1, chart2, chart3];

        deviceIds.forEach((ids, index) => {
            const d = data.filter(i => ids.includes(i.device_id));
            if (charts[index] && d.length > 0) {
                const last = d[d.length - 1];
                const clean = (key) => d.map(i => (i[key] != null && i[key] > -100) ? i[key] : null);
                
                charts[index].data.labels = d.map(i => new Date(i.timestamp));
                charts[index].data.datasets = [
                    { label: 'Ambiente', data: clean('t_aht'), borderColor: '#f1c40f', backgroundColor: '#f1c40f', yAxisID: 'y', tension: 0.3, borderWidth: 4 },
                    { label: 'Humedad', data: clean('h_aht'), borderColor: '#3498db', backgroundColor: '#3498db', yAxisID: 'y1', borderDash: [5, 5], tension: 0.3, borderWidth: 3 },
                    { label: 'S1', data: clean('t1'), borderColor: '#e67e22', yAxisID: 'y', borderWidth: 3 },
                    { label: 'S2', data: clean('t2'), borderColor: '#2ecc71', yAxisID: 'y', borderWidth: 3 },
                    { label: 'S3', data: clean('t3'), borderColor: '#9b59b6', yAxisID: 'y', borderWidth: 3 },
                    { label: 'S4', data: clean('t4'), borderColor: '#34495e', yAxisID: 'y', borderWidth: 3 }
                ];
                charts[index].update('none');
                updateUI(last, index + 1);
            }
        });
    } catch (e) { console.error(e); }
}

function updateUI(l, id) {
    const fmt = (v) => v != null ? parseFloat(v).toFixed(1) : "--";
    const tElem = document.getElementById(`d${id}-t`);
    if(tElem) {
        tElem.textContent = fmt(l.t_aht) + "°";
        document.getElementById(`d${id}-h`).textContent = fmt(l.h_aht) + "%";
        for(let s=1; s<=4; s++) {
            const el = document.getElementById(`d${id}-s${s}`);
            if(el) el.textContent = fmt(l[`t${s}`]) + " °C";
        }
        const rssiEl = document.getElementById(`d${id}-rssi`);
        if(rssiEl) rssiEl.textContent = (l.rssi || "--") + " dBm";
    }
    if(id === 1) document.getElementById('currentTime').textContent = "Sincronizado: " + new Date(l.timestamp).toLocaleTimeString('es-ES', {hour:'2-digit', minute:'2-digit', hour12:false});
}

function moveChart(chart, pct) {
    const scale = chart.scales.x;
    const range = scale.max - scale.min;
    chart.options.scales.x.min = scale.min + (range * pct);
    chart.options.scales.x.max = scale.max + (range * pct);
    chart.update();
}

function goToDate(chart, dateStr) {
    if (!dateStr) return;
    const start = new Date(dateStr + "T00:00:00").getTime();
    const end = start + 86400000;
    chart.options.scales.x.min = start;
    chart.options.scales.x.max = end;
    chart.update();
}
