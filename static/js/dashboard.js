/**
 * Dashboard Multi-sensor LoRa - Versión Multi-dispositivo (Firebase)
 */

let tempChart, humChart;

document.addEventListener('DOMContentLoaded', () => {
    // Inicialización de gráficos y carga de datos
    initCharts();
    fetchAndDrawHistoricalData();

    // Refresco automático cada 30 segundos
    setInterval(() => {
        console.log("Actualizando datos de dispositivos...");
        fetchAndDrawHistoricalData();
    }, 30000);
});

/**
 * Configuración inicial de Chart.js
 */
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
                title: { display: true, text: 'Valor' }
            }
        }
    };

    // Gráfico 1: Todo el Dispositivo 1 (Ambiente + 4 Sondas)
    const ctxTemp = document.getElementById('tempChart')?.getContext('2d');
    if (ctxTemp) {
        tempChart = new Chart(ctxTemp, {
            type: 'line',
            data: { datasets: [] },
            options: {
                ...commonOptions,
                plugins: {
                    ...commonOptions.plugins,
                    title: { display: true, text: 'Historial Dispositivo 1' }
                }
            }
        });
    }

    // Gráfico 2: Todo el Dispositivo 2 (4 Sondas)
    const ctxHum = document.getElementById('batteryChart')?.getContext('2d');
    if (ctxHum) {
        humChart = new Chart(ctxHum, {
            type: 'line',
            data: { datasets: [] },
            options: {
                ...commonOptions,
                plugins: {
                    ...commonOptions.plugins,
                    title: { display: true, text: 'Historial Dispositivo 2' }
                }
            }
        });
    }
}

/**
 * Función principal de obtención y procesado de datos
 */
async function fetchAndDrawHistoricalData() {
    try {
        const response = await fetch('/api/history');
        const rawData = await response.json();
        
        // Convertir objeto de Firebase a Array y ordenar por tiempo
        let data = Array.isArray(rawData) ? rawData : Object.values(rawData);
        if (!data || data.length === 0) return;
        
        data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Separar datos por ID de dispositivo
        const dataDev1 = data.filter(item => item.device_id === 'Estacion_Remota' || item.device_id === 'Dispositivo_1');
        const dataDev2 = data.filter(item => item.device_id === 'Dispositivo_2');

        // Helper para limpiar datos erróneos (-127)
        const clean = (arr, key) => arr.map(item => {
            const val = parseFloat(item[key]);
            return (!isNaN(val) && val > -120) ? val : null;
        });

        // --- ACTUALIZAR GRÁFICA DISPOSITIVO 1 ---
        if (tempChart && dataDev1.length > 0) {
            const labels1 = dataDev1.map(item => new Date(item.timestamp));
            tempChart.data.labels = labels1;
            tempChart.data.datasets = [
                { label: 'Ambiente', data: clean(dataDev1, 't_aht'), borderColor: '#ff6384', tension: 0.3 },
                { label: 'S1', data: clean(dataDev1, 't1'), borderColor: '#ff9f40', tension: 0.1 },
                { label: 'S2', data: clean(dataDev1, 't2'), borderColor: '#4bc0c0', tension: 0.1 },
                { label: 'S3', data: clean(dataDev1, 't3'), borderColor: '#9966ff', tension: 0.1 },
                { label: 'S4', data: clean(dataDev1, 't4'), borderColor: '#c9cbcf', tension: 0.1 }
            ];
            tempChart.update('none');
            
            // Actualizar tarjetas del Dispositivo 1
            updateUIDev1(dataDev1[dataDev1.length - 1]);
        }

        // --- ACTUALIZAR GRÁFICA DISPOSITIVO 2 ---
        if (humChart && dataDev2.length > 0) {
            const labels2 = dataDev2.map(item => new Date(item.timestamp));
            humChart.data.labels = labels2;
            humChart.data.datasets = [
                { label: 'S1 (D2)', data: clean(dataDev2, 't1'), borderColor: '#2ecc71', tension: 0.1 },
                { label: 'S2 (D2)', data: clean(dataDev2, 't2'), borderColor: '#27ae60', tension: 0.1 },
                { label: 'S3 (D2)', data: clean(dataDev2, 't3'), borderColor: '#e67e22', tension: 0.1 },
                { label: 'S4 (D2)', data: clean(dataDev2, 't4'), borderColor: '#d35400', tension: 0.1 }
            ];
            humChart.update('none');
            
            // Actualizar tarjetas del Dispositivo 2
            updateUIDev2(dataDev2[dataDev2.length - 1]);
        }

    } catch (error) {
        console.error('Error al procesar datos:', error);
    }
}

/**
 * Actualiza la UI del Dispositivo 1 (Ambiente, Humedad, Sondas 1-4 y Señal)
 */
function updateUIDev1(last) {
    const fmt = (val) => (val != null && val > -120) ? parseFloat(val).toFixed(1) : "--";
    
    setText('current-temp1-value', `${fmt(last.t_aht)} °C`);
    setText('current-humidity-value', `${fmt(last.h_aht)} %`);
    setText('current-signal-value', `${last.rssi || "--"} dBm`);
    
    setText('val-t1', fmt(last.t1));
    setText('val-t2', fmt(last.t2));
    setText('val-t3', fmt(last.t3));
    setText('val-t4', fmt(last.t4));

    if (last.timestamp) {
        setText('currentTime', `Sincronizado: ${new Date(last.timestamp).toLocaleTimeString()}`);
    }
}

/**
 * Actualiza la UI del Dispositivo 2 (Sondas 5-8 o S1-S4 del segundo dev)
 */
function updateUIDev2(last) {
    const fmt = (val) => (val != null && val > -120) ? parseFloat(val).toFixed(1) : "--";
    
    setText('dev2-t1', fmt(last.t1));
    setText('dev2-t2', fmt(last.t2));
    setText('dev2-t3', fmt(last.t3));
    setText('dev2-t4', fmt(last.t4));
}

/**
 * Helper para evitar errores si un ID no existe en el HTML
 */
function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}
