let chart1, chart2;

document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    fetchData();
    setInterval(fetchData, 30000); // Refresco cada 30 segundos
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

    const ctx1 = document.getElementById('tempChart');
    const ctx2 = document.getElementById('batteryChart');

    if (ctx1) chart1 = new Chart(ctx1, { type: 'line', data: { datasets: [] }, options: options });
    if (ctx2) chart2 = new Chart(ctx2, { type: 'line', data: { datasets: [] }, options: options });
}

async function fetchData() {
    try {
        const res = await fetch('/api/history');
        const raw = await res.json();
        
        // Convertir a array si es un objeto
        let data = Array.isArray(raw) ? raw : Object.values(raw);
        
        if (!data || data.length === 0) {
            console.log("Esperando datos de Firebase...");
            return;
        }

        // Ordenar por tiempo
        data.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Separar dispositivos
        const d1 = data.filter(i => i.device_id === 'Estacion_Remota' || i.device_id === 'Dispositivo_1');
        const d2 = data.filter(i => i.device_id === 'Dispositivo_2');

        const clean = (arr, key) => arr.map(i => (i[key] !== undefined && i[key] > -120) ? i[key] : null);

        // --- ACTUALIZAR DISPOSITIVO 1 ---
        if (d1.length > 0) {
            if (chart1) {
                chart1.data.labels = d1.map(i => new Date(i.timestamp));
                chart1.data.datasets = [
                    { label: 'Ambiente', data: clean(d1, 't_aht'), borderColor: '#f1c40f', tension: 0.3 },
                    { label: 'S1', data: clean(d1, 't1'), borderColor: '#e67e22' },
                    { label: 'S2', data: clean(d1, 't2'), borderColor: '#3498db' },
                    { label: 'S3', data: clean(d1, 't3'), borderColor: '#9b59b6' },
                    { label: 'S4', data: clean(d1, 't4'), borderColor: '#95a5a6' }
                ];
                chart1.update('none');
            }
            updateUI(d1[d1.length - 1], 'dev1');
        }

        // --- ACTUALIZAR DISPOSITIVO 2 ---
        if (d2.length > 0) {
            if (chart2) {
                chart2.data.labels = d2.map(i => new Date(i.timestamp));
                chart2.data.datasets = [
                    { label: 'S1', data: clean(d2, 't1'), borderColor: '#2ecc71' },
                    { label: 'S2', data: clean(d2, 't2'), borderColor: '#27ae60' },
                    { label: 'S3', data: clean(d2, 't3'), borderColor: '#16a085' },
                    { label: 'S4', data: clean(d2, 't4'), borderColor: '#1abc9c' }
                ];
                chart2.update('none');
            }
            updateUI(d2[d2.length - 1], 'dev2');
        }
    } catch (e) {
        console.error("Error en fetchData:", e);
    }
}

function updateUI(last, dev) {
    const fmt = (v) => (v != null && v > -120) ? parseFloat(v).toFixed(1) : "--";
    
    if (dev === 'dev1') {
        const ids = {
            'current-temp1-value': fmt(last.t_aht) + " °C",
            'current-humidity-value': fmt(last.h_aht) + " %",
            'current-signal-value': (last.rssi || "--") + " dBm",
            'val-t1': fmt(last.t1),
            'val-t2': fmt(last.t2),
            'val-t3': fmt(last.t3),
            'val-t4': fmt(last.t4)
        };
        for (let id in ids) {
            let el = document.getElementById(id);
            if (el) el.textContent = ids[id];
        }
        let timeEl = document.getElementById('currentTime');
        if (timeEl) timeEl.textContent = "Sincronizado: " + new Date(last.timestamp).toLocaleTimeString();
    } else {
        const ids = {
            'dev2-t1': fmt(last.t1),
            'dev2-t2': fmt(last.t2),
            'dev2-t3': fmt(last.t3),
            'dev2-t4': fmt(last.t4)
        };
        for (let id in ids) {
            let el = document.getElementById(id);
            if (el) el.textContent = ids[id];
        }
    }
}
