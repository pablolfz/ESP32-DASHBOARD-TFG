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
                    // ⭐ AJUSTE: Reducido a 30px para menos espacio
                    bottom: 30 
                }
            },

            scales: {
                x: {
                    ...xAxisConfig,
                    type: 'time', 
                    time: {
                        // ⭐ AJUSTE: Unidad cambiada a 'second' para más granularidad
                        unit: 'second', 
                        displayFormats: {
                            // ⭐ AJUSTE: Formato para mostrar segundos
                            second: 'HH:mm:ss',
                            minute: 'HH:mm:ss', 
                            hour: 'HH:mm'
                        },
                        distribution: 'linear', 
                        bounds: 'ticks'
                    },
                    ticks: {
                        // ⭐ AJUSTE: autoSkip en 'true' para que gestione la superposición
                        autoSkip: true,
                        autoSkipPadding: 30, // Espacio entre etiquetas
                        maxRotation: 30, // Rotación ajustada
                        minRotation: 30, // Rotación ajustada
                        font: {
                            size: 12
                        },
                        padding: 10,
                        crossAlign: 'near'
                        // Quitamos maxTicksLimit y stepSize para dejar que Chart.js decida
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
                        text: datasets[0].label.includes('Temperatura') ? 'Temperatura / Humedad' : datasets[0].label.includes('Presión') ? 'Presión (hPa)' : ''
                    },
                    ticks: {
                        // ⭐ AJUSTE: autoSkip en 'false' y maxTicksLimit para más líneas
                        autoSkip: false,
                        maxTicksLimit: 30,
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
    // 1. EXTRACCIÓN Y FILTRADO DE DATOS (ACTUALIZADO PARA LORA CSV)
    // ----------------------------------------------------
    
    const labels = data.map(item => item.timestamp); 
    
    // Helper para filtrar nulos
    const mapAndFilter = (key) => data.map(item => {
        const val = item[key];
        return typeof val === 'number' && !isNaN(val) ? val : null;
    });

    // Mapeo corregido a las claves del ESP32 ('temp', 'hum', 'pres')
    const temperatures = mapAndFilter('temp'); 
    const humidities = mapAndFilter('hum'); 
    const pressures = mapAndFilter('pres');    
    
    // ----------------------------------------------------
    // 2. CÁLCULO DE RANGO HORIZONTAL (Eje X)
    // ----------------------------------------------------
    const endTime = new Date(lastReading.timestamp).getTime();
    
    // Configuración del eje X para el gráfico de TEMP/HUM
    let tempXAxisConfig = {};
    if (forceReset || !window.tempChartInstance) {
        const firstTime = new Date(data[0].timestamp).getTime();
        const margin = 5 * 60 * 1000;
        tempXAxisConfig = {
            min: firstTime - margin,
            max: endTime + margin
        };
    } else { // Si no es un reseteo y el gráfico existe, MANTENER SU ZOOM
        const scale = window.tempChartInstance.scales.x;
        tempXAxisConfig = {
            min: scale.min,
            max: scale.max
        };
    }

    // Configuración del eje X para el gráfico de PRESIÓN (antes batería)
    let battXAxisConfig = {};
    if (forceReset || !window.batteryChartInstance) {
        const firstTime = new Date(data[0].timestamp).getTime();
        const margin = 5 * 60 * 1000;
        battXAxisConfig = {
            min: firstTime - margin,
            max: endTime + margin
        };
    } else { 
        const scale = window.batteryChartInstance.scales.x;
        battXAxisConfig = {
            min: scale.min,
            max: scale.max
        };
    }


    // ----------------------------------------------------
    // 3. CÁLCULO Y DIBUJO DE GRÁFICAS (Zoom Inteligente en Y)
    // ----------------------------------------------------

    const validTemps = temperatures.filter(v => v !== null && v !== 999.0);
    const validHums = humidities.filter(v => v !== null && v !== 999.0);
    const validPressures = pressures.filter(v => v !== null);

    let tempAxisConfig = {}; 
    let battAxisConfig = {}; // Se usa para presión ahora

    if (validTemps.length > 0) {
        const minTemp = Math.min(...validTemps); 
        const maxTemp = Math.max(...validTemps); 
        
        // Ajuste de zoom Y para Temp
        tempAxisConfig = {
            min: Math.floor(minTemp - 1.0), 
            max: Math.ceil(maxTemp + 30.0) // Aumentamos margen superior para que quepa la humedad si está alta
        };

        if (tempAxisConfig.min < TEMP_MIN_SAFETY) tempAxisConfig.min = TEMP_MIN_SAFETY;
        
        // Dataset Temperatura y Humedad juntos
        const tempDatasets = [
            { label: 'Temperatura (°C)', data: temperatures, color: 'rgb(255, 165, 0)' },
            { label: 'Humedad (%)', data: humidities, color: 'rgb(54, 162, 235)' }
        ];
        
        drawChart('tempChart', tempDatasets, labels, tempAxisConfig, tempXAxisConfig); 

    } else {
        // Fallback si no hay datos
        tempAxisConfig = { min: 10, max: 40, title: { display: true, text: 'Temperatura' } };
        const tempDatasets = [
             { label: 'Temperatura (°C)', data: temperatures, color: 'rgb(255, 165, 0)' }
        ];
        drawChart('tempChart', tempDatasets, labels, tempAxisConfig, tempXAxisConfig); 
    }
    
    // --- GRÁFICO 2: PRESIÓN (Usando el canvas 'batteryChart') ---
    if (validPressures.length > 0) { 
         const minPres = Math.min(...validPressures);
         const maxPres = Math.max(...validPressures);
         
         battAxisConfig = { // Configuración Y para Presión
             min: minPres - 2,
             max: maxPres + 2,
             title: { display: true, text: 'Presión (hPa)' }
         };

         const presDatasets = [
             { label: 'Presión (hPa)', data: pressures, color: 'rgb(153, 102, 255)' }
         ];

         drawChart('batteryChart', presDatasets, labels, battAxisConfig, battXAxisConfig);
    } else {
         battAxisConfig = { min: 900, max: 1100, title: { display: true, text: 'Presión (hPa)' } };
         const presDatasets = [{ label: 'Presión (hPa)', data: pressures, color: 'rgb(153, 102, 255)' }];
         drawChart('batteryChart', presDatasets, labels, battAxisConfig, battXAxisConfig);
    }

    // ----------------------------------------------------
    // 4. ACTUALIZACIÓN DE CAJAS (Contenido y Hora)
    // ----------------------------------------------------
    
    // Usamos las claves correctas: temp, hum, pres
    const currentTemp = lastReading.temp !== undefined ? lastReading.temp.toFixed(1) : "N/A";
    const currentHum = lastReading.hum !== undefined ? lastReading.hum.toFixed(1) : "N/A";
    const currentPres = lastReading.pres !== undefined ? lastReading.pres.toFixed(1) : "N/A";
    const currentRssi = lastReading.rssi ? lastReading.rssi : "N/A";
    
    // Mapeamos a los IDs existentes en tu HTML
    // Caja 1 (Temp)
    document.getElementById('current-temp1-value').textContent = `${currentTemp} °C`;
    
    // Caja 2 (Ahora Humedad) - Si usas temp2 en HTML, lo sobreescribimos visualmente
    const temp2Label = document.getElementById('current-temp2-value');
    if(temp2Label) temp2Label.textContent = `${currentHum} %`; 

    // Caja Humedad explícita (si existe en HTML)
    const humLabel = document.getElementById('current-humidity-value');
    if(humLabel) humLabel.textContent = `${currentHum} %`;

    // Caja Voltaje/Batería (Ahora Presión)
    const battLabel = document.getElementById('current-battery-volt-value');
    if(battLabel) battLabel.textContent = `${currentPres} hPa`;
    
    const battPctLabel = document.getElementById('current-battery-pct-value');
    if(battPctLabel) battPctLabel.textContent = ""; // Limpiamos porcentaje si no aplica

    document.getElementById('current-signal-value').textContent = `${currentRssi} dBm`; 
    
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
