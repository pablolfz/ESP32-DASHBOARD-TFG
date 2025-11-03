// Archivo: static/js/dashboard.js
// Contiene toda la lógica de interacción del lado del cliente: 
// 1. Obtención y procesamiento de datos de la API de Flask.
// 2. Creación y actualización de las gráficas históricas (Chart.js).
// 3. Control de la interfaz de usuario (mensajes, zoom, navegación).

// ==============================================================================
// 1. VARIABLES GLOBALES Y CONSTANTES
// ==============================================================================

// Variables globales para almacenar las referencias a las instancias de los gráficos de Chart.js.
// Esto permite acceder y manipular los gráficos (ej. zoom, actualizar datos) desde cualquier función.
let tempChartInstance, batteryChartInstance;

// Constantes de seguridad y configuración para el procesamiento de datos.
const RESOLUTION_MARGIN = 0.5; // Margen de resolución (actualmente no usado, pero reservado para lógica futura).
const TEMP_MIN_SAFETY = -15; // Límite inferior de seguridad para el eje Y de temperatura.
const TEMP_MAX_SAFETY = 60;  // Límite superior de seguridad para el eje Y de temperatura.
const ONE_HOUR_MS = 60 * 60 * 1000; // Constante de una hora en milisegundos.


// ==============================================================================
// 2. FUNCIONES DE GESTIÓN DE INTERFAZ Y CONTROL
// ==============================================================================

/**
 * Muestra mensajes de estado (éxito, error) en el contenedor de mensajes superior.
 * Utiliza las clases CSS 'success' o 'error' para estilizar la alerta.
 * @param {string} type - Tipo de mensaje ('success' o 'error').
 * @param {string} content - Contenido del mensaje.
 */
function showMessage(type, content) {
    const container = document.getElementById('message-container');
    container.textContent = content;
    container.className = `message-container ${type}`;
    container.classList.remove('hidden');

    // Oculta el mensaje automáticamente después de 5 segundos.
    setTimeout(() => {
        container.classList.add('hidden');
    }, 5000);
}

/**
 * Función reservada para controlar el zoom (actualmente sin usar en el HTML).
 * Se mantiene por si se desea añadir botones dedicados de "Zoom In / Zoom Out".
 * @param {string} chartId - ID base del canvas del gráfico ('tempChart' o 'batteryChart').
 * @param {number} factor - -1 para aumentar el zoom (reducir rango), 1 para reducir zoom (aumentar rango).
 */
function buttonZoom(chartId, factor) {
    const chart = window[chartId + 'Instance'];
    if (chart) {
        const scale = chart.scales.x;
        const center = (scale.min + scale.max) / 2;
        const currentRange = scale.max - scale.min;
        let newRange;

        // Lógica de cálculo del nuevo rango basado en el factor.
        if (factor === -1) { // Zoom In
            newRange = currentRange * 0.8; // Reduce el rango en 20%.
        } else { // Zoom Out (factor === 1)
            newRange = currentRange / 0.8; // Aumenta el rango en 20%.
        }

        // Aplica el nuevo rango centrado en el punto actual.
        chart.options.scales.x.min = center - newRange / 2;
        chart.options.scales.x.max = center + newRange / 2;
        chart.update();
    }
}

/**
 * Restablece el zoom del gráfico a su rango inicial configurado (generalmente la última hora de datos).
 * Llama a la función interna de Chart.js 'resetZoom', pero luego fuerza una recarga
 * para centrar correctamente el eje X si el usuario lo había desplazado.
 * @param {string} chartId - ID base del canvas del gráfico.
 */
function resetZoom(chartId) {
    const chart = window[chartId + 'Instance'];
    if (chart) {
        chart.resetZoom();
        // Vuelve a cargar los datos y establece el rango X a la última hora.
        fetchAndDrawHistoricalData(true); 
    }
}

/**
 * Desplaza (panning) el gráfico en el tiempo (eje X) un 20% del rango actual.
 * @param {string} chartId - ID base del canvas del gráfico.
 * @param {number} amount - 1 para adelantar, -1 para retrasar.
 */
