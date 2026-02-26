/**
 * Dashboard Multisensor LoRa - Versión Final con Fuentes Ampliadas
 * Optimizada para legibilidad y visualización de dos dispositivos.
 */

let chart1, chart2;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicializar las estructuras de las gráficas
    initCharts();
    
    // 2. Primera carga de datos
    updateData();
    
    // 3. Configurar refresco automático cada 30 segundos
    setInterval(updateData, 30000); 
});

/**
 * Configuración de Chart.js con fuentes grandes y líneas gruesas
 */
function initCharts() {
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        elements: {
            line: {
                borderWidth: 3, // Líneas más gruesas para que se vean mejor
                tension: 0.3    // Curvatura suave
            },
            point: {
                radius: 2,      // Puntos pequeños en cada lectura
                hoverRadius: 6
            }
        },
        plugins: {
            legend: { 
                position: 'bottom',
                labels: {
                    font: {
                        size: 16,        // Fuente de leyenda más grande
                        weight: 'bold'
                    },
                    padding: 20
                }
            },
            tooltip: { 
                mode: 'index', 
                intersect: false,
                titleFont: { size: 16 },
                bodyFont: { size: 14 }
            }
        },
        scales: {
            x: { 
                type: 'time', 
                time: { 
                    unit: 'minute', 
                    displayFormats: { minute: 'HH:mm' } 
                },
                title: { 
                    display: true, 
                    text: 'Hora de lectura',
                    font: { size: 18, weight: 'bold' }, // Título X grande
                    color: '#2c3e50'
                },
                ticks: {
                    font: { size: 14, weight: '600' }, // Números de hora grandes
                    color: '#2c3e50'
                },
                grid: { color: 'rgba(0, 0, 0, 0.08)' }
            },
            y: { 
                title: { 
                    display: true, 
                    text: 'Temperatura (°C)',
                    font: { size: 18, weight: 'bold' }, // Título Y grande
                    color: '#2c3e50'
                },
                beginAtZero: false,
                ticks: {
                    font: { size: 15, weight: '600' }, // Números de grados grandes
                    color: '#2c3e50'
                },
                grid: { color: 'rgba(0, 0, 0, 0.08)' }
            }
        }
    };

    // Gráfica para Dispositivo 1 (ID: tempChart)
    const ctx1 = document.getElementById('tempChart');
    if (ctx1) {
        chart1 = new Chart(ctx1, {
            type: 'line',
            data: { datasets: [] },
            options: commonOptions
        });
    }

    // Gráfica para Dispositivo 2 (ID: batteryChart)
    const ctx2 = document.getElementById('batteryChart');
    if (ctx2) {
        chart2 = new Chart(ctx2, {
            type: 'line',
            data: { datasets: [] },
            options: commonOptions
        });
    }
}

/**
 * Obtiene los datos de Firebase a través de la API Flask
 */
async function updateData() {
    try {
        const response = await fetch('/api/history');
        const raw = await response.json();
        
        let data = Array.isArray(raw) ? raw : Object.values(raw);
        if (!data || data.length === 0) return;

        // ORDENAR CRONOLÓGICAMENTE (Evita saltos en las líneas)
        data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Separar dispositivos
        const d1 = data.filter(i => i.device_id === 'Estacion_Remota' || i.device_id === 'Dispositivo_1');
        const d2 = data.filter(i => i.device_id === 'Dispositivo_2');

        const clean = (arr, key) => arr.map(i => (i[key] != null && i[key] > -100) ? i[key] : null);

        // --- ACTUALIZAR GRÁFICA 1 ---
        if (chart1 && d1.length > 0) {
            chart1.data.labels = d1.map(i => new Date(i.timestamp));
            chart1.data.datasets = [
                { label: 'Ambiente', data: clean(d1, 't_aht'), borderColor: '#f1c40f' },
                { label: 'Sonda 1', data: clean(d1, 't1'), borderColor: '#e67e22' },
                { label: 'Sonda 2', data: clean(d1, 't2'), borderColor: '#3498db' },
                { label: 'Sonda 3', data: clean(d1, 't3'), borderColor: '#9b59b6' },
                { label: 'Sonda 4', data: clean(d1, 't4'), borderColor: '#95a5a6' }
            ];
            chart1.update();
            refreshCards(d1[d1.length - 1], 'dev1');
        }

        // --- ACTUALIZAR GRÁFICA 2 ---
        if (chart2 && d2.length > 0) {
            chart2.data.labels = d2.map(i => new Date(i.timestamp));
            chart2.data.datasets = [
                { label: 'D2 - S1', data: clean(d2, 't1'), borderColor: '#2ecc71' },
                { label: 'D2 - S2', data: clean(d2, 't2'), borderColor: '#27ae60' },
                { label: 'D2 - S3', data: clean(d2, 't3'), borderColor: '#16a085' },
                { label: 'D2 - S4', data: clean(d2, 't4'), borderColor: '#1abc9c' }
            ];
            chart2.update();
            refreshCards(d2[d2.length - 1], 'dev2');
        }

    } catch (error) {
        console.error("Error al actualizar datos:", error);
    }
}

/**
 * Actualiza los valores numéricos de las tarjetas superiores
 */
function refreshCards(last, device) {
    const fmt = (val) => (val != null && val > -100) ? parseFloat(val).toFixed(1) : "--";

    if (device === 'dev1') {
        setElementText('current-temp1-value', fmt(last.t_aht) + " °C");
        setElementText('current-humidity-value', fmt(last.h_aht) + " %");
        setElementText('current-signal-value', (last.rssi || "--") + " dBm");
        setElementText('val-t1', fmt(last.t1));
        setElementText('val-t2', fmt(last.t2));
        setElementText('val-t3', fmt(last.t3));
        setElementText('val-t4', fmt(last.t4));
        
        if (last.timestamp) {
            setElementText('currentTime', "Sincronizado: " + new Date(last.timestamp).toLocaleTimeString());
        }
    } else {
        setElementText('dev2-t1', fmt(last.t1));
        setElementText('dev2-t2', fmt(last.t2));
        setElementText('dev2-t3', fmt(last.t3));
        setElementText('dev2-t4', fmt(last.t4));
    }
}

function setElementText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}
