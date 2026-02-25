// Variable global para las instancias de las gráficas
let tempChartInstance, humidityChartInstance; 

// --- FUNCIONES DE GESTIÓN (Mantenidas del original) ---
function showMessage(type, content) {
    const container = document.getElementById('message-container');
    if(!container) return;
    container.textContent = content;
    container.className = `message-container ${type}`;
    container.classList.remove('hidden');
    setTimeout(() => container.classList.add('hidden'), 5000);
}

// ... (buttonZoom, moveTime, jumpToTime se mantienen igual)

/**
 * Función auxiliar para crear o actualizar una gráfica.
 */
function drawChart(canvasId, datasets, labels, yAxisConfig = {}, xAxisConfig = {}) {
    const canvas = document.getElementById(canvasId);
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    let chartInstance = window[canvasId + 'Instance']; 

    if (chartInstance) { chartInstance.destroy(); }
    
    const formattedDatasets = datasets.map(ds => ({
        label: ds.label,
        data: ds.data.map((val, index) => ({ x: labels[index], y: val })),
        borderColor: ds.color,
        backgroundColor: ds.color.replace('rgb', 'rgba').replace(')', ', 0.2)'),
        tension: 0.3, 
        pointRadius: 2,
        fill: false 
    }));

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: formattedDatasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { ...xAxisConfig, type: 'time', time: { unit: 'second', displayFormats: { second: 'HH:mm:ss' } } },
                y: { ...yAxisConfig, beginAtZero: false }
            },
            plugins: { zoom: { pan: { enabled: true, mode: 'x' }, zoom: { mode: 'x' } } }
        }
    });
    window[canvasId + 'Instance'] = chartInstance;
}

// Actualiza icono de señal
function updateSignalIcon(rssiValue) {
    const iconElement = document.getElementById('signal-icon');
    const rssiNum = parseInt(rssiValue);
    if (!iconElement) return;
    iconElement.className = 'fa-solid ' + (rssiNum > -100 ? 'fa-signal' : 'fa-ban');
}

// --- FUNCIÓN PRINCIPAL DE DATOS ---
async function fetchAndDrawHistoricalData(forceReset = false) {
    try {
        const response = await fetch('/api/history'); 
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const data = await response.json();
        
        if (data.length === 0) return;

        const lastReading = data[data.length - 1];
        const labels = data.map(item => item.timestamp);

        // 1. MAPEADO DE LOS NUEVOS DATOS (t_aht, h_aht, t1, t2, t3, t4)
        const mapData = (key) => data.map(item => (typeof item[key] === 'number' && item[key] !== -99.9) ? item[key] : null);

        const t_aht = mapData('t_aht');
        const h_aht = mapData('h_aht');
        const t1 = mapData('t1');
        const t2 = mapData('t2');
        const t3 = mapData('t3');
        const t4 = mapData('t4');

        // 2. CONFIGURACIÓN EJE X
        const endTime = new Date(lastReading.timestamp).getTime();
        const startTime = new Date(data[0].timestamp).getTime();
        const xAxisConfig = { min: startTime, max: endTime };

        // 3. DIBUJAR GRÁFICA DE TEMPERATURAS (AHT + 4 Sondas)
        const tempDatasets = [
            { label: 'Ambiente (AHT)', data: t_aht, color: 'rgb(255, 99, 132)' },
            { label: 'Sonda 1', data: t1, color: 'rgb(255, 159, 64)' },
            { label: 'Sonda 2', data: t2, color: 'rgb(75, 192, 192)' },
            { label: 'Sonda 3', data: t3, color: 'rgb(153, 102, 255)' },
            { label: 'Sonda 4', data: t4, color: 'rgb(201, 203, 207)' }
        ];
        drawChart('tempChart', tempDatasets, labels, { title: { display: true, text: 'Temperaturas (°C)' } }, xAxisConfig);

        // 4. DIBUJAR GRÁFICA DE HUMEDAD (Usando el segundo canvas)
        const humDatasets = [
            { label: 'Humedad %', data: h_aht, color: 'rgb(54, 162, 235)' }
        ];
        drawChart('batteryChart', humDatasets, labels, { min: 0, max: 100 }, xAxisConfig);

        // 5. ACTUALIZAR CAJAS DE TEXTO
        document.getElementById('current-temp1-value').textContent = `${lastReading.t_aht.toFixed(1)} °C`;
        
        // Actualizar valores de las sondas (si tienes IDs para ellos)
        const dsVal = (val) => (val === -99.9) ? "ERR" : val.toFixed(1);
        
        // Si quieres mostrar la T1 en la caja de 'temp2'
        const temp2Box = document.getElementById('current-temp2-value');
        if(temp2Box) temp2Box.textContent = `S1: ${dsVal(lastReading.t1)} °C`;

        document.getElementById('current-humidity-value').textContent = `${lastReading.h_aht.toFixed(1)} %`;
        document.getElementById('current-signal-value').textContent = `${lastReading.rssi} dBm`;
        
        const lastTime = new Date(lastReading.timestamp).toLocaleTimeString();
        document.getElementById('currentTime').textContent = `Última: ${lastTime}`;

        updateSignalIcon(lastReading.rssi);

    } catch (error) {
        console.error('Error en Dashboard:', error);
        document.getElementById('currentTime').textContent = 'Error de conexión';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    fetchAndDrawHistoricalData();
    setInterval(fetchAndDrawHistoricalData, 30000);
});
