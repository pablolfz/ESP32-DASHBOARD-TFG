let chart1, chart2, chart3, chartVibTotal, chartVibPolar, chartModal;

document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    updateData();
    actualizarListaVibraciones();
    setInterval(updateData, 30000);
});

// --- 1. INICIALIZACIÓN DE GRÁFICAS ---
function initCharts() {
    const getOptions = (yTitle, isTime = true) => ({
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { 
                type: isTime ? 'time' : 'linear',
                time: isTime ? { unit: 'minute', displayFormats: { minute: 'HH:mm' } } : {},
                ticks: { font: { size: 14 } },
                title: { display: true, text: isTime ? 'Hora' : 'Tiempo (ms)', font: { size: 16, weight: 'bold' } }
            },
            y: { ticks: { font: { size: 14 } }, title: { display: true, text: yTitle, font: { size: 16, weight: 'bold' } } },
            y1: { 
                display: isTime, position: 'right', min: 0, max: 100,
                ticks: { font: { size: 14 }, color: '#3498db' },
                title: { display: true, text: 'Hum (%)', font: { size: 16, weight: 'bold' } },
                grid: { drawOnChartArea: false }
            }
        },
        plugins: { 
            zoom: { 
                zoom: { 
                    wheel: { enabled: false }, // Rueda del ratón desactivada por tu preferencia
                    drag: { enabled: true },   
                    mode: 'x' 
                }, 
                pan: { enabled: true, mode: 'x' } 
            },
            legend: { labels: { font: { size: 12 } } }
        }
    });

    chart1 = new Chart(document.getElementById('chart1').getContext('2d'), { type: 'line', data: { datasets: [] }, options: getOptions('Temp (°C)') });
    chart2 = new Chart(document.getElementById('chart2').getContext('2d'), { type: 'line', data: { datasets: [] }, options: getOptions('Temp (°C)') });
    chart3 = new Chart(document.getElementById('chart3').getContext('2d'), { type: 'line', data: { datasets: [] }, options: getOptions('Temp (°C)') });

    chartVibTotal = new Chart(document.getElementById('chartVibTotal').getContext('2d'), {
        type: 'line',
        data: { datasets: [] },
        options: { ...getOptions('Amplitud', false), animation: false, parsing: false, normalized: true }
    });

    chartVibPolar = new Chart(document.getElementById('chartVibPolar').getContext('2d'), {
        type: 'line',
        data: { datasets: [] },
        options: { ...getOptions('Amplitud Separada', false), animation: false, parsing: false, normalized: true }
    });

    chartModal = new Chart(document.getElementById('chartModal').getContext('2d'), { type: 'line', data: { datasets: [] }, options: getOptions('Valores') });
}

// --- 2. ACTUALIZACIÓN TEMPERATURAS REAL-TIME ---
async function updateData() {
    try {
        const res = await fetch('/api/history');
        const data = await res.json();
        if (!data || data.length === 0) return;

        document.getElementById('currentTime').textContent = "Sincronizado: " + new Date().toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'});

        const charts = [chart1, chart2, chart3];
        [1, 2, 3].forEach(num => {
            const filtered = data.filter(i => String(i.device_id).includes(num.toString())).sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
            if (filtered.length > 0) {
                const d = filtered[filtered.length - 1];
                const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val ? val.toFixed(1) : "--"; };
                
                set(`d${num}-t`, d.t_aht); set(`d${num}-h`, d.h_aht);
                set(`d${num}-s1`, d.t1); set(`d${num}-s2`, d.t2); set(`d${num}-s3`, d.t3); set(`d${num}-s4`, d.t4);
                if(document.getElementById(`d${num}-rssi`)) document.getElementById(`d${num}-rssi`).textContent = d.rssi || "--";

                const cObj = charts[num-1];
                cObj.data.datasets = [
                    { label: 'Ambiente', data: filtered.map(i => ({x: new Date(i.timestamp), y: i.t_aht})), borderColor: '#f1c40f', yAxisID: 'y' },
                    { label: 'S1', data: filtered.map(i => ({x: new Date(i.timestamp), y: i.t1})), borderColor: '#e67e22' },
                    { label: 'S2', data: filtered.map(i => ({x: new Date(i.timestamp), y: i.t2})), borderColor: '#9b59b6' },
                    { label: 'S3', data: filtered.map(i => ({x: new Date(i.timestamp), y: i.t3})), borderColor: '#00acc1' },
                    { label: 'S4', data: filtered.map(i => ({x: new Date(i.timestamp), y: i.t4})), borderColor: '#1abc9c' },
                    { label: 'Humedad', data: filtered.map(i => ({x: new Date(i.timestamp), y: i.h_aht})), borderColor: '#3498db', yAxisID: 'y1', borderDash: [5,5] }
                ];
                cObj.update('none');
            }
        });
    } catch (e) { console.error(e); }
}

