let chart1, chart2, chart3, chartVibraciones, chartModal;
let datosVibMemoria = [];

document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    updateData();
    actualizarListaVibraciones();
    // Refresco automático de la pantalla principal cada 30 segundos
    setInterval(updateData, 30000);
});

// --- 1. CONFIGURACIÓN DE GRÁFICAS (FUENTES Y 24H) ---
function initCharts() {
    const getOptions = (yTitle, isTime = true) => {
        return {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: isTime ? 'time' : 'linear',
                    time: isTime ? { unit: 'minute', displayFormats: { minute: 'HH:mm', hour: 'HH:mm' } } : {},
                    ticks: { font: { size: 14 }, color: '#333' },
                    title: { display: true, text: isTime ? 'Hora' : 'Tiempo (ms)', font: { size: 16, weight: 'bold' } }
                },
                y: {
                    ticks: { font: { size: 14 }, color: '#333' },
                    title: { display: true, text: yTitle, font: { size: 16, weight: 'bold' } }
                },
                y1: {
                    display: isTime, // Solo para temperaturas (Humedad)
                    position: 'right',
                    min: 0, max: 100,
                    ticks: { font: { size: 14 }, color: '#3498db' },
                    title: { display: true, text: 'Hum (%)', font: { size: 16, weight: 'bold' } },
                    grid: { drawOnChartArea: false }
                }
            },
            plugins: {
                zoom: {
                    zoom: { wheel: { enabled: false }, drag: { enabled: true }, mode: 'x' },
                    pan: { enabled: true, mode: 'x' }
                }
            }
        };
    };

    chart1 = new Chart(document.getElementById('chart1').getContext('2d'), { type: 'line', data: { datasets: [] }, options: getOptions('Temp (°C)') });
    chart2 = new Chart(document.getElementById('chart2').getContext('2d'), { type: 'line', data: { datasets: [] }, options: getOptions('Temp (°C)') });
    chart3 = new Chart(document.getElementById('chart3').getContext('2d'), { type: 'line', data: { datasets: [] }, options: getOptions('Temp (°C)') });

    chartVibraciones = new Chart(document.getElementById('chartVibraciones').getContext('2d'), {
        type: 'line',
        data: { datasets: [{ label: 'Piezo', data: [], borderColor: '#e74c3c', borderWidth: 1, pointRadius: 0 }] },
        options: { ...getOptions('Amplitud', false), animation: false, parsing: false, normalized: true }
    });

    // Gráfica del Modal (Se configura dinámicamente al abrir)
    chartModal = new Chart(document.getElementById('chartModal').getContext('2d'), { type: 'line', data: { datasets: [] }, options: getOptions('Valores') });
}

// --- 2. ACTUALIZACIÓN DE DATOS REAL-TIME ---
async function updateData() {
    try {
        const res = await fetch('/api/history');
        const data = await res.json();
        if (!data || data.length === 0) return;

        document.getElementById('currentTime').textContent = "Sincronizado: " + new Date().toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'});

        [1, 2, 3].forEach(num => {
            const filtered = data.filter(i => String(i.device_id).includes(num.toString())).sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
            if (filtered.length > 0) {
                const d = filtered[filtered.length - 1];
                
                // Unidades en recuadros
                const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val ? val.toFixed(1) : "--"; };
                set(`d${num}-t`, d.t_aht); set(`d${num}-h`, d.h_aht);
                set(`d${num}-s1`, d.t1); set(`d${num}-s2`, d.t2); set(`d${num}-s3`, d.t3); set(`d${num}-s4`, d.t4);
                if(document.getElementById(`d${num}-rssi`)) document.getElementById(`d${num}-rssi`).textContent = d.rssi || "--";

                // Gráfica de estación (6 líneas)
                const chartObj = [chart1, chart2, chart3][num-1];
                chartObj.data.datasets = [
                    { label: 'Ambiente', data: filtered.map(i => ({x: new Date(i.timestamp), y: i.t_aht})), borderColor: '#f1c40f', yAxisID: 'y' },
                    { label: 'S1', data: filtered.map(i => ({x: new Date(i.timestamp), y: i.t1})), borderColor: '#e67e22' },
                    { label: 'S2', data: filtered.map(i => ({x: new Date(i.timestamp), y: i.t2})), borderColor: '#9b59b6' },
                    { label: 'S3', data: filtered.map(i => ({x: new Date(i.timestamp), y: i.t3})), borderColor: '#00acc1' },
                    { label: 'S4', data: filtered.map(i => ({x: new Date(i.timestamp), y: i.t4})), borderColor: '#1abc9c' },
                    { label: 'Humedad', data: filtered.map(i => ({x: new Date(i.timestamp), y: i.h_aht})), borderColor: '#3498db', yAxisID: 'y1', borderDash: [5,5] }
                ];
                chartObj.update('none');
            }
        });
    } catch (e) { console.error(e); }
}

// --- 3. MAXIVISOR (ESTÁTICO AL ACTUALIZAR) ---
function abrirMaxivisor(chartOrigen, titulo) {
    document.getElementById('modal-visor').style.display = 'block';
    document.getElementById('titulo-visor').textContent = titulo;

    // Clonamos datos para que no se actualicen solos
    chartModal.data = JSON.parse(JSON.stringify(chartOrigen.data));
    
    // Si es tipo tiempo, convertimos los strings de vuelta a objetos Date
    if (chartOrigen.options.scales.x.type === 'time') {
        chartModal.options.scales.x.type = 'time';
        chartModal.data.datasets.forEach(ds => {
            ds.data.forEach(p => { p.x = new Date(p.x); });
        });
    } else {
        chartModal.options.scales.x.type = 'linear';
    }
    
    chartModal.resetZoom();
    chartModal.update('none');
}

// --- 4. FUNCIONES DE DESCARGA ---
function descargarImagen(chart, nombre) {
    const link = document.createElement('a');
    link.download = `${nombre}_${new Date().getTime()}.png`;
    link.href = chart.toBase64Image();
    link.click();
}

function descargarCSVVibracion() {
    const data = chartVibraciones.data.datasets[0].data;
    if (!data.length) return alert("Carga una muestra primero");
    let csv = "Tiempo (ms),Amplitud\n" + data.map(p => `${p.x},${p.y}`).join("\n");
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Piezo_Muestra_${new Date().getTime()}.csv`;
    link.click();
}

// --- 5. CONTROL MANUAL Y PIEZOELÉCTRICO ---
function moveChart(chart, offset) {
    const scale = chart.scales.x;
    const range = scale.max - scale.min;
    chart.options.scales.x.min = scale.min + (range * offset);
    chart.options.scales.x.max = scale.max + (range * offset);
    chart.update('none');
}

async function actualizarListaVibraciones() {
    const res = await fetch('/api/vibrations/list');
    const lista = await res.json();
    document.getElementById('select-vibraciones').innerHTML = lista.map(v => 
        `<option value="${v.id}">${new Date(v.fecha).toLocaleString('es-ES')}</option>`
    ).join('');
}

async function cargarVibracionHistorica() {
    const id = document.getElementById('select-vibraciones').value;
    const res = await fetch(`/api/vibrations/get/${id}`);
    const data = await res.json();
    if (data && data.values) {
        datosVibMemoria = data.values;
        chartVibraciones.data.datasets[0].data = data.values.map((y, i) => ({ x: i * 0.2, y: y }));
        chartVibraciones.update('none');
    }
}

function cerrarVisor() { document.getElementById('modal-visor').style.display = 'none'; }
