let chart1, chart2;

document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    updateData();
    setInterval(updateData, 30000);
});

function initCharts() {
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom', labels: { font: { size: 16, weight: 'bold' } } },
            zoom: {
                pan: { enabled: true, mode: 'x' },
                zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
            }
        },
        scales: {
            x: { 
                type: 'time', 
                time: { unit: 'minute', displayFormats: { minute: 'HH:mm' } },
                title: { display: true, text: 'Hora', font: { size: 18, weight: 'bold' } },
                ticks: { font: { size: 14 } }
            },
            y: { 
                title: { display: true, text: 'Temp (°C)', font: { size: 18, weight: 'bold' } },
                ticks: { font: { size: 15 } }
            }
        }
    };

    chart1 = new Chart(document.getElementById('tempChart'), { type: 'line', data: { datasets: [] }, options: commonOptions });
    chart2 = new Chart(document.getElementById('batteryChart'), { type: 'line', data: { datasets: [] }, options: commonOptions });
}

// Lógica de movimiento lateral
function moveChart(chart, pct) {
    const scale = chart.scales.x;
    const range = scale.max - scale.min;
    const amount = range * pct;
    scale.options.min = scale.min + amount;
    scale.options.max = scale.max + amount;
    chart.update('none');
}

// Lógica para ir a un día concreto
function goToDate(chart, dateStr) {
    if (!dateStr) return;
    const start = new Date(dateStr + "T00:00:00").getTime();
    const end = start + (24 * 60 * 60 * 1000);
    chart.options.scales.x.min = start;
    chart.options.scales.x.max = end;
    chart.update();
}

async function updateData() {
    try {
        const res = await fetch('/api/history');
        const raw = await res.json();
        let data = Array.isArray(raw) ? raw : Object.values(raw);
        if (!data.length) return;

        data.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));

        const d1 = data.filter(i => i.device_id === 'Estacion_Remota' || i.device_id === 'Dispositivo_1');
        const d2 = data.filter(i => i.device_id === 'Dispositivo_2');

        const clean = (arr, key) => arr.map(i => (i[key] != null && i[key] > -100) ? i[key] : null);

        if (chart1 && d1.length) {
            chart1.data.labels = d1.map(i => new Date(i.timestamp));
            chart1.data.datasets = [
                { label: 'Ambiente', data: clean(d1, 't_aht'), borderColor: '#f1c40f', borderWidth: 3 },
                { label: 'S1', data: clean(d1, 't1'), borderColor: '#e67e22', borderWidth: 3 }
            ];
            chart1.update('none');
            refreshUI(d1[d1.length-1], 'dev1');
        }
        if (chart2 && d2.length) {
            chart2.data.labels = d2.map(i => new Date(i.timestamp));
            chart2.data.datasets = [{ label: 'S1', data: clean(d2, 't1'), borderColor: '#2ecc71', borderWidth: 3 }];
            chart2.update('none');
            refreshUI(d2[d2.length-1], 'dev2');
        }
    } catch (e) { console.error(e); }
}

function refreshUI(last, dev) {
    const fmt = (v) => (v != null && v > -100) ? parseFloat(v).toFixed(1) : "--";
    if (dev === 'dev1') {
        document.getElementById('current-temp1-value').textContent = fmt(last.t_aht) + " °C";
        document.getElementById('current-humidity-value').textContent = fmt(last.h_aht) + " %";
        document.getElementById('val-t1').textContent = fmt(last.t1);
        document.getElementById('currentTime').textContent = "Sincronizado: " + new Date(last.timestamp).toLocaleTimeString();
        document.getElementById('current-signal-value').textContent = (last.rssi || "--") + " dBm";
    } else {
        document.getElementById('dev2-t1').textContent = fmt(last.t1);
    }
}