// --- 3. LÓGICA PIEZOELÉCTRICO ---
async function actualizarListaVibraciones() {
    try {
        const res = await fetch('/api/vibrations/list');
        const lista = await res.json();
        document.getElementById('select-vibraciones').innerHTML = lista.map(v => 
            `<option value="${v.id}">${new Date(v.fecha).toLocaleString('es-ES')}</option>`
        ).join('');
    } catch (e) { console.error(e); }
}

async function cargarVibracionHistorica() {
    const id = document.getElementById('select-vibraciones').value;
    const res = await fetch(`/api/vibrations/get/${id}`);
    const data = await res.json();
    
    if (data && data.v1 && data.v2 && data.v3) {
        const freq = data.frecuencia || 5000; 
        const tStep = (1 / freq) * 1000; 

        chartVibTotal.options.plugins.title = {
            display: true,
            text: `Frecuencia de muestreo: ${freq} Hz`,
            font: { size: 14 }
        };

        chartVibTotal.data.datasets = [
            { label: 'Sensor 1', data: data.v1.map((y, i) => ({x: i*tStep, y: y})), borderColor: '#e74c3c', borderWidth: 1, pointRadius: 0 },
            { label: 'Sensor 2', data: data.v2.map((y, i) => ({x: i*tStep, y: y})), borderColor: '#2ecc71', borderWidth: 1, pointRadius: 0 },
            { label: 'Sensor 3', data: data.v3.map((y, i) => ({x: i*tStep, y: y})), borderColor: '#3498db', borderWidth: 1, pointRadius: 0 }
        ];

        chartVibPolar.data.datasets = [];
        const colores = ['#e74c3c', '#2ecc71', '#3498db'];
        const señales = [data.v1, data.v2, data.v3];

        señales.forEach((v, idx) => {
            chartVibPolar.data.datasets.push({
                label: `S${idx+1} (+)`,
                data: v.map((y, i) => ({x: i*tStep, y: y > 0 ? y : 0})),
                borderColor: colores[idx], borderWidth: 1, pointRadius: 0
            });
            chartVibPolar.data.datasets.push({
                label: `S${idx+1} (-)`,
                data: v.map((y, i) => ({x: i*tStep, y: y < 0 ? y : 0})),
                borderColor: colores[idx], borderDash: [5, 5], borderWidth: 1, pointRadius: 0
            });
        });

        chartVibTotal.resetZoom();
        chartVibPolar.resetZoom();
        chartVibTotal.update('none');
        chartVibPolar.update('none');
    }
}

// --- 4. CONTROLES DE ZOOM Y VISOR ---

function hacerZoom(chart, porcentaje) {
    chart.zoom(porcentaje);
}

function abrirMaxivisor(chartOrigen, titulo) {
    document.getElementById('modal-visor').style.display = 'block';
    document.getElementById('titulo-visor').textContent = titulo;

    const esTiempo = chartOrigen.options.scales.x.type === 'time';
    chartModal.options.scales.x.type = chartOrigen.options.scales.x.type;

    chartModal.data = JSON.parse(JSON.stringify(chartOrigen.data));
    if(esTiempo) {
        chartModal.data.datasets.forEach(ds => { ds.data.forEach(p => p.x = new Date(p.x)); });
    }
    
    setTimeout(() => {
        chartModal.resetZoom();
        chartModal.update('none');
    }, 100);
}

function moveChart(chart, offset) {
    const scale = chart.scales.x;
    const range = scale.max - scale.min;
    chart.options.scales.x.min = scale.min + (range * offset);
    chart.options.scales.x.max = scale.max + (range * offset);
    chart.update('none');
}

function descargarImagen(chart, nombre) {
    const link = document.createElement('a');
    link.download = `${nombre}_${new Date().getTime()}.png`;
    link.href = chart.toBase64Image();
    link.click();
}

/** * NUEVA FUNCIÓN: Descarga el CSV directamente desde el servidor Flask
 * con el formato compatible para el visor de escritorio (PIEZOS-VIEWER)
 */
function descargarCSVVibracion() {
    const id = document.getElementById('select-vibraciones').value;
    if (!id) return alert("Selecciona una muestra primero");
    
    // Llamamos a la nueva ruta de Flask que creamos anteriormente
    // Esto asegura que el archivo tenga la cabecera "Modo: X, Frecuencia: Y"
    window.location.href = `/api/vibrations/download_csv/${id}`;
}

function cerrarVisor() { document.getElementById('modal-visor').style.display = 'none'; }
