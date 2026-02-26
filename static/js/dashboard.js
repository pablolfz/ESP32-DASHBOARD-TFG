/**
 * Dashboard Multisensor LoRa - Versión Final Completa
 * Incluye 4 sondas por dispositivo y controles de gráfica avanzados.
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
 * Configuración de Chart.js con fuentes grandes y zoom por botones
 */
function initCharts() {
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        elements: {
            line: { borderWidth: 3, tension: 0.3 },
            point: { radius: 3 }
        },
        plugins: {
            legend: { 
                position: 'bottom',
                labels: { font: { size: 16, weight: 'bold' } }
            },
            zoom: {
                pan: { enabled: true, mode: 'x' },
                zoom: { 
                    wheel: { enabled: false }, // Desactivado por petición
                    pinch: { enabled: false }, // Desactivado por petición
                    mode: 'x' 
                }
            }
        },
        scales: {
            x: { 
                type: 'time', 
                time: { unit: 'minute', displayFormats: { minute: 'HH:mm' } },
                title: { display: true, text: 'Hora de lectura', font: { size: 18, weight: 'bold' } },
                ticks: { font: { size: 14 } }
            },
            y: { 
                title: { display: true, text: 'Temperatura (°C)', font: { size: 18, weight: 'bold' } },
                ticks: { font: { size: 15 } },
                grid: { color: 'rgba(0, 0, 0, 0.1)' }
            }
        }
    };

    const ctx1 = document.getElementById('tempChart');
    const ctx2 = document.getElementById('batteryChart');

    if (ctx1) chart1 = new Chart(ctx1, { type: 'line', data: { datasets: [] }, options: commonOptions });
    if (ctx2) chart2 = new Chart(ctx2, { type: 'line', data: { datasets: [] }, options: commonOptions });
}

/**
 * Funciones de control manual para los botones de la interfaz
 */
function moveChart(chart, pct) {
    const scale = chart.scales.x;
    const range = scale.max - scale.min;
    chart.options.scales.x.min = scale.min + (range * pct);
    chart.options.scales.x.max = scale.max + (range * pct);
    chart.update();
}

function goToDate(chart, dateStr) {
    if (!dateStr) return;
    const start = new Date(dateStr + "T00:00:00").getTime();
    const end = start + (24 * 60 * 60 * 1000);
    chart.options.scales.x.min = start;
    chart.options.scales.x.max = end;
    chart.update();
}

/**
 * Obtención y filtrado de datos desde Firebase
 */
async function updateData() {
    try {
        const res = await fetch('/api/history');
        const fbData = await res.json();
        let data = Array.isArray(fbData) ? fbData : Object.values(fbData);
        if (!data.length) return;

        // Ordenar cronológicamente para evitar saltos en las líneas
        data.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));

        const d1 = data.filter(i => i.device_id === 'Estacion_Remota' || i.device_id === 'Dispositivo_1');
        const d2 = data.filter(i => i.device_id === 'Dispositivo_2');

        const clean = (arr, key) => arr.map(i => (i[key] != null && i[key] > -100) ? i[key] : null);

        // ACTUALIZAR DISPOSITIVO 1 (Ambiente + 4 Sondas)
        if (chart1 && d1.length) {
            chart1.data.labels = d1.map(i => new Date(i.timestamp));
            chart1.data.datasets = [
                { label: 'Ambiente', data: clean(d1, 't_aht'), borderColor: '#f1c40f' },
                { label: 'S1', data: clean(d1, 't1'), borderColor: '#e67e22' },
                { label: 'S2', data: clean(d1, 't2'), borderColor: '#3498db' },
                { label: 'S3', data: clean(d1, 't3'), borderColor: '#9b59b6' },
                { label: 'S4', data: clean(d1, 't4'), borderColor: '#95a5a6' }
            ];
            chart1.update('none');
            refreshUI(d1[d1.length-1], 'dev1');
        }

        // ACTUALIZAR DISPOSITIVO 2 (4 Sondas)
        if (chart2 && d2.length) {
            chart2.data.labels = d2.map(i => new Date(i.timestamp));
            chart2.data.datasets = [
                { label: 'D2-S1', data: clean(d2, 't1'), borderColor: '#2ecc71' },
                { label: 'D2-S2', data: clean(d2, 't2'), borderColor: '#27ae60' },
                { label: 'D2-S3', data: clean(d2, 't3'), borderColor: '#e67e22' },
                { label: 'D2-S4', data: clean(d2, 't4'), borderColor: '#d35400' }
            ];
            chart2.update('none');
            refreshUI(d2[d2.length-1], 'dev2');
        }
    } catch (e) {
        console.error("Error cargando datos:", e);
    }
}

/**
 * Actualiza los textos de los recuadros superiores
 */
function refreshUI(last, dev) {
    const fmt = (v) => (v != null && v > -100) ? parseFloat(v).toFixed(1) : "--";
    
    if (dev === 'dev1') {
        document.getElementById('current-temp1-value').textContent = fmt(last.t_aht) + " °C";
        document.getElementById('current-humidity-value').textContent = fmt(last.h_aht) + " %";
        document.getElementById('val-t1').textContent = fmt(last.t1) + " °C";
        document.getElementById('val-t2').textContent = fmt(last.t2) + " °C";
        document.getElementById('val-t3').textContent = fmt(last.t3) + " °C";
        document.getElementById('val-t4').textContent = fmt(last.t4) + " °C";
        document.getElementById('current-signal-value').textContent = (last.rssi || "--") + " dBm";
        document.getElementById('currentTime').textContent = "Última sincronización: " + new Date(last.timestamp).toLocaleTimeString();
    } else {
        document.getElementById('dev2-t1').textContent = fmt(last.t1) + " °C";
        document.getElementById('dev2-t2').textContent = fmt(last.t2) + " °C";
        document.getElementById('dev2-t3').textContent = fmt(last.t3) + " °C";
        document.getElementById('dev2-t4').textContent = fmt(last.t4) + " °C";
    }
}
