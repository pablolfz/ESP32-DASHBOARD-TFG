// Archivo: static/js/dashboard.js

// Variable global para almacenar las instancias de las gráficas
let tempChartInstance, batteryChartInstance; // Instancias ajustadas (solo dos principales)

// Margen fijo de resolución y límites de seguridad
const RESOLUTION_MARGIN = 0.5; 
const TEMP_MIN_SAFETY = -15;
const TEMP_MAX_SAFETY = 60;

// --- FUNCIONES DE GESTIÓN DE GRÁFICAS Y TIEMPO ---

/**
 * Muestra un mensaje temporal en la interfaz (éxito o error).
 */
function showMessage(type, content) {
    const container = document.getElementById('message-container');
    container.textContent = content;
    container.className = `message-container ${type}`;
    container.classList.remove('hidden');

    setTimeout(() => {
        container.classList.add('hidden');
    }, 5000);
}

/**
 * Restablece el zoom de un gráfico a su rango inicial (última hora).
 */
function resetZoom(chartId) {
    const chart = window[chartId + 'Instance'];
    if (chart) {
        chart.resetZoom();
        showMessage('success', 'Zoom de la gráfica restablecido.');
    }
}

/**
 * Desplaza el gráfico en el eje X por una cantidad de horas.
 * @param {string} chartId ID del elemento canvas del gráfico.
 * @param {number} amount Cantidad de horas a desplazar (positivo para adelantar, negativo para retrasar).
 */
function moveTime(chartId, amount) {
    const chart = window[chartId + 'Instance'];
    if (chart && chart.options.plugins.zoom) {
        // La unidad de Chart.js es milisegundos (1 hora = 3600000 ms)
        const panAmount = amount * 3600000; 

        // Usamos la función nativa del plugin de zoom para el pan (desplazamiento)
        chart.pan({ x: panAmount }, undefined, 'none');
        showMessage('success', `Desplazamiento de ${amount > 0 ? '+' : ''}${amount} horas aplicado.`);
    }
}

/**
 * Centra el gráfico en una fecha y hora específicas introducidas por el usuario.
 */
function jumpToTime(chartId, datetimeId) {
    const chart = window[chartId + 'Instance'];
    const inputElement = document.getElementById(datetimeId);
    const dateValue = inputElement.value;

    if (!chart || !dateValue) {
        showMessage('error', 'Por favor, introduzca una fecha y hora válidas.');
        return;
    }

    const targetTime = new Date(dateValue).getTime();
    const duration = chart.scales.x.max - chart.scales.x.min;
    
    // Calcula el nuevo rango centrado en la hora deseada
    const newMin = targetTime - duration / 2;
    const newMax = targetTime + duration / 2;

    // Aplica el nuevo rango al eje X
    chart.zoomScale('x', { min: newMin, max: newMax }, 'none');

    showMessage('success', `Gráfica centrada en ${dateValue}.`);
}

/**
 * Inicia la descarga del archivo CSV.
 */
function downloadData() {
    showMessage('success', 'Iniciando descarga de datos históricos...');
    // Redirige al endpoint de Flask que genera el archivo
    window.location.href = '/api/export';
}

/**
 * Pide confirmación y, si es afirmativo, inicia la limpieza de la base de datos.
 */
function confirmCleanup() {
    if (confirm('ADVERTENCIA: ¿Está seguro de que desea ELIMINAR todos los registros anteriores a 30 días? Esta acción es irreversible.')) {
        cleanupData();
    } else {
        showMessage('error', 'Operación de limpieza cancelada por el usuario.');
    }
}

