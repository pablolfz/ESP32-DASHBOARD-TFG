// --- VARIABLES GLOBALES ---
let chart1, chart2, chart3, chartModal, chartVibraciones;
let activeChartId = null; 
let datosVibMemoria = []; // Almacena los 25k puntos para el visor grande

// Persistencia de zoom para temperaturas
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
                    wheel: { enabled: false }, // REGLA: Sin rueda de ratón
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

// --- 2. GRÁFICA DE VIBRACIONES (ALTA DENSIDAD) ---
function initVibChart() {
    const optionsVib = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false, // OFF para rendimiento con 25k puntos
        parsing: false,   // Los datos se pasan ya formateados como {x, y}
        normalized: true,
        scales: {
            x: { type: 'linear', title: { display: true, text: 'Tiempo (ms)' } },
            y: { title: { display: true, text: 'Amplitud (RAW)' } }
        },
        plugins: {
            zoom: {
                pan: { enabled: true, mode: 'x' },
                zoom: { 
                    wheel: { enabled: false }, // REGLA: Sin rueda de ratón
                    drag: { enabled: true }, 
                    mode: 'x' 
                }
            },
            legend: { display: false }
        }
    };

    const ctxV = document.getElementById('chartVibraciones').getContext('2d');
    chartVibraciones = new Chart(ctxV, {
        type: 'line',
        data: { datasets: [{ label: 'Vibración', data: [], borderColor: '#e74c3c', borderWidth: 1, pointRadius: 0 }] },
        options: optionsVib
    });

    // Abrir visor grande al hacer clic en la gráfica pequeña
    document.getElementById('chartVibraciones').onclick = () => abrirMaxivisorVibracion();
}

// --- 3. LÓGICA DE DATOS Y RENDERIZADO ---
async function actualizarListaVibraciones() {
    try {
        const res = await fetch('/api/vibrations/list');
        const lista = await res.json();
        const select = document.getElementById('select-vibraciones');
        
        if (!lista || lista.length === 0) {
            select.innerHTML = '<option>No hay capturas disponibles</option>';
            return;
        }

        select.innerHTML = lista.map(v => 
            `<option value="${v.id}">${new Date(v.fecha).toLocaleString()} - ${v.device || 'Sensor 4G'}</option>`
        ).join('');
        
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
            datosVibMemoria = data.values;
            renderizarVibracion(data.values);
        }
    } catch (e) { console.error("Error cargando vibración:", e); }
}

function renderizarVibracion(valores) {
    // 5kHz -> 0.2ms por muestra
    const points = valores.map((y, i) => ({ x: i * 0.2, y: y }));
    chartVibraciones.data.datasets[0].data = points;
    chartVibraciones.resetZoom();
    chartVibraciones.update('none');
}

// --- 4. MAXIVISOR Y CONTROLES POR BOTONES ---
function abrirMaxivisorVibracion() {
    if (!datosVibMemoria.length) return;
    
    const modal = document.getElementById('modal-visor');
    modal.style.display = 'block';
    document.getElementById('titulo-visor').textContent = "Análisis Detallado de Vibración (25k pts)";

    chartModal.data.datasets = [{
        label: 'Señal',
        data: chartVibraciones.data.datasets[0].data,
        borderColor: '#e74c3c',
        borderWidth: 1,
        pointRadius: 0
    }];
    
    chartModal.options.scales.x.type = 'linear';
    chartModal.resetZoom();
    chartModal.update('none');
}

function controlGrafica(accion) {
    // Detectamos si operamos sobre el modal o la gráfica principal
    const isModal = document.getElementById('modal-visor').style.display === 'block';
    const chart = isModal ? chartModal : chartVibraciones;
    
    const scale = chart.scales.x;
    const range = scale.max - scale.min;

    switch(accion) {
        case 'in': chart.zoom(1.2); break;
        case 'out': chart.zoom(0.8); break;
        case 'reset': chart.resetZoom(); break;
        case 'left':
            chart.options.scales.x.min = scale.min - (range * 0.1);
            chart.options.scales.x.max = scale.max - (range * 0.1);
            break;
        case 'right':
            chart.options.scales.x.min = scale.min + (range * 0.1);
            chart.options.scales.x.max = scale.max + (range * 0.1);
            break;
    }
    chart.update('none');
}

// --- 5. FUNCIONES DE APOYO ---
async function updateData() {
    try {
        const res = await fetch('/api/history');
        const data = await res.json();
        if (!data.length) return;

        const deviceIds = [['Estacion_1'], ['Estacion_2'], ['Estacion_3']];
        const charts = [chart1, chart2, chart3];

        deviceIds.forEach((ids, index) => {
            const d = data.filter(i => ids.includes(i.device_id)).sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
            const chartObj = charts[index];
            if (chartObj && d.length > 0) {
                chartObj.data.labels = d.map(i => new Date(i.timestamp));
                chartObj.data.datasets = [
                    { label: 'Ambiente', data: d.map(i => i.t_aht), borderColor: '#f1c40f', yAxisID: 'y' },
                    { label: 'Humedad', data: d.map(i => i.h_aht), borderColor: '#3498db', yAxisID: 'y1', borderDash: [5, 5] },
                    { label: 'S1', data: d.map(i => i.t1), borderColor: '#e67e22' }
                ];
                chartObj.update('none');
                updateUI(d[d.length-1], index + 1);
            }
        });
    } catch (e) { console.error("Error Temps:", e); }
}

function saveZoomState(id, chart) {
    if (id !== 'modal') userAxisLimits[id] = { min: chart.scales.x.min, max: chart.scales.x.max };
}

function setupModalClick() {
    [chart1, chart2, chart3].forEach((c, i) => {
        c.canvas.onclick = () => {
            document.getElementById('modal-visor').style.display = 'block';
            document.getElementById('titulo-visor').textContent = `Estación ${i+1}`;
            chartModal.data = JSON.parse(JSON.stringify(c.data));
            chartModal.options.scales.x.type = 'time';
            chartModal.update();
        };
    });
}

function cerrarVisor() { document.getElementById('modal-visor').style.display = 'none'; }

function updateUI(l, id) {
    const tElem = document.getElementById(`d${id}-t`);
    if(tElem) {
        tElem.textContent = (l.t_aht || 0).toFixed(1) + "°";
        document.getElementById(`d${id}-h`).textContent = (l.h_aht || 0).toFixed(1) + "%";
        document.getElementById(`d${id}-rssi`).textContent = (l.rssi || "--") + " dBm";
    }
}
