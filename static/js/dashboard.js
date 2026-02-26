let chart1, chart2;

document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    fetchData();
    setInterval(fetchData, 30000); // 30 segundos
});

function initCharts() {
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { type: 'time', time: { unit: 'minute', displayFormats: { minute: 'HH:mm' } } },
            y: { title: { display: true, text: 'Temp (°C)' } }
        }
    };

    chart1 = new Chart(document.getElementById('chart1'), {
        type: 'line', data: { datasets: [] }, options: options
    });
    chart2 = new Chart(document.getElementById('chart2'), {
        type: 'line', data: { datasets: [] }, options: options
    });
}

async function fetchData() {
    try {
        const res = await fetch('/api/history');
        const raw = await res.json();
        let data = Array.isArray(raw) ? raw : Object.values(raw);
        if (!data.length) return;

        data.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));

        const d1 = data.filter(i => i.device_id === 'Estacion_Remota' || i.device_id === 'Dispositivo_1');
        const d2 = data.filter(i => i.device_id === 'Dispositivo_2');

        const clean = (arr, key) => arr.map(i => (i[key] > -120) ? i[key] : null);

        if (d1.length) {
            chart1.data.labels = d1.map(i => new Date(i.timestamp));
            chart1.data.datasets = [
                { label: 'Amb', data: clean(d1, 't_aht'), borderColor: '#ff6384' },
                { label: 'S1', data: clean(d1, 't1'), borderColor: '#ff9f40' },
                { label: 'S2', data: clean(d1, 't2'), borderColor: '#4bc0c0' },
                { label: 'S3', data: clean(d1, 't3'), borderColor: '#9966ff' },
                { label: 'S4', data: clean(d1, 't4'), borderColor: '#c9cbcf' }
            ];
            chart1.update('none');
            updateUI(d1[d1.length-1], 'dev1');
        }

        if (d2.length) {
            chart2.data.labels = d2.map(i => new Date(i.timestamp));
            chart2.data.datasets = [
                { label: 'S1', data: clean(d2, 't1'), borderColor: '#2ecc71' },
                { label: 'S2', data: clean(d2, 't2'), borderColor: '#27ae60' },
                { label: 'S3', data: clean(d2, 't3'), borderColor: '#e67e22' },
                { label: 'S4', data: clean(d2, 't4'), borderColor: '#d35400' }
            ];
            chart2.update('none');
            updateUI(d2[d2.length-1], 'dev2');
        }
    } catch (e) { console.error(e); }
}

function updateUI(last, dev) {
    const fmt = (v) => (v != null && v > -120) ? v.toFixed(1) : "--";
    if (dev === 'dev1') {
        document.getElementById('current-temp1-value').textContent = `${fmt(last.t_aht)} °C`;
        document.getElementById('current-humidity-value').textContent = `${fmt(last.h_aht)} %`;
        document.getElementById('current-signal-value').textContent = `${last.rssi || "--"} dBm`;
        document.getElementById('val-t1').textContent = fmt(last.t1);
        document.getElementById('val-t2').textContent = fmt(last.t2);
        document.getElementById('val-t3').textContent = fmt(last.t3);
        document.getElementById('val-t4').textContent = fmt(last.t4);
        document.getElementById('currentTime').textContent = `Sincronizado: ${new Date(last.timestamp).toLocaleTimeString()}`;
    } else {
        document.getElementById('dev2-t1').textContent = fmt(last.t1);
        document.getElementById('dev2-t2').textContent = fmt(last.t2);
        document.getElementById('dev2-t3').textContent = fmt(last.t3);
        document.getElementById('dev2-t4').textContent = fmt(last.t4);
    }
}
