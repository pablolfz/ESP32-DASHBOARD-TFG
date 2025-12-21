// Archivo: static/js/dashboard.js

// Variable global para almacenar las instancias de las gráficas
let tempChartInstance, batteryChartInstance;

// Margen fijo de resolución y límites de seguridad
const RESOLUTION_MARGIN = 0.5; 
const TEMP_MIN_SAFETY = -15;
const TEMP_MAX_SAFETY = 60;

// --- FUNCIONES DE GESTIÓN DE INTERFAZ Y CONTROL ---

function showMessage(type, content) {
    const container = document.getElementById('message-container');
    if (!container) return; // Evitar error si no existe el div
    container.textContent = content;
    container.className = `message-container ${type}`;
    container.classList.remove('hidden');

    setTimeout(() => {
        container.classList.add('hidden');
    }, 5000);
}

// ... (Funciones de Zoom: buttonZoom, resetZoom, moveTime, jumpToTime se mantienen igual) ...
// Puedes mantener las funciones de Zoom originales aquí si las usas.
// He simplificado el bloque de visualización para centrarme en la corrección de datos.

function buttonZoom(chartId, factor) {
    const chart = window[chartId + 'Instance'];
    if (chart) {
        const scale = chart.scales.x;
        const currentRange = scale.max - scale.min;
        const center = (scale.min + scale.max) / 2;
        const newRange = factor === -1 ? currentRange * 0.8 : currentRange / 0.8;
        chart.options.scales.x.min = center - newRange / 2;
        chart.options.scales.x.max = center + newRange / 2;
        chart.update();
    }
}

function resetZoom(chartId) {
    fetchAndDrawHistoricalData(true); 
}

function downloadData() {
    window.location.href = '/api/export';
    showMessage('success', 'Descargando datos CSV...');
}

async function cleanupData() {
    if (!confirm("¿Eliminar registros antiguos (>30 días)?")) return;
    try {
        const response = await fetch('/api/cleanup', { method: 'POST' });
        const result = await response.json();
        showMessage(response.ok ? 'success' : 'error', result.message);
        if (response.ok) fetchAndDrawHistoricalData(true);
    } catch (error) {
        showMessage('error', 'Error de conexión limpieza.');
    }
}

// --- FUNCIÓN PRINCIPAL DE DIBUJADO ---

function drawChart(canvasId, datasets, labels, yAxisConfig = {}, xAxisConfig = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`Canvas con ID ${canvasId} no encontrado.`);
        return;
    }
    
    const ctx = canvas.getContext('2d');
    let chartInstance = window[canvasId + 'Instance']; 

    if (chartInstance) {
        chartInstance.destroy();
    }
    
    const formattedDatasets = datasets.map(ds => ({
        label: ds.label,
        data: ds.data.map((val, index) => ({ x: labels[index], y: val })),
        borderColor: ds.color,
        backgroundColor: ds.color.replace('rgb', 'rgba').replace(')', ', 0.2)'),
        tension: 0.3, 
        pointRadius: 3, // Puntos un poco más grandes para verlos mejor
        fill: false 
    }));

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels: labels, datasets: formattedDatasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    ...xAxisConfig,
                    type: 'time', 
                    time: {
                        unit: 'minute',
                        displayFormats: { minute: 'HH:mm', hour: 'HH:mm' },
                        tooltipFormat: 'dd/MM/yyyy HH:mm:ss'
                    },
                    grid: { display: true }
                },
                y: { 
                    ...yAxisConfig, 
                    beginAtZero: false 
                }
            },
            plugins: {
                legend: { position: 'top' },
                zoom: {
                    pan: { enabled: true, mode: 'x' },
                    zoom: { wheel: { enabled: false }, mode: 'x' }
                }
            }
        }
    });

    window[canvasId + 'Instance'] = chartInstance;
}

function updateSignalIcon(rssiValue) {
    const iconElement = document.getElementById('signal-icon');
    const boxElement = document.getElementById('box-signal');
    if (!iconElement || !boxElement) return; 

    let rssiNum = parseInt(rssiValue);
    // Lógica simple de colores
    let levelClass = 'signal-level-0';
    if (rssiNum >= -75) levelClass = 'signal-level-4';
    else if (rssiNum >= -95) levelClass = 'signal-level-3';
    else if (rssiNum >= -110) levelClass = 'signal-level-2';
    else if (rssiNum > -125) levelClass = 'signal-level-1';

    // Limpiar clases anteriores
    iconElement.className = `fa-solid fa-signal ${levelClass}`;
    boxElement.className = `metric-box ${levelClass}`;
}


