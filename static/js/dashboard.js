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
            x: { type: 'time', time: { unit: 'minute', displayFormats: { minute: 'HH:mm' } } },
            y: { // Temperatura
                type: 'linear', position: 'left',
                title: { display: true, text: 'Temperatura (°C)', font: { weight: 'bold', size: 14 } }
            },
            y1: { // Humedad
                type: 'linear', position: 'right',
                min: 0, max: 100,
                grid: { drawOnChartArea: false },
                title: { display: true, text: 'Humedad (%)', font: { weight: 'bold', size: 14 } }
            }
        },
        plugins: { zoom: { pan: { enabled: true, mode: 'x' }, zoom: { wheel: { enabled: false }, mode: 'x' } } }
    });

    chart1 = new Chart(document.getElementById('chart1'), { type: 'line', data: { datasets: [] }, options: getOptions() });
    chart2 = new Chart(document.getElementById('chart2'), { type: 'line', data: { datasets: [] }, options: getOptions() });
    chart3 = new Chart(document.getElementById('chart3'), { type: 'line', data: { datasets: [] }, options: getOptions() });
}

async function updateData() {
    try {
        const res = await fetch('/api/history');
        const rawData = await res.json();
        const data = Array.isArray(rawData) ? rawData : Object.values(rawData);
        if (!data.length) return;

        data.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Mapeo de IDs de Firebase (Asegúrate que tus dispositivos envíen estos IDs)
        const deviceIds = ['Estacion_1', 'Estacion_2', 'Estacion_3'];
        const charts = [chart1, chart2, chart3];

        deviceIds.forEach((id, index) => {
            const d = data.filter(i => i.device_id === id);
            if (charts[index] && d.length > 0) {
                const last = d[d.length - 1];
                const clean = (key) => d.map(i => (i[key] != null && i[key] > -100) ? i[key] : null);

                charts[index].data.labels = d.map(i => new Date(i.timestamp));
                charts[index].data.datasets = [
                    { label: 'Ambiente', data: clean('t_aht'), borderColor: '#f1c40f', yAxisID: 'y' },
                    { label: 'Humedad', data: clean('h_aht'), borderColor: '#3498db', yAxisID: 'y1', borderDash: [5, 5] },
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
    const fmt = (v) => v ? parseFloat(v).toFixed(1) : "--";
    // Tabla Ambiente
    document.getElementById(`d${id}-t`).textContent = fmt(l.t_aht) + "°C";
    document.getElementById(`d${id}-h`).textContent = fmt(l.h_aht) + "%";
    // Sondas
    document.getElementById(`d${id}-s1`).textContent = fmt(l.t1) + "°C";
    document.getElementById(`d${id}-s2`).textContent = fmt(l.t2) + "°C";
    document.getElementById(`d${id}-s3`).textContent = fmt(l.t3) + "°C";
    document.getElementById(`d${id}-s4`).textContent = fmt(l.t4) + "°C";
    // RSSI
    document.getElementById(`d${id}-rssi`).textContent = (l.rssi || "--") + " dBm";
    if(id === 1) document.getElementById('currentTime').textContent = "Sincronizado: " + new Date(l.timestamp).toLocaleTimeString();
}

function goToDate(chart, dateStr) {
    if (!dateStr) return;
    const start = new Date(dateStr + "T00:00:00").getTime();
    const end = start + (86400000);
    chart.options.scales.x.min = start;
    chart.options.scales.x.max = end;
    chart.update();
}
