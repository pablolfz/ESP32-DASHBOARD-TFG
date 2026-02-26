let chartDev1, chartDev2;

document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    fetchAndDrawHistoricalData();
    // Refresco automático cada 30 segundos
    setInterval(fetchAndDrawHistoricalData, 30000);
});

function initCharts() {
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        scales: {
            x: { type: 'time', time: { unit: 'minute', displayFormats: { minute: 'HH:mm' } } },
            y: { title: { display: true, text: 'Temp (°C)' } }
        }
    };

    const ctx1 = document.getElementById('tempChart')?.getContext('2d');
    if (ctx1) {
        chartDev1 = new Chart(ctx1, {
            type: 'line',
            data: { datasets: [] },
            options: commonOptions
        });
    }

    const ctx2 = document.getElementById('batteryChart')?.getContext('2d');
    if (ctx2) {
        chartDev2 = new Chart(ctx2, {
            type: 'line',
            data: { datasets: [] },
            options: commonOptions
        });
    }
}

async function fetchAndDrawHistoricalData() {
    try {
        const response = await fetch('/api/history');
        const rawData = await response.json();
        
        let data = Array.isArray(rawData) ? rawData : Object.values(rawData);
        if (!data || data.length === 0) return;
        
        data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Filtrado por Dispositivo
        const dataDev1 = data.filter(item => item.device_id === 'Estacion_Remota' || item.device_id === 'Dispositivo_1');
        const dataDev2 = data.filter(item => item.device_id === 'Dispositivo_2');

        const clean = (arr, key) => arr.map(item => {
            const val = parseFloat(item[key]);
            return (!isNaN(val) && val > -120) ? val : null;
        });

        // Gráfica 1
        if (chartDev1 && dataDev1.length > 0) {
            chartDev1.data.labels = dataDev1.map(item => new Date(item.timestamp));
            chartDev1.data.datasets = [
                { label: 'Ambiente', data: clean(dataDev1, 't_aht'), borderColor: '#ff6384', tension: 0.3 },
                { label: 'S1', data: clean(dataDev1, 't1'), borderColor: '#ff9f40' },
                { label: 'S2', data: clean(dataDev1, 't2'), borderColor: '#4bc0c0' },
                { label: 'S3', data: clean(dataDev1, 't3'), borderColor: '#9966ff' },
                { label: 'S4', data: clean(dataDev1, 't4'), borderColor: '#c9cbcf' }
            ];
            chartDev1.update('none');
            updateUI(dataDev1[dataDev1.length - 1], 'dev1');
        }

        // Gráfica 2
        if (chartDev2 && dataDev2.length > 0) {
            chartDev2.data.labels = dataDev2.map(item => new Date(item.timestamp));
            chartDev2.data.datasets = [
                { label: 'S1 (D2)', data: clean(dataDev2, 't1'), borderColor: '#2ecc71' },
                { label: 'S2 (D2)', data: clean(dataDev2, 't2'), borderColor: '#27ae60' },
                { label: 'S3 (D2)', data: clean(dataDev2, 't3'), borderColor: '#e67e22' },
                { label: 'S4 (D2)', data: clean(dataDev2, 't4'), borderColor: '#d35400' }
            ];
            chartDev2.update('none');
            updateUI(dataDev2[dataDev2.length - 1], 'dev2');
        }

    } catch (e) { console.error("Error JS:", e); }
}

function updateUI(last, dev) {
    const fmt = (val) => (val != null && val > -120) ? parseFloat(val).toFixed(1) : "--";
    
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