async function cleanupData() {
    showMessage('warning', 'Enviando solicitud de limpieza al servidor...');
    try {
        const response = await fetch('/api/cleanup', {
            method: 'POST', // Usamos POST para la limpieza
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();
        
        if (response.ok && result.status === 'success') {
            showMessage('success', `Limpieza exitosa: ${result.message}`);
            // Forzar una actualización de la gráfica después de la limpieza
            fetchAndDrawHistoricalData(); 
        } else {
            showMessage('error', `Fallo en la limpieza: ${result.message}`);
        }

    } catch (error) {
        showMessage('error', 'Error de conexión al intentar limpiar la base de datos.');
        console.error('Cleanup Error:', error);
    }
}


/**
 * Función auxiliar para crear o actualizar una gráfica.
 */
function drawChart(canvasId, datasets, labels, yAxisConfig = {}, xAxisConfig = {}) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    let chartInstance = window[canvasId + 'Instance']; 

    if (chartInstance) {
        chartInstance.destroy();
    }
    
    const formattedDatasets = datasets.map(ds => ({
        label: ds.label,
        data: ds.data.map((val, index) => ({ 
            x: labels[index], 
            y: val         
        })),
        borderColor: ds.color,
        backgroundColor: ds.color.replace('rgb', 'rgba').replace(')', ', 0.2)'),
        tension: 0.3, 
        pointRadius: 2,
        fill: false 
    }));

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels, 
            datasets: formattedDatasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: true, 
            
            layout: {
                padding: {
                    left: 0,
                    right: 10,
                    top: 5,     
                    bottom: 10 
                }
            },

            scales: {
                x: {
                    ...xAxisConfig,
                    type: 'time', 
                    time: {
                        unit: 'minute', 
                        displayFormats: {
                            minute: 'HH:mm', 
                            hour: 'HH:mm'
                        },
                        distribution: 'linear', 
                        bounds: 'ticks'
                    },
                    ticks: {
                        autoSkip: true,  
                        maxTicksLimit: 10, 
                        maxRotation: 0, 
                        minRotation: 0, 
                        font: { size: 12 },
                        padding: 10,
                        crossAlign: 'near',
                    },
                    grid: { display: true }
                },
                y: { 
                    ...yAxisConfig, 
                    beginAtZero: false, 
                    title: {
                        display: true,
                        text: datasets[0].label.includes('Temperatura') ? 'Temperatura (°C)' : datasets[0].label.includes('Voltaje') ? 'Voltaje (V)' : ''
                    },
                    ticks: { font: { size: 14 }, padding: 5, crossAlign: 'near' }
                }
            },
            
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: { padding: 15, font: { size: 14 } }
                },
                // ⭐ Configuración del Plugin de Zoom (para el control del usuario) ⭐
                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'x', // Permitir desplazamiento solo en el eje del tiempo
                        threshold: 5
                    },
                    zoom: {
                        wheel: {
                            enabled: true, // Habilitar zoom con la rueda del ratón
                        },
                        pinch: {
                            enabled: true // Habilitar zoom con pellizco (touch)
                        },
                        mode: 'x',
                    }
                }
            }
        }
    });

    window[canvasId + 'Instance'] = chartInstance;
}

/**
 * Actualiza el icono y el color del contenedor de señal basado en el RSSI.
 */
function updateSignalIcon(rssiValue) {
    const iconElement = document.getElementById('signal-icon');
    const boxElement = document.getElementById('box-signal');
    
    if (!iconElement || !boxElement) return; 

    let levelClass = 'signal-level-0'; 
    let rssiNum = parseInt(rssiValue);

    iconElement.className = 'fa-solid';

    if (rssiNum >= -75) {
        levelClass = 'signal-level-4'; 
        iconElement.classList.add('fa-signal');
    } else if (rssiNum >= -90) {
        levelClass = 'signal-level-3'; 
        iconElement.classList.add('fa-signal');
    } else if (rssiNum >= -105) {
        levelClass = 'signal-level-2'; 
        iconElement.classList.add('fa-signal');
    } else if (rssiNum > -120) {
        levelClass = 'signal-level-1'; 
        iconElement.classList.add('fa-signal');
    } else {
        levelClass = 'signal-level-0'; 
        iconElement.classList.add('fa-ban'); 
    }
    
    iconElement.classList.add(levelClass);

    boxElement.classList.remove('signal-level-0', 'signal-level-1', 'signal-level-2', 'signal-level-3', 'signal-level-4');
    boxElement.classList.add(levelClass); 
}


