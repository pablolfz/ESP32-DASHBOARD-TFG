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
                time: { 
                    unit: 'minute',
                    displayFormats: { 
                        minute: 'HH:mm', 
                        hour: 'HH:mm'
                    }
                },
                ticks: {
                    autoSkip: true,
                    maxRotation: 0,
                    callback: function(value, index, values) {
                        // Forzado manual de formato 24h en los ticks
                        return new Date(value).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
                    }
                }
            },
            y: { type: 'linear', position: 'left', title: { display: true, text: 'Temp (°C)' } },
            y1: { type: 'linear', position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: 'Hum (%)' } }
        },
        plugins: {
            tooltip: {
                callbacks: {
                    label: function(context) {
                        return context.dataset.label + ': ' + context.parsed.y.toFixed(1);
                    }
                }
            },
            zoom: { pan: { enabled: true, mode: 'x' }, zoom: { wheel: { enabled: false }, mode: 'x' } }
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
                    { label: 'Ambiente', data: clean('t_aht'), borderColor: '#f1c40f', yAxisID: 'y', tension: 0.2 },
                    { label: 'Humedad', data: clean('h_aht'), borderColor: '#3498db', yAxisID: 'y1', borderDash: [5, 5], tension: 0.2 },
                    { label: 'S1', data: clean('t1'), borderColor: '#e67e22', yAxisID: 'y' },
                    { label: 'S2', data: clean('t2'), borderColor: '#2ecc71', yAxisID: 'y' },
                    { label: 'S3', data: clean('t3'), borderColor: '#9b59b6', yAxisID: 'y' },
                    { label: 'S4', data: clean('t4'), borderColor: '#95a5a6', yAxisID: 'y' }
                ];
                charts[index].update('none');
                updateUI(last, index + 1);
            }
        });
    } catch (e) { console.error(e); }
}

function updateUI(l, id) {
    const fmt = (v) => v != null ? parseFloat(v).toFixed(1) : "--";
    document.getElementById(`d${id}-t`).textContent = fmt(l.t_aht) + "°";
    document.getElementById(`d${id}-h`).textContent = fmt(l.h_aht) + "%";
    for(let s=1; s<=4; s++) {
        const el = document.getElementById(`d${id}-s${s}`);
        if(el) el.textContent = fmt(l[`t${s}`]) + "°C";
    }
    const rssiEl = document.getElementById(`d${id}-rssi`);
    if(rssiEl) rssiEl.textContent = (l.rssi || "--") + " dBm";
    
    if(id === 1) {
        const time = new Date(l.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
        document.getElementById('currentTime').textContent = "Último dato recibido: " + time;
    }
}

// FUNCIONES DE CONTROL RESTAURADAS
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
