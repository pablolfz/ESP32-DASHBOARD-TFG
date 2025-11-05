// Archivo: static/js/dashboard.js

// Variable global para almacenar las instancias de las gráficas
let tempChartInstance, batteryChartInstance; // Instancias ajustadas (solo dos principales)

// Margen fijo de resolución y límites de seguridad
const RESOLUTION_MARGIN = 0.5; 
const TEMP_MIN_SAFETY = -15;
const TEMP_MAX_SAFETY = 60;

// --- FUNCIONES DE GESTIÓN DE INTERFAZ Y CONTROL ---

/**
 * Muestra mensajes de estado (éxito, error) en el contenedor de mensajes.
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
 * Incrementa o decrementa el zoom en el eje X mediante botones.
 * factor: -1 para zoom in, 1 para zoom out.
 */
function buttonZoom(chartId, factor) {
    const chart = window[chartId + 'Instance'];
    if (chart) {
        const scale = chart.scales.x;
        const center = (scale.min + scale.max) / 2;
        const currentRange = scale.max - scale.min;
        let newRange;

        if (factor === -1) { // Zoom In
            newRange = currentRange * 0.8; // Reduce el rango en 20%
        } else { // Zoom Out (factor === 1)
            newRange = currentRange / 0.8; // Aumenta el rango en 20%
        }

        chart.options.scales.x.min = center - newRange / 2;
        chart.options.scales.x.max = center + newRange / 2;
        chart.update();
    }
}

/**
 * Restablece el zoom del gráfico a su rango de tiempo inicial (rango completo de datos).
 */
function resetZoom(chartId) {
    const chart = window[chartId + 'Instance'];
    if (chart) {
        // Al resetear el zoom, volvemos a cargar los datos para recalcular el eje X dinámico
        fetchAndDrawHistoricalData(true); 
    }
}

/**
 * Desplaza el gráfico en el tiempo (pan).
 */
function moveTime(chartId, amount) {
    const chart = window[chartId + 'Instance'];
    if (chart && amount !== 0) {
        const scale = chart.scales.x;
        const range = scale.max - scale.min;
        const newMin = scale.min + range * amount * 0.2; // Mover 20% del rango
        const newMax = scale.max + range * amount * 0.2;

        chart.options.scales.x.min = newMin;
        chart.options.scales.x.max = newMax;
        chart.update();
    }
}

/**
 * Busca y centra el gráfico en una fecha y hora específicas.
 */
function jumpToTime(chartId, datetimeId) {
    const chart = window[chartId + 'Instance'];
    const datetimeInput = document.getElementById(datetimeId).value;

    if (!chart || !datetimeInput) {
        showMessage('error', 'Por favor, ingrese una fecha y hora válidas.');
        return;
    }

    const targetDate = new Date(datetimeInput);
    if (isNaN(targetDate)) {
        showMessage('error', 'Formato de fecha u hora no reconocido.');
        return;
    }

    const targetTimeMs = targetDate.getTime();
    
    // Obtener el rango visible actual
    const scale = chart.scales.x;
    const currentRange = scale.max - scale.min; 
    
    // Calcular el nuevo centro del eje X
    const newMin = targetTimeMs - currentRange / 2;
    const newMax = targetTimeMs + currentRange / 2;

    // Aplicar el nuevo rango
    chart.options.scales.x.min = newMin;
    chart.options.scales.x.max = newMax;
    chart.update();
    
    showMessage('success', `Gráfico centrado en la lectura más cercana a ${targetDate.toLocaleTimeString()}.`);
}

/**
 * Redirige a la ruta de exportación CSV.
 */
function downloadData() {
    window.location.href = '/api/export';
    showMessage('success', 'Descargando datos. Por favor, espere a que el archivo CSV aparezca en sus descargas.');
}

/**
 * Solicita la eliminación de registros de más de 30 días con confirmación.
 */
function confirmCleanup() {
    if (confirm("ADVERTENCIA: ¿Está seguro de que desea eliminar permanentemente TODOS los registros ANTERIORES a 30 días? Esta acción es irreversible.")) {
        cleanupData();
    } else {
        showMessage('error', 'Limpieza cancelada por el usuario.');
    }
}

/**
 * Llama al endpoint de Flask para eliminar los datos antiguos.
 */
