/**
 * Dashboard Multisensor LoRa - Versión Final Robusta
 * Gestiona la visualización de dos dispositivos con gráficas independientes.
 */

let chart1, chart2;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicializar las gráficas con sus ejes
    initCharts();
    
    // 2. Carga inicial de datos desde la API
    updateData();
    
    // 3. Configurar el refresco automático cada 30 segundos
    setInterval(updateData, 30000); 
});

/**
 * Configura las instancias de Chart.js con ejes de tiempo
 */
function initCharts() {
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom' },
            tooltip: { mode: 'index', intersect: false }
        },
        scales: {
            x: { 
                type: 'time', 
                time: { 
                    unit: 'minute', 
                    displayFormats: { minute: 'HH:mm' } 
                },
                grid: { color: 'rgba(0, 0, 0, 0.05)' },
                title: { display: true, text: 'Hora de lectura' }
            },
            y: { 
                title: { display: true, text: 'Temperatura (°C)' },
                beginAtZero: false,
                grid: { color: 'rgba(0, 0, 0, 0.05)' }
            }
        }
    };

    // Inicializar Gráfica 1 (ID: tempChart)
    const ctx1 = document.getElementById('tempChart');
    if (ctx1) {
        chart1 = new Chart(ctx1, {
            type: 'line',
            data: { datasets: [] },
            options: commonOptions
        });
    }

    // Inicializar Gráfica 2 (ID: batteryChart)
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
 * Obtiene y procesa los datos de Firebase
 */
async function updateData() {
    try {
        const response = await fetch('/api/history');
        const raw = await response.json();
        
        // Convertir objeto de Firebase a Array
        let data = Array.isArray(raw) ? raw : Object.values(raw);
        
        if (!data || data.length === 0) return;

        // ORDENAR CRONOLÓGICAMENTE (Evita cortes en las líneas)
        data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Filtrar datos por Device ID
        const d1 = data.filter(i => i.device_id === 'Estacion_Remota' || i.device_id === 'Dispositivo_1');
        const d2 = data.filter(i => i.device_id === 'Dispositivo_2');

        // Función para limpiar valores erróneos (-127 o nulos)
        const clean = (arr, key) => arr.map(i => (i[key] != null && i[key] > -100) ? i[key] : null);

        // ACTUALIZAR DISPOSITIVO 1
        if (chart1 && d1.length > 0) {
            chart1.data.labels = d1.map(i => new Date(i.timestamp));
            chart1.data.datasets = [
                { label: 'Ambiente', data: clean(d1, 't_aht'), borderColor: '#f1c40f', backgroundColor: 'transparent', tension: 0.3 },
                { label: 'Sonda 1', data: clean(d1, 't1'), borderColor: '#e67e22', backgroundColor: 'transparent' },
                { label: 'Sonda 2', data: clean(d1, 't2'), borderColor: '#3498db', backgroundColor: 'transparent' },
                { label: 'Sonda 3', data: clean(d1, 't3'), borderColor: '#9b59b6', backgroundColor: 'transparent' },
                { label: 'Sonda 4', data: clean(d1, 't4'), borderColor: '#95a5a6', backgroundColor: 'transparent' }
            ];
            chart1.update();
            refreshUI(d1[d1.length - 1], 'dev1');
        }

        // ACTUALIZAR DISPOSITIVO 2
        if (chart2 && d2.length > 0) {
            chart2.data.labels = d2.map(i => new Date(i.timestamp));
            chart2.data.datasets = [
                { label: 'D2 - S1', data: clean(d2, 't1'), borderColor: '#2ecc71', backgroundColor: 'transparent' },
                { label: 'D2 - S2', data: clean(d2, 't2'), borderColor: '#27ae60', backgroundColor: 'transparent' },
                { label: 'D2 - S3', data: clean(d2, 't3'), borderColor: '#16a085', backgroundColor: 'transparent' },
                { label: 'D2 - S4', data: clean(d2, 't4'), borderColor: '#1abc9c', backgroundColor: 'transparent' }
            ];
            chart2.update();
            refreshUI(d2[d2.length - 1], 'dev2');
        }
    } catch (e) {
        console.error("Error cargando datos:", e);
    }
}

/**
 * Actualiza los valores de las tarjetas superiores
 */
function refreshUI(last, dev) {
    const fmt = (v) => (v != null && v > -100) ? parseFloat(v).toFixed(1) : "--";
    
    if (dev === 'dev1') {
        setTxt('current-temp1-value', fmt(last.t_aht) + " °C");
        setTxt('current-humidity-value', fmt(last.h_aht) + " %");
        setTxt('current-signal-value', (last.rssi || "--") + " dBm");
        setTxt('val-t1', fmt(last.t1));
        setTxt('val-t2', fmt(last.t2));
        setTxt('val-t3', fmt(last.t3));
        setTxt('val-t4', fmt(last.t4));
        setTxt('currentTime', "Sincronizado: " + new Date(last.timestamp).toLocaleTimeString());
    } else {
        setTxt('dev2-t1', fmt(last.t1));
        setTxt('dev2-t2', fmt(last.t2));
        setTxt('dev2-t3', fmt(last.t3));
        setTxt('dev2-t4', fmt(last.t4));
    }
}

/**
 * Helper para actualizar texto de forma segura
 */
function setTxt(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}
