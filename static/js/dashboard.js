/**
 * Dashboard Multi-sensor LoRa - Versión Firebase
 * Maneja la obtención de datos, renderizado de gráficas y actualización en tiempo real.
 */

let tempChart, batteryChart;

document.addEventListener('DOMContentLoaded', () => {
    // Configuración inicial de los gráficos
    initCharts();
    
    // Carga inicial de datos
    fetchAndDrawHistoricalData();

    // PUNTO 2: Refresco automático cada 30 segundos
    setInterval(() => {
        console.log("Actualizando datos automáticamente...");
        fetchAndDrawHistoricalData();
    }, 30000); 
});

/**
 * Inicializa las instancias de Chart.js
 */
function initCharts() {
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { type: 'time', time: { unit: 'minute', displayFormats: { minute: 'HH:mm' } } },
            y: { beginAtZero: false }
        },
        plugins: { legend: { position: 'bottom' } }
    };

    const ctxTemp = document.getElementById('tempChart').getContext('2d');
    tempChart = new Chart(ctxTemp, {
        type: 'line',
        data: { datasets: [] },
        options: commonOptions
    });

    const ctxHum = document.getElementById('batteryChart').getContext('2d');
    batteryChart = new Chart(ctxHum, {
        type: 'line',
        data: { datasets: [] },
        options: { ...commonOptions, scales: { ...commonOptions.scales, y: { min: 0, max: 100 } } }
    });
}

/**
 * Obtiene el historial desde Flask (que lee de Firebase) y actualiza la UI
 */
async function fetchAndDrawHistoricalData() {
    try {
        const response = await fetch('/api/history');
        if (!response.ok) throw new Error('Error al obtener historial');
        
        const data = await response.json();
        if (!data || data.length === 0) return;

        // 1. Preparar etiquetas (Eje X)
        const labels = data.map(item => new Date(item.timestamp));
        const lastReading = data[data.length - 1];

        // 2. Helper para extraer datos filtrando errores de sonda (-127)
        const getCleanData = (key) => data.map(item => {
            const val = item[key];
            return (val !== null && val > -120) ? val : null;
        });

        // 3. Actualizar Gráfica de Temperaturas
        tempChart.data.labels = labels;
        tempChart.data.datasets = [
            { label: 'Ambiente', data: getCleanData('t_aht'), borderColor: '#ff6384', tension: 0.3 },
            { label: 'Sonda 1', data: getCleanData('t1'), borderColor: '#ff9f40', tension: 0.3 },
            { label: 'Sonda 2', data: getCleanData('t2'), borderColor: '#4bc0c0', tension: 0.3 },
            { label: 'Sonda 3', data: getCleanData('t3'), borderColor: '#9966ff', tension: 0.3 },
            { label: 'Sonda 4', data: getCleanData('t4'), borderColor: '#c9cbcf', tension: 0.3 }
        ];
        tempChart.update('none');

        // 4. Actualizar Gráfica de Humedad
        batteryChart.data.labels = labels;
        batteryChart.data.datasets = [
            { label: 'Humedad %', data: getCleanData('h_aht'), borderColor: '#36a2eb', fill: true, backgroundColor: 'rgba(54, 162, 235, 0.1)' }
        ];
        batteryChart.update('none');

        // 5. Actualizar Cajas de Datos Actuales (Cards)
        updateCards(lastReading);

    } catch (error) {
        console.error('Error en el dashboard:', error);
    }
}

/**
 * Actualiza los valores de texto en las tarjetas superiores
 */
function updateCards(last) {
    const fmt = (val) => (val !== null && val !== undefined) ? val.toFixed(1) : "--";
    const fmtSonda = (val) => (val === null || val <= -120) ? "ERR" : val.toFixed(1);

    // Valores principales
    document.getElementById('current-temp1-value').textContent = `${fmt(last.t_aht)} °C`;
    document.getElementById('current-humidity-value').textContent = `${fmt(last.h_aht)} %`;
    document.getElementById('current-signal-value').textContent = `${last.rssi || "--"} dBm`;

    // Sondas Dallas
    if(document.getElementById('val-t1')) document.getElementById('val-t1').textContent = fmtSonda(last.t1);
    if(document.getElementById('val-t2')) document.getElementById('val-t2').textContent = fmtSonda(last.t2);
    if(document.getElementById('val-t3')) document.getElementById('val-t3').textContent = fmtSonda(last.t3);
    if(document.getElementById('val-t4')) document.getElementById('val-t4').textContent = fmtSonda(last.t4);

    // Hora de actualización
    const fecha = new Date(last.timestamp);
    document.getElementById('currentTime').textContent = `Sincronizado: ${fecha.toLocaleTimeString()}`;
}