async function cleanupData() {
    try {
        const response = await fetch('/api/cleanup', {
            method: 'POST',
        });
        
        const result = await response.json();

        if (response.ok && result.status === 'success') {
            showMessage('success', result.message);
            fetchAndDrawHistoricalData(true); 
        } else {
            showMessage('error', `Fallo en la limpieza: ${result.message || 'Error desconocido del servidor.'}`);
        }
    } catch (error) {
        showMessage('error', `Fallo de conexión al servidor durante la limpieza: ${error.message}`);
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
                    // ⭐ ESTA ES LA CORRECCIÓN: Volvemos a 50px ⭐
                    bottom: 50 
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
                        maxRotation: 30, // Rotación ajustada
                        minRotation: 30, // Rotación ajustada
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
                // ⭐ Configuración del Plugin de Zoom (Solo desplazamiento y zoom por botón) ⭐
                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'x',
                        threshold: 5
                    },
                    zoom: {
                        wheel: {
                            enabled: false, // Desactivado
                        },
                        pinch: {
                            enabled: false, // Desactivado
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
async function fetchAndDrawHistoricalData(forceReset = false) {
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
    // 2. CÁLCULO DE RANGO HORIZONTAL (Eje X)
    // ----------------------------------------------------
    const endTime = new Date(lastReading.timestamp).getTime();
    
    let xAxisConfig = {};
    
    // ⭐ AJUSTE DINÁMICO DE ZOOM EN X: si es la carga inicial o forzada, ajusta al rango de datos.
    if (forceReset || !window.tempChartInstance) {
        const firstTime = new Date(data[0].timestamp).getTime();
        const rangeMS = endTime - firstTime;
        
        // Añadir 5 minutos de margen a cada lado
        const margin = 5 * 60 * 1000;
        
        xAxisConfig = {
            min: firstTime - margin,
            max: endTime + margin
        };
    }

    // ----------------------------------------------------
    // 3. CÁLCULO Y DIBUJO DE GRÁFICAS (Zoom Inteligente en Y)
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
        
        // ⭐ AJUSTE DE ZOOM INTELIGENTE EN Y (MARGEN DE 1.0) ⭐
        tempAxisConfig = {
            min: Math.floor(minTemp - 1.0), 
            max: Math.ceil(maxTemp + 1.0)
        };

        // Reglas de seguridad para el rango si es demasiado pequeño
        if (tempAxisConfig.max - tempAxisConfig.min < 2.0) {
            tempAxisConfig.max += 1.0;
            tempAxisConfig.min -= 1.0;
        }

        if (tempAxisConfig.min < TEMP_MIN_SAFETY) tempAxisConfig.min = TEMP_MIN_SAFETY;
        if (tempAxisConfig.max > TEMP_MAX_SAFETY) tempAxisConfig.max = TEMP_MAX_SAFETY;
        
        const tempDatasets = [
            { label: 'Temperatura 1 (°C)', data: temperatures1, color: 'rgb(255, 165, 0)' },
            { label: 'Temperatura 2 (°C)', data: temperatures2, color: 'rgb(255, 99, 132)' }
        ];
        
        drawChart('tempChart', tempDatasets, labels, tempAxisConfig, xAxisConfig); 

    } else {
        // Forzar el dibujo del contenedor si no hay datos válidos (solo 999.0)
        console.warn("ADVERTENCIA: No hay datos válidos. Forzando visualización del eje.");

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
    
    // Lógica de la gráfica de batería (Sigue usando la lógica de zoom inteligente similar)
    if (validBattVolts.length > 0) {
         const minBatt = Math.min(...validBattVolts);
         const maxBatt = Math.max(...validBattVolts);
         
         battAxisConfig = {
             min: minBatt - 0.05,
             max: maxBatt + 0.05
         };

         if (battAxisConfig.max - battAxisConfig.min < 0.1) {
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
    // 4. ACTUALIZACIÓN DE CAJAS (Contenido y Hora)
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

// Inicializar la carga al cargar el documento y configurar el Polling
document.addEventListener('DOMContentLoaded', () => {
    fetchAndDrawHistoricalData(); 
    setInterval(fetchAndDrawHistoricalData, 30000); 
});

