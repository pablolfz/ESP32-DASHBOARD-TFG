// --- VARIABLES GLOBALES ---
let chart1, chart2, chart3, chartModal, chartVibraciones;
let activeChartId = null; 
let datosVibActual = []; // Almacena los 25k puntos de la captura activa

// Persistencia de zoom para temperaturas (evita saltos al actualizar cada 30s)
let userAxisLimits = { chart1: null, chart2: null, chart3: null };

document.addEventListener('DOMContentLoaded', () => {
    initTempsCharts();
    initVibChart();
    setupModalClick();
    
    // Carga inicial
    updateData(); // Temperaturas
    actualizarListaVibraciones(); // Lista de capturas
    
    // Refresco automático de temperaturas cada 30 segundos
    setInterval(updateData, 30000);
});

// --- 1. INICIALIZACIÓN DE GRÁFICAS DE TEMPERATURA ---
function initTempsCharts() {
    const getOptions = (idKey) => ({
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { 
                type: 'time', 
                time: { unit: 'hour', displayFormats: { minute: 'HH:mm', hour: 'HH:mm' } },
                ticks: { autoSkip: true, minRotation: 45, maxRotation: 45 },
                title: { display: true, text: 'Hora' }
            },
            y: { type: 'linear', position: 'left', title: { display: true, text: 'Temp. (°C)' } },
            y1: { type: 'linear', position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: 'Hum. (%)' } }
        },
        plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 15, font: { weight: 'bold' } } },
            zoom: {
                pan: { enabled: true, mode: 'x', onPanComplete: ({chart}) => saveZoomState(idKey, chart) },
                zoom: { 
                    wheel: { enabled: false }, // Desactivado según tu preferencia
                    drag: { enabled: true }, 
                    mode: 'x', 
                    onZoomComplete: ({chart}) => saveZoomState(idKey, chart) 
                }
            }
        }
    });

    const ctx1 = document.getElementById('chart1').getContext('2d');
    const ctx2 = document.getElementById('chart2').getContext('2d');
    const ctx3 = document.getElementById('chart3').getContext('2d');
    const ctxM = document.getElementById('chartModal').getContext('2d');

    chart1 = new Chart(ctx1, { type: 'line', data: { datasets: [] }, options: getOptions('chart1') });
    chart2 = new Chart(ctx2, { type: 'line', data: { datasets: [] }, options: getOptions('chart2') });
    chart3 = new Chart(ctx3, { type: 'line', data: { datasets: [] }, options: getOptions('chart3') });
    chartModal = new Chart(ctxM, { type: 'line', data: { datasets: [] }, options: getOptions('modal') });
}

