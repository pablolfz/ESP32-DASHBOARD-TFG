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
        elements: {
            line: { borderWidth: 3, tension: 0.3 },
            point: { radius: 3 }
        },
        plugins: {
            legend: { 
                position: 'bottom',
                labels: { font: { size: 16, weight: 'bold' } }
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
                title: { display: true, text: 'Temperatura (°C)', font: { size: 18, weight: 'bold' } },
                ticks: { font: { size: 15 } },
                grid: { color: 'rgba(0, 0, 0, 0.1)' }
            }
        }
    };

    const ctx1 = document.getElementById('tempChart');
    const ctx2 = document.getElementById('batteryChart');

    if (ctx1) chart1 = new Chart(ctx1, { type: 'line', data: { datasets: [] }, options: commonOptions });
    if (ctx2) chart2 = new Chart(ctx2, { type: 'line', data: { datasets: [] }, options: commonOptions });
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
                { label: 'Ambiente', data: clean(d1, 't_aht'), borderColor: '#f1c40f' },
                { label: 'S1', data: clean(d1, 't1'), borderColor: '#e67e22' },
                { label: 'S2', data: clean(d1, 't2'), borderColor: '#3498db' },
                { label: 'S3', data: clean(d1, 't3'), borderColor: '#9b59b6' },
                { label: 'S4', data: clean(d1, 't4'), borderColor: '#95a5a6' }
            ];
            chart1.update();
            refreshUI(d1[d1.length-1], 'dev1');
        }

        if (chart2 && d2.length) {
            chart2.data.labels = d2.map(i => new Date(i.timestamp));
            chart2.data.datasets = [
                { label: 'D2-S1', data: clean(d2, 't1'), borderColor: '#2ecc71' },
                { label: 'D2-S2', data: clean(d2, 't2'), borderColor: '#27ae60' },
                { label: 'D2-S3', data: clean(d2, 't3'), borderColor: '#e67e22' },
                { label: 'D2-S4', data: clean(d2, 't4'), borderColor: '#d35400' }
            ];
            chart2.update();
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
        document.getElementById('val-t2').textContent = fmt(last.t2);
        document.getElementById('val-t3').textContent = fmt(last.t3);
        document.getElementById('val-t4').textContent = fmt(last.t4);
        document.getElementById('current-signal-value').textContent = (last.rssi || "--") + " dBm";
        document.getElementById('currentTime').textContent = "Sincronizado: " + new Date(last.timestamp).toLocaleTimeString();
    } else {
        document.getElementById('dev2-t1').textContent = fmt(last.t1);
        document.getElementById('dev2-t2').textContent = fmt(last.t2);
        document.getElementById('dev2-t3').textContent = fmt(last.t3);
        document.getElementById('dev2-t4').textContent = fmt(last.t4);
    }
}