function moveTime(chartId, amount) {
    const chart = window[chartId + 'Instance'];
    if (chart && amount !== 0) {
        const scale = chart.scales.x;
        const range = scale.max - scale.min;
        
        // Calcula el desplazamiento basado en el 20% del rango visible actual.
        const movement = range * amount * 0.2;
        
        const newMin = scale.min + movement;
        const newMax = scale.max + movement;

        // Aplica el nuevo rango y actualiza.
        chart.options.scales.x.min = newMin;
        chart.options.scales.x.max = newMax;
        chart.update();
    }
}

/**
 * Busca y centra el gráfico en una fecha y hora específicas introducidas por el usuario.
 * @param {string} chartId - ID base del canvas del gráfico.
 * @param {string} datetimeId - ID del input HTML tipo datetime-local.
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
    
    // Obtener el rango visible actual del gráfico.
    const scale = chart.scales.x;
    const currentRange = scale.max - scale.min; 
    
    // Calcula el nuevo centro del eje X, manteniendo el rango actual (ej. 1 hora visible).
    const newMin = targetTimeMs - currentRange / 2;
    const newMax = targetTimeMs + currentRange / 2;

    // Aplica el nuevo rango y actualiza el gráfico.
    chart.options.scales.x.min = newMin;
    chart.options.scales.x.max = newMax;
    chart.update();
    
    showMessage('success', `Gráfico centrado en la lectura más cercana a ${targetDate.toLocaleTimeString()}.`);
}


/**
 * Redirige a la ruta de exportación CSV definida en Flask.
 */
function downloadData() {
    window.location.href = '/api/export';
    showMessage('success', 'Descargando datos. Por favor, espere a que el archivo CSV aparezca en sus descargas.');
}

/**
 * Lógica de confirmación para la limpieza de datos.
 * NOTA PROFESOR: Se utiliza un simple 'confirm' para la funcionalidad rápida. 
 * En producción, esto debe reemplazarse por un modal de confirmación HTML/CSS 
 * para mejor experiencia de usuario y cumplimiento de políticas de seguridad.
 */
function confirmCleanup() {
    // La función 'confirm' es bloqueante, pero se usa para mantener la lógica original.
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
        // Petición POST al endpoint de limpieza.
        const response = await fetch('/api/cleanup', {
            method: 'POST',
        });
        
        const result = await response.json();

        if (response.ok && result.status === 'success') {
            showMessage('success', result.message);
            // Recarga los datos históricos para reflejar el cambio.
            fetchAndDrawHistoricalData(true); 
        } else {
            showMessage('error', `Fallo en la limpieza: ${result.message || 'Error desconocido del servidor.'}`);
        }
    } catch (error) {
        showMessage('error', `Fallo de conexión al servidor durante la limpieza: ${error.message}`);
    }
}


// ==============================================================================
// 3. FUNCIONES DE DIBUJO DE GRÁFICOS (CHART.JS)
// ==============================================================================

/**
 * Función central para crear o actualizar un gráfico de líneas.
 * Destruye la instancia anterior antes de crear una nueva para evitar fugas de memoria y errores de redibujo.
 * @param {string} canvasId - ID del elemento canvas.
 * @param {Array<object>} datasets - Arreglo de datasets con 'label', 'data' y 'color'.
 * @param {Array<string>} labels - Arreglo de marcas de tiempo (timestamp) para el eje X.
 * @param {object} yAxisConfig - Configuración específica del eje Y (min, max, title, etc.).
 * @param {object} xAxisConfig - Configuración específica del eje X (min, max, etc. para el zoom inicial).
 */