// --- LÓGICA DE DATOS PRINCIPAL ---

async function fetchAndDrawHistoricalData(forceReset = false) {
    console.log("🔄 Actualizando datos...");

    try {
        const response = await fetch('/api/history'); 
        if (!response.ok) throw new Error("Error en respuesta servidor");
        
        const data = await response.json();
        
        // --- DEBUG: IMPORTANTE VER ESTO EN CONSOLA (F12) ---
        console.log("📦 Datos Recibidos:", data);

        if (!data || data.length === 0) {
            console.warn("⚠️ No hay datos históricos.");
            document.getElementById('currentTime').textContent = 'Esperando datos...';
            return;
        }

        const lastReading = data[data.length - 1];
        
        // --- 1. PREPARAR DATOS (Usando parseFloat para seguridad) ---
        const labels = data.map(item => item.timestamp); 

        // Helper robusto: convierte a número, si falla devuelve null
        const safeMap = (key) => data.map(item => {
            const val = parseFloat(item[key]);
            return !isNaN(val) ? val : null;
        });

        const temperatures = safeMap('temp'); 
        const humidities = safeMap('hum'); 
        const pressures = safeMap('pres');    
        
        // --- 2. ACTUALIZAR CAJAS DE TEXTO ---
        const setTxt = (id, val, unit) => {
            const el = document.getElementById(id);
            if(el) el.textContent = (val !== undefined && val !== null) ? `${parseFloat(val).toFixed(1)} ${unit}` : "--";
        };

        setTxt('current-temp1-value', lastReading.temp, '°C');
        // Si tienes caja de temp2, úsala para humedad o límpiala
        setTxt('current-temp2-value', lastReading.hum, '%'); 
        setTxt('current-humidity-value', lastReading.hum, '%');
        setTxt('current-battery-volt-value', lastReading.pres, 'hPa');
        
        const rssi = lastReading.rssi || 0;
        document.getElementById('current-signal-value').textContent = `${rssi} dBm`;
        updateSignalIcon(rssi);

        const dateObj = new Date(lastReading.timestamp);
        document.getElementById('currentTime').textContent = dateObj.toLocaleTimeString();

        // --- 3. DIBUJAR GRÁFICAS ---
        
        // Configuración Eje X (Tiempo)
        const endTime = dateObj.getTime();
        let commonXConfig = {};
        
        // Si es la primera carga o reset, hacemos zoom a los últimos 30 mins
        if (forceReset || !window.tempChartInstance) {
            commonXConfig = {
                min: endTime - (30 * 60 * 1000), // Últimos 30 minutos
                max: endTime + (2 * 60 * 1000)   // +2 minutos de margen futuro
            };
        } else {
            // Mantener zoom actual si el usuario lo movió
            const currentScale = window.tempChartInstance.scales.x;
            commonXConfig = { min: currentScale.min, max: currentScale.max };
        }

        // Gráfica 1: Temperatura y Humedad
        drawChart('tempChart', [
            { label: 'Temp (°C)', data: temperatures, color: 'rgb(255, 159, 64)' },
            { label: 'Humedad (%)', data: humidities, color: 'rgb(54, 162, 235)' }
        ], labels, { 
            title: { display: true, text: 'Clima' },
            min: 0, max: 50 // Rango fijo inicial sugerido, se autoajusta si hay datos fuera
        }, commonXConfig);

        // Gráfica 2: Presión
        // Calculamos min/max dinámicos para que la presión (que varía poco) se vea bien
        const validPressures = pressures.filter(p => p !== null);
        let minP = 900, maxP = 1100;
        if (validPressures.length > 0) {
            minP = Math.min(...validPressures) - 5;
            maxP = Math.max(...validPressures) + 5;
        }

        drawChart('batteryChart', [
            { label: 'Presión (hPa)', data: pressures, color: 'rgb(153, 102, 255)' }
        ], labels, { 
            title: { display: true, text: 'Barómetro' },
            min: minP, max: maxP 
        }, commonXConfig);

    } catch (error) {
        console.error('Error actualizando dashboard:', error);
    }
}

// Iniciar
document.addEventListener('DOMContentLoaded', () => {
    fetchAndDrawHistoricalData(true); 
    setInterval(() => fetchAndDrawHistoricalData(false), 10000); // Actualizar cada 10s
});

