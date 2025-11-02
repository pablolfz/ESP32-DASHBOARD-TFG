// Archivo: static/js/dashboard.js

// Variable global para almacenar las instancias de las gráficas
let tempChartInstance, batteryChartInstance; 

// Margen fijo de resolución y límites de seguridad
const RESOLUTION_MARGIN = 0.5; 
const TEMP_MIN_SAFETY = -15;
const TEMP_MAX_SAFETY = 60;

// Configuración global de Chart.js para usar el plugin de zoom
Chart.register(window.ChartZoom);

/**
 * Función auxiliar para mostrar mensajes de estado en el dashboard.
 */
function showMessage(type, content) {
    const container = document.getElementById('message-container');
    container.textContent = content;
    container.className = `message-container ${type}`;
    container.classList.remove('hidden');

    // Ocultar después de 5 segundos
    setTimeout(() => {
        container.classList.add('hidden');
    }, 5000);
}


/**
 * Función auxiliar para crear o actualizar una gráfica.
 * Integra la configuración de zoom y pan por botón.
 */
function drawChart(canvasId, datasets, labels, yAxisConfig = {}, xAxisConfig = {}) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    let chartInstance = window[canvasId + 'Instance']; 

    if (chartInstance) {
        chartInstance.destroy();
    }
    
    // Generar colores y formatear data para cada dataset
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
            maintainAspectRatio: false, // Permitir control de altura por CSS
            
            layout: {
                padding: {
                    left: 0,
                    right: 10,
                    top: 5,     
                    bottom: 30 // Aumentado para dar espacio al eje X
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
                        autoSkip: false,  
                        maxTicksLimit: 200, 
                        maxRotation: 45, 
                        minRotation: 45, 
                        font: {
                            size: 12
                        },
                        padding: 10,
                        crossAlign: 'near',
                        stepSize: 5
                    },
                    grid: {
                        display: true 
                    }
                },
                y: { 
                    ...yAxisConfig, 
                    beginAtZero: false, 
                    title: {
                        display: true,
                        text: datasets[0].label.includes('Temperatura') ? 'Temperatura (°C)' : datasets[0].label.includes('Voltaje') ? 'Voltaje (V)' : ''
                    },
                    ticks: {
                        font: {
                            size: 14
                        },
                        padding: 5,
                        crossAlign: 'near' 
                    }
                }
            },
            
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        padding: 15,
                        font: {
                            size: 14
                        }
                    }
                },
                // ⭐ Configuración del Plugin de Zoom (Solo desplazamiento) ⭐
                zoom: {
                    pan: {
                        enabled: true, // Habilitar arrastre para moverse en el tiempo
                        mode: 'x',
                        modifierKey: 'alt', // Usar tecla Alt+arrastre
                    },
                    zoom: {
                        wheel: {
                            enabled: false, // Deshabilitar zoom con la rueda del ratón
                        },
                        pinch: {
                            enabled: false // Deshabilitar zoom con pellizco
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

// ======================================================================
// ⭐ FUNCIONES DE CONTROL AVANZADO DE GRÁFICA ⭐
// ======================================================================

/**
 * Aplica zoom a la gráfica por medio de botones.
 * @param {string} chartId - ID del elemento canvas ('tempChart' o 'batteryChart').
 * @param {number} scale - Factor de zoom (e.g., 0.8 para zoom-out, 1.2 para zoom-in).
 */
function buttonZoom(chartId, scale) {
    const chart = window[chartId + 'Instance'];
    if (chart) {
        chart.zoom({ x: scale });
        chart.update();
    }
}

/**
 * Restablece el zoom de la gráfica a la configuración predeterminada (última hora).
 * @param {string} chartId - ID del elemento canvas.
 */
function resetZoom(chartId) {
    const chart = window[chartId + 'Instance'];
    if (chart && chart.options.plugins.zoom) {
        chart.resetZoom();
        chart.update();
    }
}

/**
 * Desplaza la gráfica en el tiempo (pan).
 * @param {string} chartId - ID del elemento canvas.
 * @param {number} amount - Cantidad de milisegundos a desplazar (negativo para atrás, positivo para adelante).
 */
function moveTime(chartId, amount) {
    const chart = window[chartId + 'Instance'];
    if (chart) {
        chart.pan({ x: amount });
        chart.update();
    }
}

/**
 * Centra la gráfica en una fecha y hora específicas.
 * @param {string} chartId - ID del elemento canvas.
 * @param {string} datetimeId - ID del campo input datetime-local.
 */
function jumpToTime(chartId, datetimeId) {
    const chart = window[chartId + 'Instance'];
    const input = document.getElementById(datetimeId);
    
    if (!chart || !input.value) {
        showMessage('error', 'Por favor, introduzca una fecha y hora válida.');
        return;
    }

    const targetTime = new Date(input.value).getTime();
    
    if (isNaN(targetTime)) {
        showMessage('error', 'Formato de fecha u hora no válido.');
        return;
    }

    // Obtener el rango visible actual para centrar la vista
    const scale = chart.scales.x;
    const currentRange = scale.max - scale.min;
    
    // Determinar si la fecha existe en los datos
    const dataPoints = chart.data.labels.map(ts => new Date(ts).getTime());
    
    // Si la fecha no está cerca de los datos, dar una advertencia
    const tolerance = 60 * 60 * 1000; // Tolerancia de 1 hora
    const isDataNearby = dataPoints.some(ts => Math.abs(ts - targetTime) <= tolerance);

    if (!isDataNearby) {
         showMessage('warning', `Advertencia: No hay datos registrados cerca de ${input.value}. Centrando la vista.`);
    } else {
        showMessage('success', `Gráfica centrada en ${input.value}.`);
    }

    // Calcular el nuevo centro del eje X
    const newMin = targetTime - currentRange / 2;
    const newMax = targetTime + currentRange / 2;

    // Aplicar el nuevo rango al eje X
    scale.options.min = newMin;
    scale.options.max = newMax;
    
    chart.update('quiet');
}

// ======================================================================
// ⭐ FUNCIONES DE GESTIÓN DE DATOS ⭐
// ======================================================================

/**
 * Redirige a la ruta de exportación CSV.
 */
function downloadData() {
    showMessage('success', 'Iniciando descarga de datos. El archivo se guardará como CSV.');
    // Flask enviará el archivo como un adjunto
    window.location.href = '/api/export';
}

/**
 * Solicita la eliminación de registros de más de 30 días con confirmación.
 */
async function confirmCleanup() {
    if (!window.confirm("ADVERTENCIA: ¿Está seguro de que desea eliminar permanentemente todos los registros anteriores a 30 días?")) {
        return;
    }

    showMessage('warning', 'Limpiando la base de datos... Esto puede tardar unos segundos.');

    try {
        const response = await fetch('/api/cleanup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const result = await response.json();

        if (response.ok && result.status === 'success') {
            showMessage('success', `Limpieza exitosa: ${result.message}`);
            // Volver a cargar los datos después de la limpieza
            fetchAndDrawHistoricalData(); 
        } else {
            showMessage('error', `Fallo en la limpieza: ${result.message}`);
        }
    } catch (error) {
        showMessage('error', `Error de conexión al servidor durante la limpieza: ${error.message}`);
    }
}


// Función principal para obtener datos y actualizar el dashboard
async function fetchAndDrawHistoricalData() {
    console.log("Intentando actualizar datos...");

    let data;
    
    try {
        const response = await fetch('/api/history'); 
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - Server failed to return history.`);
        }
        
        data = await response.json();
        
    } catch (error) {
        console.error('CRÍTICO: Error de conexión o API. Web no puede obtener datos de Flask. 👉', error);
        document.getElementById('current-temp1-value').textContent = 'API Error';
        document.getElementById('currentTime').textContent = 'Conexión Fallida';
        // Detener la ejecución si no hay datos válidos
        return; 
    }
    
    if (data.length === 0) {
        document.getElementById('currentTime').textContent = 'No data available';
        return;
    }

    const lastReading = data[data.length - 1];
    
    // ----------------------------------------------------
    // 1. EXTRACCIÓN Y FILTRADO DE DATOS 
    // ----------------------------------------------------
    
    const labels = data.map(item => item.timestamp); 
    
    const mapAndFilter = (key) => data.map(item => {
        const val = item[key];
        return typeof val === 'number' && !isNaN(val) ? val : null;
    });

    const temperatures1 = mapAndFilter('temp1'); 
    const temperatures2 = mapAndFilter('temp2'); 
    const batteryVolts = mapAndFilter('batt');   
    
    // ----------------------------------------------------
    // 2. CÁLCULO DE RANGO HORIZONTAL PREDETERMINADO (Última hora)
    // ----------------------------------------------------
    const endTime = new Date(lastReading.timestamp).getTime();
    const ONE_HOUR_MS = 60 * 60 * 1000; 
    const startTime = endTime - ONE_HOUR_MS; 

    let xAxisConfig = {
        min: startTime,
        max: endTime 
    };

    // ----------------------------------------------------
    // 3. CÁLCULO Y DIBUJO DE GRÁFICAS (CORRECCIÓN DE ZOOM INTELIGENTE)
    // ----------------------------------------------------

    const validTemps1 = temperatures1.filter(v => v !== null && v !== 999.0);
    const validTemps2 = temperatures2.filter(v => v !== null && v !== 999.0);
    const validBattVolts = batteryVolts.filter(v => v !== null);

    let tempAxisConfig = {}; 
    let battAxisConfig = {};

    const allValidTemps = [...validTemps1, ...validTemps2];

    if (allValidTemps.length > 0) {
        const minTemp = Math.min(...allValidTemps); 
        const maxTemp = Math.max(...allValidTemps); 
        
        tempAxisConfig = {
            // ⭐ AJUSTE INTELIGENTE: Rango real + 1 grado de margen. ⭐
            min: Math.floor(minTemp - 1), 
            max: Math.ceil(maxTemp + 1)
        };

        if (tempAxisConfig.min < TEMP_MIN_SAFETY) tempAxisConfig.min = TEMP_MIN_SAFETY;
        if (tempAxisConfig.max > TEMP_MAX_SAFETY) tempAxisConfig.max = TEMP_MAX_SAFETY;
        
        // Si el rango es demasiado pequeño, ajustarlo para que sea visible (mínimo 2 grados de diferencia)
        if (tempAxisConfig.max - tempAxisConfig.min < 2) {
             tempAxisConfig.max += 1;
             tempAxisConfig.min -= 1;
        }

        const tempDatasets = [
            { label: 'Temperatura 1 (°C)', data: temperatures1, color: 'rgb(255, 165, 0)' },
            { label: 'Temperatura 2 (°C)', data: temperatures2, color: 'rgb(255, 99, 132)' }
        ];
        
        drawChart('tempChart', tempDatasets, labels, tempAxisConfig, xAxisConfig); 

    } else {
        // CORRECCIÓN: FORZAR EL DIBUJO DEL CONTENEDOR SI NO HAY DATOS VÁLIDOS
        console.warn("ADVERTENCIA: No hay datos válidos (quizás solo 999.0). Forzando visualización del eje.");

        tempAxisConfig = { 
            min: 10,  
            max: 40,
            title: { display: true, text: 'Temperatura (°C)' }
        };
        
        const tempDatasets = [
            { label: 'Temperatura 1 (°C)', data: temperatures1, color: 'rgb(255, 165, 0)' },
            { label: 'Temperatura 2 (°C)', data: temperatures2, color: 'rgb(255, 99, 132)' }
        ];
        
        drawChart('tempChart', tempDatasets, labels, tempAxisConfig, xAxisConfig); 
    }
    
    // Lógica para la gráfica de batería (también con zoom inteligente en Y)
    if (validBattVolts.length > 0) {
         const minBatt = Math.min(...validBattVolts);
         const maxBatt = Math.max(...validBattVolts);
         
         battAxisConfig = {
             // Ajuste: rango real + 0.1 V de margen
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
    } else {
         console.warn("ADVERTENCIA: No hay datos válidos para dibujar la batería.");
         const battDatasets = [{ label: 'Voltaje de Batería (V)', data: batteryVolts, color: 'rgb(75, 192, 192)' }];
         battAxisConfig = { min: 3.0, max: 4.5, title: { display: true, text: 'Voltaje (V)' } };
         drawChart('batteryChart', battDatasets, labels, battAxisConfig, xAxisConfig);
    }

    // ----------------------------------------------------
    // 4. ACTUALIZACIÓN DE CAJAS Y TIEMPO
    // ----------------------------------------------------
    
    // ⭐ Mapeo de datos para las cajas
    const currentTemp1 = lastReading.temp1 && lastReading.temp1 !== 999.0 ? lastReading.temp1.toFixed(1) : "Error";
    const currentTemp2 = lastReading.temp2 && lastReading.temp2 !== 999.0 ? lastReading.temp2.toFixed(1) : "Error";
    const currentRssi = lastReading.rssi ? lastReading.rssi : "No data";
    const currentBatteryPct = lastReading.pct !== undefined && lastReading.pct !== null ? Math.round(lastReading.pct) : "No data";
    const currentBatteryVolts = lastReading.batt ? lastReading.batt.toFixed(2) : "No data";
    
    // ⭐ Actualización de Contenido
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


// Inicializar la carga al cargar el documento y configurar el Polling
document.addEventListener('DOMContentLoaded', () => {
    fetchAndDrawHistoricalData(); 
    setInterval(fetchAndDrawHistoricalData, 30000); 
});