function drawChart(canvasId, datasets, labels, yAxisConfig = {}, xAxisConfig = {}) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    let chartInstance = window[canvasId + 'Instance']; 

    // Destruir la instancia anterior si existe para permitir el redibujo.
    if (chartInstance) {
        chartInstance.destroy();
    }
    
    // Formatear los datos para Chart.js, creando pares {x: timestamp, y: value}.
    const formattedDatasets = datasets.map(ds => ({
        label: ds.label,
        data: ds.data.map((val, index) => ({ 
            x: labels[index], 
            y: val         
        })),
        borderColor: ds.color,
        // Crea un color de fondo semi-transparente para el área debajo de la línea.
        backgroundColor: ds.color.replace('rgb', 'rgba').replace(')', ', 0.2)'),
        tension: 0.3, // Suaviza la línea.
        pointRadius: 2, // Tamaño de los puntos.
        fill: false // No rellena el área bajo la línea.
    }));

    // Creación de la nueva instancia de Chart.js
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels, 
            datasets: formattedDatasets
        },
        options: {
            responsive: true,
            // Permite que el tamaño del gráfico sea controlado por el contenedor CSS (importante para el diseño responsivo).
            maintainAspectRatio: false, 
            
            layout: {
                padding: {
                    left: 0,
                    right: 10,
                    top: 5,     
                    bottom: 50 // Mayor padding para evitar que las etiquetas del eje X se corten.
                }
            },

            scales: {
                x: {
                    ...xAxisConfig, // Aplica el rango inicial (min/max) para el zoom.
                    type: 'time', // CRÍTICO: Indica que el eje X son marcas de tiempo.
                    time: {
                        unit: 'minute', // Unidad base para la visualización.
                        displayFormats: {
                            minute: 'HH:mm', 
                            hour: 'HH:mm'
                        },
                        distribution: 'linear', // Distribución uniforme de puntos en el tiempo.
                        bounds: 'ticks'
                    },
                    ticks: {
                        autoSkip: false,   // Intenta no omitir demasiadas etiquetas.
                        maxTicksLimit: 200, // Límite de etiquetas.
                        maxRotation: 30, // Rotación de 30 grados para ahorrar espacio.
                        minRotation: 30,
                        font: { size: 12 },
                        padding: 10,
                        crossAlign: 'near',
                        stepSize: 5
                    },
                    grid: { display: true }
                },
                y: { 
                    ...yAxisConfig, // Aplica la configuración de min/max calculada dinámicamente.
                    beginAtZero: false, 
                    title: {
                        display: true,
                        // Título dinámico basado en la métrica.
                        text: datasets[0].label.includes('Temperatura') ? 'Temperatura (°C)' : datasets[0].label.includes('Voltaje') ? 'Voltaje (V)' : ''
                    },
                    ticks: {
                        font: { size: 14 },
                        padding: 5,
                        crossAlign: 'near' 
                    }
                }
            },
            
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: { padding: 15, font: { size: 14 } }
                },
                // Configuración del Plugin de Zoom/Pan
                zoom: {
                    pan: {
                        enabled: true, // Habilita el desplazamiento manual (panning).
                        mode: 'x',    // Solo permite desplazamiento horizontal.
                        threshold: 5
                    },
                    zoom: {
                        // Desactiva el zoom con rueda y gesto de pinza para forzar el uso de los botones
                        // de navegación que controlan el rango de tiempo.
                        wheel: { enabled: false }, 
                        pinch: { enabled: false }, 
                        mode: 'x',
                    }
                }
            }
        }
    });

    // Asigna la instancia del gráfico a la variable global para manipulación futura.
    window[canvasId + 'Instance'] = chartInstance;
}

/**
 * Actualiza el icono (Font Awesome) y la clase CSS del contenedor de señal basado en el valor RSSI.
 * @param {string|number} rssiValue - Valor de RSSI en dBm.
 */
function updateSignalIcon(rssiValue) {
    const iconElement = document.getElementById('signal-icon');
    const boxElement = document.getElementById('box-signal');
    
    if (!iconElement || !boxElement) return; 

    let levelClass = 'signal-level-0'; // Por defecto: Sin señal
    let rssiNum = parseInt(rssiValue);

    // Reinicia las clases de Font Awesome
    iconElement.className = 'fa-solid';

    // Lógica de umbrales RSSI para determinar la calidad de la señal LoRaWAN.
    if (rssiNum >= -75) {
        levelClass = 'signal-level-4'; // Excelente
        iconElement.classList.add('fa-signal');
    } else if (rssiNum >= -90) {
        levelClass = 'signal-level-3'; // Bueno
        iconElement.classList.add('fa-signal');
    } else if (rssiNum >= -105) {
        levelClass = 'signal-level-2'; // Pobre
        iconElement.classList.add('fa-signal');
    } else if (rssiNum > -120) {
        levelClass = 'signal-level-1'; // Muy Débil
        iconElement.classList.add('fa-signal');
    } else {
        levelClass = 'signal-level-0'; // Fuera de rango / Sin señal
        iconElement.classList.add('fa-ban'); // Muestra el icono de 'prohibido'
    }
    
    iconElement.classList.add(levelClass);

    // Aplica la misma clase al contenedor de la caja para efectos visuales (aunque el CSS solo usa la clase en el icono).
    boxElement.classList.remove('signal-level-0', 'signal-level-1', 'signal-level-2', 'signal-level-3', 'signal-level-4');
    boxElement.classList.add(levelClass); 
}


