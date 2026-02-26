/**
 * Dashboard Multi-sensor LoRa - Versión Multi-dispositivo (Firebase)
 */

let tempChart, dev2Chart; // Cambiamos el nombre para mayor claridad

document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    fetchAndDrawHistoricalData();
    setInterval(fetchAndDrawHistoricalData, 30000);
});

function initCharts() {
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom' }
        },
        scales: {
            x: { 
                type: 'time', 
                time: { unit: 'minute', displayFormats: { minute: 'HH:mm' } },
                title: { display: true, text: 'Hora' }
            },
            y: { 
                beginAtZero: false,
                title: { display: true, text: 'Temperatura (°C)' } // Título genérico de temperatura
            }
        }
    };

    // Gráfico 1: Dispositivo 1
    const ctx1 = document.getElementById('tempChart')?.getContext('2d');
    if (ctx1) {
        tempChart = new Chart(ctx1, {
            type: 'line',
            data: { datasets: [] },
            options: {
                ...commonOptions,
                plugins: {
                    ...commonOptions.plugins,
                    title: { display: true, text: 'Historial Dispositivo 1 (Ambiente + Sondas)' }
                }
            }
        });
    }

    // Gráfico 2: Dispositivo 2 (CORREGIDO: Ya no es de Humedad)
    const ctx2 = document.getElementById('batteryChart')?.getContext('2d');
    if (ctx2) {
        dev2Chart = new Chart(ctx2, {
            type: 'line',
            data: { datasets: [] },
            options: {
                ...commonOptions, // Usamos las mismas opciones que la de arriba
                plugins: {
                    ...commonOptions.plugins,
                    title: { display: true, text: 'Historial Dispositivo 2 (Sondas 1-4)' }
                }
            }
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

        const dataDev1 = data.filter(item => item.device_id === 'Estacion_Remota' || item.device_id === 'Dispositivo_1');
        const dataDev2 = data.filter(item => item.device_id === 'Dispositivo_2');

        const clean = (arr, key) => arr.map(item => {
            const val = parseFloat(item[key]);
            return (!isNaN(val) && val > -120) ? val : null;
        });

        // --- ACTUALIZAR GRÁFICA DISPOSITIVO 1 ---
        if (tempChart && dataDev1.length > 0) {
            tempChart.data.labels = dataDev1.map(item => new Date(item.timestamp));
            tempChart.data.datasets = [
                { label: 'Ambiente', data: clean(dataDev1, 't_aht'), borderColor: '#ff6384', tension: 0.3 },
                { label: 'S1', data: clean(dataDev1, 't1'), borderColor: '#ff9f40' },
                { label: 'S2', data: clean(dataDev1, 't2'), borderColor: '#4bc0c0' },
                { label: 'S3', data: clean(dataDev1, 't3'), borderColor: '#9966ff' },
                { label: 'S4', data: clean(dataDev1, 't4'), borderColor: '#c9cbcf' }
            ];
            tempChart.update('none');
            updateUIDev1(dataDev1[dataDev1.length - 1]);
        }

        // --- ACTUALIZAR GRÁFICA DISPOSITIVO 2 (CORREGIDO) ---
        if (dev2Chart && dataDev2.length > 0) {
            dev2Chart.data.labels = dataDev2.map(item => new Date(item.timestamp));
            dev2Chart.data.datasets = [
                { label: 'S1 (D2)', data: clean(dataDev2, 't1'), borderColor: '#2ecc71' },
                { label: 'S2 (D2)', data: clean(dataDev2, 't2'), borderColor: '#27ae60' },
                { label: 'S3 (D2)', data: clean(dataDev2, 't3'), borderColor: '#e67e22' },
                { label: 'S4 (D2)', data: clean(dataDev2, 't4'), borderColor: '#d35400' }
            ];
            dev2Chart.update('none');
            updateUIDev2(dataDev2[dataDev2.length - 1]);
        }

    } catch (error) {
        console.error('Error al procesar datos:', error);
    }
}

function updateUIDev1(last) {
    const fmt = (val) => (val != null && val > -120) ? parseFloat(val).toFixed(1) : "--";
    setText('current-temp1-value', `${fmt(last.t_aht)} °C`);
    setText('current-humidity-value', `${fmt(last.h_aht)} %`);
    setText('current-signal-value', `${last.rssi || "--"} dBm`);
    setText('val-t1', fmt(last.t1));
    setText('val-t2', fmt(last.t2));
    setText('val-t3', fmt(last.t3));
    setText('val-t4', fmt(last.t4));
    if (last.timestamp) setText('currentTime', `Sincronizado: ${new Date(last.timestamp).toLocaleTimeString()}`);
}

function updateUIDev2(last) {
    const fmt = (val) => (val != null && val > -120) ? parseFloat(val).toFixed(1) : "--";
    setText('dev2-t1', fmt(last.t1));
    setText('dev2-t2', fmt(last.t2));
    setText('dev2-t3', fmt(last.t3));
    setText('dev2-t4', fmt(last.t4));
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}