// Función principal para obtener datos y actualizar el dashboard
async function fetchAndDrawHistoricalData() {
    console.log("Intentando actualizar datos...");

    let data;
    
    try {
        const response = await fetch('/api/history'); 
        
        if (!response.ok) {
            // Manejamos el error 500 del servidor
            throw new Error(`HTTP error! status: ${response.status} - Server failed to return history.`);
        }
        
        data = await response.json();
        
    } catch (error) {
        console.error('CRÍTICO: Error de conexión o API. Web no puede obtener datos de Flask. 👉', error);
        document.getElementById('current-temp1-value').textContent = 'API Error';
        document.getElementById('currentTime').textContent = 'Conexión Fallida';
        return; 
    }
    
    if (data.length === 0) {
        document.getElementById('currentTime').textContent = 'No data available';
        // Detener la ejecución si no hay datos disponibles
        // Intentar dibujar el contenedor de gráficos vacío con un rango predeterminado
        tryDrawEmptyCharts();
        return;
    }

    const lastReading = data[data.length - 1];
    
    // ----------------------------------------------------
    // 1. EXTRACCIÓN Y FILTRADO DE DATOS
    // ----------------------------------------------------
    
    const labels = data.map(item => item.timestamp); 
    
    const mapAndFilter = (key) => data.map(item => {
        const val = item[key];
        // Retorna null si el valor es null, no es número, o es el valor de error 999.0
        return typeof val === 'number' && !isNaN(val) && val !== 999.0 ? val : null;
    });

    const temperatures1 = mapAndFilter('temp1'); 
    const temperatures2 = mapAndFilter('temp2'); 
    const batteryVolts = mapAndFilter('batt');   
    
    // ----------------------------------------------------
    // 2. CÁLCULO DE RANGO HORIZONTAL
    // ----------------------------------------------------
    const endTime = new Date(lastReading.timestamp).getTime();
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000; // Mostrar las últimas 6 horas por defecto
    const startTime = endTime - SIX_HOURS_MS; 

    let xAxisConfig = {
        min: startTime,
        max: endTime 
    };

    // ----------------------------------------------------
    // 3. CÁLCULO Y DIBUJO DE GRÁFICAS
    // ----------------------------------------------------

    const validTemps1 = temperatures1.filter(v => v !== null);
    const validTemps2 = temperatures2.filter(v => v !== null);
    const validBattVolts = batteryVolts.filter(v => v !== null);

    let tempAxisConfig = {}; 
    let battAxisConfig = {};

    const allValidTemps = [...validTemps1, ...validTemps2];

    if (allValidTemps.length > 0) {
        const minTemp = Math.min(...allValidTemps); 
        const maxTemp = Math.max(...allValidTemps); 
        
        tempAxisConfig = {
            min: Math.floor(minTemp - RESOLUTION_MARGIN), 
            max: Math.ceil(maxTemp + RESOLUTION_MARGIN)
        };

        if (tempAxisConfig.min < TEMP_MIN_SAFETY) tempAxisConfig.min = TEMP_MIN_SAFETY;
        if (tempAxisConfig.max > TEMP_MAX_SAFETY) tempAxisConfig.max = TEMP_MAX_SAFETY;
        
        if (tempAxisConfig.max - tempAxisConfig.min < 1) {
             tempAxisConfig.max += 0.5;
             tempAxisConfig.min -= 0.5;
        }

        const tempDatasets = [
            { label: 'Temperatura 1 (°C)', data: temperatures1, color: 'rgb(255, 165, 0)' },
            { label: 'Temperatura 2 (°C)', data: temperatures2, color: 'rgb(255, 99, 132)' }
        ];
        
        drawChart('tempChart', tempDatasets, labels, tempAxisConfig, xAxisConfig); 

    } else {
        // CORRECCIÓN: Forzar el dibujo del contenedor de temperatura
        console.warn("ADVERTENCIA: No hay datos válidos (solo 999.0/null). Forzando visualización del eje.");
        tryDrawEmptyCharts(labels, xAxisConfig, temperatures1, temperatures2, batteryVolts);
    }
    
    if (validBattVolts.length > 0) {
         const minBatt = Math.min(...validBattVolts);
         const maxBatt = Math.max(...validBattVolts);
         
         battAxisConfig = {
             min: minBatt - 0.1,
             max: maxBatt + 0.1
         };

         if (battAxisConfig.max - battAxisConfig.min < 0.2) {
             battAxisConfig.max += 0.1;
             battAxisConfig.min -= 0.1;
         }
         
         const battDatasets = [
             { label: 'Voltaje de Batería (V)', data: batteryVolts, color: 'rgb(75, 192, 192)' }
         ];

         drawChart('batteryChart', battDatasets, labels, battAxisConfig, xAxisConfig);
    } else if (allValidTemps.length > 0) {
         // Si hay datos de tiempo, al menos intenta dibujar la batería vacía
         tryDrawEmptyCharts(labels, xAxisConfig, temperatures1, temperatures2, batteryVolts);
    }

    // ----------------------------------------------------
    // 4. ACTUALIZACIÓN DE CAJAS (Mantenido igual)
    // ----------------------------------------------------
    
    const currentTemp1 = lastReading.temp1 && lastReading.temp1 !== 999.0 ? lastReading.temp1.toFixed(1) : "Error";
    const currentTemp2 = lastReading.temp2 && lastReading.temp2 !== 999.0 ? lastReading.temp2.toFixed(1) : "Error";
    const currentRssi = lastReading.rssi ? lastReading.rssi : "No data";
    const currentBatteryPct = lastReading.pct !== undefined && lastReading.pct !== null ? Math.round(lastReading.pct) : "No data";
    const currentBatteryVolts = lastReading.batt ? lastReading.batt.toFixed(2) : "No data";
    
    document.getElementById('current-temp1-value').textContent = `${currentTemp1} °C`;
    document.getElementById('current-temp2-value').textContent = `${currentTemp2} °C`; 
    document.getElementById('current-signal-value').textContent = `${currentRssi} dBm`; 
    document.getElementById('current-battery-pct-value').textContent = `${currentBatteryPct} %`;
    document.getElementById('current-battery-volt-value').textContent = `${currentBatteryVolts} V`;

    document.getElementById('current-humidity-value').textContent = 'N/A';
    
    updateSignalIcon(currentRssi); 
    
    const lastTime = new Date(lastReading.timestamp).toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit', second:'2-digit'});
    const lastDate = new Date(lastReading.timestamp).toLocaleDateString('es-ES');
    document.getElementById('currentTime').textContent = `${lastTime} (${lastDate})`;
}