// ==============================================================================
// 4. FUNCIÓN PRINCIPAL DE DATOS Y RENDERIZACIÓN
// ==============================================================================

/**
 * Función principal: Obtiene datos históricos de la API, procesa las lecturas y dibuja los gráficos.
 * @param {boolean} forceReset - Si es true, fuerza el reajuste del eje X a la última hora.
 */
async function fetchAndDrawHistoricalData(forceReset = false) {
    console.log("Intentando actualizar datos...");

    let data;
    
    // --- INTENTO DE CONEXIÓN Y OBTENCIÓN DE DATOS ---
    try {
        const response = await fetch('/api/history'); 
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - Server failed to return history.`);
        }
        
        data = await response.json();
        
    } catch (error) {
        // Manejo de errores de red o del servidor.
        console.error('CRÍTICO: Error de conexión o API. Web no puede obtener datos de Flask. 👉', error);
        document.getElementById('current-temp1-value').textContent = 'API Error';
        document.getElementById('currentTime').textContent = 'Conexión Fallida';
        return; 
    }
    
    if (data.length === 0) {
        document.getElementById('currentTime').textContent = 'No data available';
        return;
    }

    // El último elemento contiene la lectura más reciente para el dashboard en tiempo real.
    const lastReading = data[data.length - 1];
    
    // ----------------------------------------------------
    // 1. EXTRACCIÓN Y FILTRADO DE DATOS PARA GRÁFICOS
    // ----------------------------------------------------
    
    const labels = data.map(item => item.timestamp); // Eje X: Marcas de tiempo.
    
    // Función auxiliar para mapear un campo y filtrar valores no numéricos/nulos.
    const mapAndFilter = (key) => data.map(item => {
        const val = item[key];
        // Solo incluye valores que son números válidos; de lo contrario, usa null (Chart.js omite nulls).
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
    // La configuración del eje X (zoom inicial) solo se aplica si es la carga inicial o si se forza el reset.
    if (forceReset || !window.tempChartInstance) {
        // Define un rango inicial de 1 hora de visualización.
        const startTime = endTime - ONE_HOUR_MS; 
        xAxisConfig = {
            min: startTime,
            max: endTime 
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

    // --- GRÁFICO DE TEMPERATURA ---
    if (allValidTemps.length > 0) {
        const minTemp = Math.min(...allValidTemps); 
        const maxTemp = Math.max(...allValidTemps); 
        
        // ⭐ AJUSTE DE ZOOM INTELIGENTE EN Y ⭐
        // Calcula dinámicamente el min/max del eje Y con un margen de +/- 1.0 °C sobre los valores extremos.
        tempAxisConfig = {
            min: Math.floor(minTemp - 1.0), 
            max: Math.ceil(maxTemp + 1.0)
        };

        // Reglas de seguridad para evitar un rango Y demasiado estrecho.
        if (tempAxisConfig.max - tempAxisConfig.min < 2.0) {
            tempAxisConfig.max += 1.0;
            tempAxisConfig.min -= 1.0;
        }

        // Aplica los límites de seguridad fijos.
        if (tempAxisConfig.min < TEMP_MIN_SAFETY) tempAxisConfig.min = TEMP_MIN_SAFETY;
        if (tempAxisConfig.max > TEMP_MAX_SAFETY) tempAxisConfig.max = TEMP_MAX_SAFETY;
        
        const tempDatasets = [
            { label: 'Temperatura 1 (°C)', data: temperatures1, color: 'rgb(255, 165, 0)' },
            { label: 'Temperatura 2 (°C)', data: temperatures2, color: 'rgb(255, 99, 132)' }
        ];
        
        drawChart('tempChart', tempDatasets, labels, tempAxisConfig, xAxisConfig); 

    } else {
        // Caso de emergencia: si no hay datos válidos (solo 999.0 o null), usa un rango fijo.
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
    
    // --- GRÁFICO DE BATERÍA ---
    if (validBattVolts.length > 0) {
           const minBatt = Math.min(...validBattVolts);
           const maxBatt = Math.max(...validBattVolts);
           
           // Aplica un zoom inteligente en Y con un margen estrecho (+/- 0.05V)
           battAxisConfig = {
               min: minBatt - 0.05,
               max: maxBatt + 0.05
           };

           // Regla de seguridad si el rango de voltaje es casi plano.
           if (battAxisConfig.max - battAxisConfig.min < 0.1) {
               battAxisConfig.max += 0.1;
               battAxisConfig.min -= 0.1;
           }
           
           const battDatasets = [
               { label: 'Voltaje de Batería (V)', data: batteryVolts, color: 'rgb(75, 192, 192)' }
           ];

           drawChart('batteryChart', battDatasets, labels, battAxisConfig, xAxisConfig);
    } else {
           // Caso de emergencia: usa un rango de voltaje fijo.
           console.warn("ADVERTENCIA: No hay datos válidos para dibujar la batería.");
           const battDatasets = [{ label: 'Voltaje de Batería (V)', data: batteryVolts, color: 'rgb(75, 192, 192)' }];
           battAxisConfig = { min: 3.0, max: 4.5, title: { display: true, text: 'Voltaje (V)' } };
           drawChart('batteryChart', battDatasets, labels, battAxisConfig, xAxisConfig);
    }

    // ----------------------------------------------------
    // 4. ACTUALIZACIÓN DE CAJAS (Contenido y Hora)
    // ----------------------------------------------------
    
    // Formateo de los valores de la última lectura para las cajas de "Tiempo Real".
    // Muestra "Error" si el valor es 999.0 o nulo/indefinido.
    const currentTemp1 = lastReading.temp1 && lastReading.temp1 !== 999.0 ? lastReading.temp1.toFixed(1) : "Error";
    const currentTemp2 = lastReading.temp2 && lastReading.temp2 !== 999.0 ? lastReading.temp2.toFixed(1) : "Error";
    const currentRssi = lastReading.rssi ? lastReading.rssi : "No data";
    // El porcentaje de batería se redondea al entero más cercano.
    const currentBatteryPct = lastReading.pct !== undefined && lastReading.pct !== null ? Math.round(lastReading.pct) : "No data";
    const currentBatteryVolts = lastReading.batt ? lastReading.batt.toFixed(2) : "No data";
    
    // Actualización de los elementos HTML con el valor formateado.
    document.getElementById('current-temp1-value').textContent = `${currentTemp1} °C`;
    document.getElementById('current-temp2-value').textContent = `${currentTemp2} °C`; 
    document.getElementById('current-signal-value').textContent = `${currentRssi} dBm`; 
    document.getElementById('current-battery-pct-value').textContent = `${currentBatteryPct} %`;
    document.getElementById('current-battery-volt-value').textContent = `${currentBatteryVolts} V`;

    document.getElementById('current-humidity-value').textContent = 'N/A'; // Este campo no se recibe actualmente.
    
    updateSignalIcon(currentRssi); // Llama a la función para actualizar el icono de señal.
    
    // Formateo y actualización de la marca de tiempo de la última lectura.
    const lastTime = new Date(lastReading.timestamp).toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit', second:'2-digit'});
    const lastDate = new Date(lastReading.timestamp).toLocaleDateString('es-ES');
    document.getElementById('currentTime').textContent = `${lastTime} (${lastDate})`;
}


// ==============================================================================
// 5. INICIALIZACIÓN (Entry Point)
// ==============================================================================

// Evento que se dispara cuando el DOM está completamente cargado.
document.addEventListener('DOMContentLoaded', () => {
    // 1. Carga inicial de datos y dibujo de gráficos.
    fetchAndDrawHistoricalData(); 
    
    // 2. Configura el 'polling': actualiza los datos cada 30 segundos.
    setInterval(fetchAndDrawHistoricalData, 30000); 
});