// --- 2. INICIALIZACIÓN DE GRÁFICA DE VIBRACIONES (ALTA DENSIDAD) ---
function initVibChart() {
    const ctxV = document.getElementById('chartVibraciones').getContext('2d');
    chartVibraciones = new Chart(ctxV, {
        type: 'line',
        data: { datasets: [{ label: 'Vibración (Amplitud)', data: [], borderColor: '#e74c3c', borderWidth: 1, pointRadius: 0, fill: false }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false, // OFF para rendimiento con 25k puntos
            parsing: false,   // OFF: Los datos se pasan ya formateados como {x, y}
            normalized: true,
            scales: {
                x: { type: 'linear', title: { display: true, text: 'Tiempo (ms)' } },
                y: { title: { display: true, text: 'Amplitud' } }
            },
            plugins: {
                zoom: {
                    pan: { enabled: true, mode: 'x' },
                    zoom: { wheel: { enabled: false }, drag: { enabled: true }, mode: 'x' }
                }
            }
        }
    });
}

// --- 3. LÓGICA DE DATOS (TEMPERATURAS) ---
async function updateData() {
    try {
        const res = await fetch('/api/history');
        const fbData = await res.json();
        let data = Array.isArray(fbData) ? fbData : Object.values(fbData);
        if (!data.length) return;

        data = data.filter(i => i && i.timestamp).sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
        const now = new Date();
        const past24h = new Date(now.getTime() - (24 * 60 * 60 * 1000));

        const deviceIds = [['Estacion_1'], ['Estacion_2'], ['Estacion_3']];
        const charts = [chart1, chart2, chart3];

        deviceIds.forEach((ids, index) => {
            const d = data.filter(i => ids.includes(i.device_id));
            const chartObj = charts[index];
            const idKey = `chart${index + 1}`;

            if (chartObj && d.length > 0) {
                const last = d[d.length - 1];
                const clean = (key) => d.map(i => (i[key] != null && i[key] > -100) ? i[key] : null);
                
                chartObj.data.labels = d.map(i => new Date(i.timestamp));
                chartObj.data.datasets = [
                    { label: 'Ambiente', data: clean('t_aht'), borderColor: '#f1c40f', yAxisID: 'y', tension: 0.3 },
                    { label: 'Humedad', data: clean('h_aht'), borderColor: '#3498db', yAxisID: 'y1', borderDash: [5, 5] },
                    { label: 'S1', data: clean('t1'), borderColor: '#e67e22', yAxisID: 'y' },
                    { label: 'S2', data: clean('t2'), borderColor: '#2ecc71', yAxisID: 'y' },
                    { label: 'S3', data: clean('t3'), borderColor: '#9b59b6', yAxisID: 'y' },
                    { label: 'S4', data: clean('t4'), borderColor: '#34495e', yAxisID: 'y' }
                ];

                // Mantener zoom de usuario o ventana de 24h
                if (userAxisLimits[idKey]) {
                    chartObj.options.scales.x.min = userAxisLimits[idKey].min;
                    chartObj.options.scales.x.max = userAxisLimits[idKey].max;
                } else {
                    chartObj.options.scales.x.min = past24h;
                    chartObj.options.scales.x.max = now;
                }

                chartObj.update('none');
                updateUI(last, index + 1);
            }
        });
    } catch (e) { console.error("Error en Temps:", e); }
}

// --- 4. LÓGICA DE VIBRACIONES ---
async function actualizarListaVibraciones() {
    try {
        const res = await fetch('/api/vibrations/list');
        const lista = await res.json();
        const select = document.getElementById('select-vibraciones');
        
        if (lista.length === 0) {
            select.innerHTML = '<option>No hay capturas disponibles</option>';
            return;
        }

        select.innerHTML = lista.map(v => 
            `<option value="${v.id}">${new Date(v.fecha).toLocaleString()} - ${v.device}</option>`
        ).join('');
        
        // Cargar la más reciente automáticamente al inicio
        cargarVibracionHistorica();
    } catch (e) { console.error("Error lista vib:", e); }
}

async function cargarVibracionHistorica() {
    const id = document.getElementById('select-vibraciones').value;
    if (!id) return;

    try {
        const res = await fetch(`/api/vibrations/get/${id}`);
        const data = await res.json();
        if (data && data.values) {
            datosVibActual = data.values;
            renderizarVibracion(data.values);
        }
    } catch (e) { console.error("Error cargando vibración:", e); }
}

function renderizarVibracion(valores) {
    // Frecuencia 5kHz -> 1 muestra cada 0.2ms
    const points = valores.map((y, i) => ({ x: i * 0.2, y: y }));
    
    chartVibraciones.data.datasets[0].data = points;
    chartVibraciones.resetZoom();
    chartVibraciones.update('none');
}

function descargarCSVVibraciones() {
    if (!datosVibActual.length) return alert("Selecciona una captura primero");
    
    let csv = "Tiempo(ms),Amplitud\n";
    datosVibActual.forEach((v, i) => {
        csv += `${(i * 0.2).toFixed(2)},${v}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vibracion_${new Date().getTime()}.csv`;
    a.click();
}

// --- 5. FUNCIONES AUXILIARES ---
function saveZoomState(id, chart) {
    if (id !== 'modal') userAxisLimits[id] = { min: chart.scales.x.min, max: chart.scales.x.max };
}

function resetUserLimit(id) {
    userAxisLimits[id] = null;
    updateData();
}

function setupModalClick() {
    [chart1, chart2, chart3].forEach((c, i) => {
        c.canvas.onclick = () => {
            activeChartId = `chart${i+1}`;
            document.getElementById('modal-visor').style.display = 'block';
            document.getElementById('titulo-visor').textContent = `Estación ${i+1} - Análisis Detallado`;
            chartModal.data = JSON.parse(JSON.stringify(c.data));
            chartModal.options.scales.x.min = c.scales.x.min;
            chartModal.options.scales.x.max = c.scales.x.max;
            chartModal.update();
        };
    });
}

function cerrarVisor() { document.getElementById('modal-visor').style.display = 'none'; }

function updateUI(l, id) {
    const fmt = (v) => v != null ? parseFloat(v).toFixed(1) : "--";
    const tElem = document.getElementById(`d${id}-t`);
    if(tElem) {
        tElem.textContent = fmt(l.t_aht) + "°";
        document.getElementById(`d${id}-h`).textContent = fmt(l.h_aht) + "%";
        for(let s=1; s<=4; s++) {
            const el = document.getElementById(`d${id}-s${s}`);
            if(el) el.textContent = fmt(l[`t${s}`]) + " °C";
        }
        const rssiEl = document.getElementById(`d${id}-rssi`);
        if(rssiEl) rssiEl.textContent = (l.rssi || "--") + " dBm";
    }
    if(id === 1) document.getElementById('currentTime').textContent = "Hora de sincronización: " + new Date(l.timestamp).toLocaleTimeString('es-ES', {hour:'2-digit', minute:'2-digit', hour12:false});
}

function moveChart(chart, pct) {
    const scale = chart.scales.x;
    const range = scale.max - scale.min;
    chart.options.scales.x.min = scale.min + (range * pct);
    chart.options.scales.x.max = scale.max + (range * pct);
    chart.update();
}
