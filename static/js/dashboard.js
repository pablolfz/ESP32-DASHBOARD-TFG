// --- VARIABLES GLOBALES ---
let chart1, chart2, chart3, chartModal, chartVibraciones;
let datosVibMemoria = []; 

document.addEventListener('DOMContentLoaded', () => {
    initTempsCharts();
    initVibChart();
    
    updateData(); // Carga inicial de temperaturas
    actualizarListaVibraciones(); // Carga lista de capturas
    
    setInterval(updateData, 30000); // Refresco cada 30s
});

// --- 1. CONFIGURACIÓN DE GRÁFICAS (TEMPERATURAS) ---
function initTempsCharts() {
    const getOptions = (id) => ({
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { type: 'time', time: { unit: 'hour' } },
            y: { title: { display: true, text: 'Temp (°C)' } }
        },
        plugins: {
            zoom: {
                zoom: { wheel: { enabled: false }, drag: { enabled: true }, mode: 'x' },
                pan: { enabled: true, mode: 'x' }
            }
        }
    });

    chart1 = new Chart(document.getElementById('chart1').getContext('2d'), { type: 'line', data: { datasets: [] }, options: getOptions('chart1') });
    chart2 = new Chart(document.getElementById('chart2').getContext('2d'), { type: 'line', data: { datasets: [] }, options: getOptions('chart2') });
    chart3 = new Chart(document.getElementById('chart3').getContext('2d'), { type: 'line', data: { datasets: [] }, options: getOptions('chart3') });
    chartModal = new Chart(document.getElementById('chartModal').getContext('2d'), { type: 'line', data: { datasets: [] }, options: getOptions('modal') });
}

// --- 2. CONFIGURACIÓN VIBRACIONES (25K PUNTOS) ---
function initVibChart() {
    chartVibraciones = new Chart(document.getElementById('chartVibraciones').getContext('2d'), {
        type: 'line',
        data: { datasets: [{ label: 'Vibración', data: [], borderColor: '#e74c3c', borderWidth: 1, pointRadius: 0 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            parsing: false,
            normalized: true,
            scales: {
                x: { type: 'linear', title: { display: true, text: 'Tiempo (ms)' } },
                y: { title: { display: true, text: 'Amplitud' } }
            },
            plugins: {
                zoom: { zoom: { wheel: { enabled: false }, drag: { enabled: true }, mode: 'x' }, pan: { enabled: true, mode: 'x' } }
            }
        }
    });

    // Clic en gráfica pequeña abre el visor grande
    document.getElementById('chartVibraciones').onclick = () => abrirMaxivisorVibracion();
}

// --- 3. ACTUALIZACIÓN DE DATOS (RECUADROS DE COLORES) ---
async function updateData() {
    try {
        const res = await fetch('/api/history');
        const data = await res.json();
        if (!data.length) return;

        // IDs de dispositivos a filtrar
        const stations = ['Estacion_1', 'Estacion_2', 'Estacion_3'];
        
        stations.forEach((id, idx) => {
            const filtered = data.filter(i => i.device_id === id).sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
            if (filtered.length > 0) {
                const latest = filtered[filtered.length - 1];
                actualizarRecuadros(latest, idx + 1);
                
                // Actualizar gráficas pequeñas
                const chartObj = [chart1, chart2, chart3][idx];
                chartObj.data.labels = filtered.map(i => new Date(i.timestamp));
                chartObj.data.datasets = [
                    { label: 'Ambiente', data: filtered.map(i => i.t_aht), borderColor: '#f1c40f' },
                    { label: 'S1', data: filtered.map(i => i.t1), borderColor: '#e67e22' }
                ];
                chartObj.update('none');
            }
        });
    } catch (e) { console.error("Error updateData:", e); }
}

function actualizarRecuadros(d, id) {
    // Rellena los b con ID d1-t, d1-h, d1-s1, etc.
    if(document.getElementById(`d${id}-t`)) document.getElementById(`d${id}-t`).textContent = d.t_aht.toFixed(1) + "°";
    if(document.getElementById(`d${id}-h`)) document.getElementById(`d${id}-h`).textContent = d.h_aht.toFixed(1) + "%";
    if(document.getElementById(`d${id}-s1`)) document.getElementById(`d${id}-s1`).textContent = d.t1.toFixed(1) + "°";
    if(document.getElementById(`d${id}-s2`)) document.getElementById(`d${id}-s2`).textContent = d.t2.toFixed(1) + "°";
    if(document.getElementById(`d${id}-s3`)) document.getElementById(`d${id}-s3`).textContent = d.t3.toFixed(1) + "°";
    if(document.getElementById(`d${id}-s4`)) document.getElementById(`d${id}-s4`).textContent = d.t4.toFixed(1) + "°";
    if(document.getElementById(`d${id}-rssi`)) document.getElementById(`d${id}-rssi`).textContent = d.rssi + " dBm";
}

// --- 4. CONTROLES MANUALES ---
function controlGrafica(accion, chartKey) {
    let chart;
    if (chartKey === 'modal') chart = chartModal;
    else if (chartKey === 'vib') chart = chartVibraciones;
    else if (chartKey === 'chart1') chart = chart1;
    // ... extender para otros si es necesario

    const scale = chart.scales.x;
    const range = scale.max - scale.min;

    if (accion === 'reset') chart.resetZoom();
    if (accion === 'left') { chart.options.scales.x.min = scale.min - (range * 0.1); chart.options.scales.x.max = scale.max - (range * 0.1); }
    if (accion === 'right') { chart.options.scales.x.min = scale.min + (range * 0.1); chart.options.scales.x.max = scale.max + (range * 0.1); }
    chart.update('none');
}

// --- 5. VIBRACIONES HISTÓRICAS ---
async function actualizarListaVibraciones() {
    const res = await fetch('/api/vibrations/list');
    const lista = await res.json();
    const select = document.getElementById('select-vibraciones');
    select.innerHTML = lista.map(v => `<option value="${v.id}">${new Date(v.fecha).toLocaleString()}</option>`).join('');
}

async function cargarVibracionHistorica() {
    const id = document.getElementById('select-vibraciones').value;
    const res = await fetch(`/api/vibrations/get/${id}`);
    const data = await res.json();
    if (data && data.values) {
        datosVibMemoria = data.values;
        const points = data.values.map((y, i) => ({ x: i * 0.2, y: y }));
        chartVibraciones.data.datasets[0].data = points;
        chartVibraciones.update('none');
    }
}

function abrirMaxivisorVibracion() {
    document.getElementById('modal-visor').style.display = 'block';
    document.getElementById('titulo-visor').textContent = "Captura Alta Resolución";
    chartModal.data.datasets = [{ label: 'Vibración', data: chartVibraciones.data.datasets[0].data, borderColor: '#e74c3c', borderWidth: 1, pointRadius: 0 }];
    chartModal.options.scales.x.type = 'linear';
    chartModal.update();
}

function cerrarVisor() { document.getElementById('modal-visor').style.display = 'none'; }
