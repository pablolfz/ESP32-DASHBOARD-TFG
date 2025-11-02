// Archivo: static/js/dashboard.js

// Variable global para almacenar las instancias de las gráficas
let tempChartInstance, batteryChartInstance; // Instancias ajustadas (solo dos principales)

// Margen fijo de resolución y límites de seguridad
const RESOLUTION_MARGIN = 0.5; 
const TEMP_MIN_SAFETY = -15;
const TEMP_MAX_SAFETY = 60;

/**
 * Muestra un mensaje temporal en el dashboard.
 * @param {string} message Mensaje a mostrar.
 * @param {string} type 'success' o 'error'.
 */
function showMessage(message, type) {
    const container = document.getElementById('message-container');
    container.textContent = message;
    container.className = `message-container ${type}`;
    container.style.opacity = 1;
    container.style.display = 'block';

    setTimeout(() => {
        container.style.opacity = 0;
        setTimeout(() => {
            container.className = 'message-container hidden';
        }, 500); // Espera la transición de opacidad
    }, 5000); // Muestra por 5 segundos
}

/**
 * Función que inicia la descarga del archivo CSV llamando al endpoint de Flask.
 */
function downloadData() {
    showMessage('Iniciando descarga de CSV...', 'success');
    // Forzar la redirección para que el navegador descargue el archivo
    window.location.href = '/api/export'; 
}

/**
 * Pide confirmación para eliminar datos de la base de datos.
 */
async function confirmCleanup() {
    // Usamos el confirm nativo, ya que el archivo JS se ejecuta en el navegador del usuario.
    const isConfirmed = window.confirm("ADVERTENCIA: ¿Está seguro de que desea ELIMINAR todos los registros de la base de datos anteriores a 30 días? Esta acción es irreversible.");

    if (isConfirmed) {
        try {
            const response = await fetch('/api/cleanup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                const result = await response.json();
                showMessage(`Limpieza exitosa: ${result.message}`, 'success');
                // Forzar una actualización para reflejar el cambio en los gráficos
                fetchAndDrawHistoricalData(); 
            } else {
                const errorText = await response.text();
                throw new Error(`Fallo del servidor: ${response.status} - ${errorText}`);
            }
        } catch (error) {
            console.error('Error durante la limpieza de datos:', error);
            showMessage(`Fallo en la limpieza: Verifique el log de Render.`, 'error');
        }
    } else {
        showMessage('Limpieza cancelada.', 'error');
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
                }
            }
        }
    });

    window[canvasId + 'Instance'] = chartInstance;
}

/**
 * Actualiza el icono y el color del contenedor de señal basado en el RSSI.
 * (Lógica de icono de señal)
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
    // 2. CÁLCULO DE RANGO HORIZONTAL
    // ----------------------------------------------------
    const endTime = new Date(lastReading.timestamp).getTime();
    const ONE_HOUR_MS = 60 * 60 * 1000; 
    const startTime = endTime - ONE_HOUR_MS; 

    let xAxisConfig = {
        min: startTime,
        max: endTime 
    };

    // ----------------------------------------------------
    // 3. CÁLCULO Y DIBUJO DE GRÁFICAS (CORRECCIÓN 999.0)
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
        // CORRECCIÓN: FORZAR EL DIBUJO DEL CONTENEDOR AUNQUE NO HAYA DATOS VÁLIDOS (solo 999.0)
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
    
    // --- Lógica de la gráfica de batería ---
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
    } else {
         console.warn("ADVERTENCIA: No hay datos válidos para dibujar la batería.");
         // Dibujar contenedor vacío para la batería
         const battDatasets = [{ label: 'Voltaje de Batería (V)', data: batteryVolts, color: 'rgb(75, 192, 192)' }];
         battAxisConfig = { min: 3.0, max: 4.5, title: { display: true, text: 'Voltaje (V)' } };
         drawChart('batteryChart', battDatasets, labels, battAxisConfig, xAxisConfig);
    }

    // ----------------------------------------------------
    // 4. ACTUALIZACIÓN DE CAJAS 
    // ----------------------------------------------------
    
    // ⭐ Mapeo de datos para las cajas
    const currentTemp1 = lastReading.temp1 && lastReading.temp1 !== 999.0 ? lastReading.temp1.toFixed(1) : "Error";
    const currentTemp2 = lastReading.temp2 && lastReading.temp2 !== 999.0 ? lastReading.temp2.toFixed(1) : "Error";
    const currentRssi = lastReading.rssi ? lastReading.rssi : "No data";
    const currentBatteryPct = lastReading.pct !== undefined && lastReading.pct !== null ? Math.round(lastReading.pct) : "No data";
    const currentBatteryVolts = lastReading.batt ? lastReading.batt.toFixed(2) : "No data";
    
    // ⭐ Actualización de Contenido (Mapeando a IDs correctos del index.html)
    document.getElementById('current-temp1-value').textContent = `${currentTemp1} °C`;
    document.getElementById('current-temp2-value').textContent = `${currentTemp2} °C`; 
    document.getElementById('current-signal-value').textContent = `${currentRssi} dBm`; 
    document.getElementById('current-battery-pct-value').textContent = `${currentBatteryPct} %`;
    document.getElementById('current-battery-volt-value').textContent = `${currentBatteryVolts} V`;

    // Humedad se deja como N/A (ya que fue eliminada del hardware)
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