/**
 * Intenta dibujar gráficos vacíos si no hay datos válidos para definir los rangos.
 */
function tryDrawEmptyCharts(labels = [], xAxisConfig = { min: Date.now() - (6 * 3600000), max: Date.now() }, 
                            temps1 = [], temps2 = [], battVolts = []) {
    
    // Dibujar Temperatura vacía
    const tempAxisConfig = { min: 10, max: 40, title: { display: true, text: 'Temperatura (°C)' } };
    const tempDatasets = [
        { label: 'Temperatura 1 (°C)', data: temps1, color: 'rgb(255, 165, 0)' },
        { label: 'Temperatura 2 (°C)', data: temps2, color: 'rgb(255, 99, 132)' }
    ];
    drawChart('tempChart', tempDatasets, labels, tempAxisConfig, xAxisConfig); 

    // Dibujar Batería vacía
    const battAxisConfig = { min: 3.0, max: 4.5, title: { display: true, text: 'Voltaje (V)' } };
    const battDatasets = [{ label: 'Voltaje de Batería (V)', data: battVolts, color: 'rgb(75, 192, 192)' }];
    drawChart('batteryChart', battDatasets, labels, battAxisConfig, xAxisConfig);
}

// Inicializar la carga al cargar el documento y configurar el Polling
document.addEventListener('DOMContentLoaded', () => {
    fetchAndDrawHistoricalData(); 
    setInterval(fetchAndDrawHistoricalData, 30000); 
});
