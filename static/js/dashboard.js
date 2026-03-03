// --- VARIABLES GLOBALES ---
let chart1, chart2, chart3, chartVibraciones, chartModal;
let datosVibMemoria = []; 

document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    updateData();
    actualizarListaVibraciones();
    
    // Refresco automático de temperaturas cada 30 segundos
    setInterval(updateData, 30000);
});

// --- 1. CONFIGURACIÓN DE GRÁFICAS (FUENTES GRANDES Y 24H) ---
function initCharts() {
    const getOptions = (yTitle, y1Title = null) => {
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'minute', displayFormats: { minute: 'HH:mm', hour: 'HH:mm' } },
                    ticks: { font: { size: 14 }, color: '#333' }, // Fuente etiquetas X
                    title: { display: true, text: 'Hora', font: { size: 16, weight: 'bold' } }
                },
                y: {
                    ticks: { font: { size: 14 }, color: '#333' }, // Fuente etiquetas Y
                    title: { display: true, text: yTitle, font: { size: 16, weight: 'bold' } }
                }
            },
            plugins: {
                zoom: {
                    zoom: { wheel: { enabled: false }, drag: { enabled: true }, mode: 'x' },
                    pan: { enabled: true, mode: 'x' }
                }
            }
        };

        // Si hay un segundo eje Y (Humedad)
        if (y1Title) {
            options.scales.y1 = {
                position: 'right',
                min: 0, max: 100,
                ticks: { font: { size: 14 }, color: '#3498db' },
                title: { display: true, text: y1Title, font: { size: 16, weight: 'bold' } },
                grid: { drawOnChartArea: false }
            };
        }
        return options;
    };

    const ctx1 = document.getElementById('chart1').getContext('2d');
    const ctx2 = document.getElementById('chart2').getContext('2d');
    const ctx3 = document.getElementById('chart3').getContext('2d');
    const ctxV = document.getElementById('chartVibraciones').getContext('2d');
    const ctxM = document.getElementById('chartModal').getContext('2d');

    // Inicialización Estaciones (6 líneas: Ambiente, S1, S2, S3, S4, Humedad)
    chart1 = new Chart(ctx1, { type: 'line', data: { datasets: [] }, options: getOptions('Temperatura (°C)', 'Humedad (%)') });
    chart2 = new Chart(ctx2, { type: 'line', data: { datasets: [] }, options: getOptions('Temperatura (°C)', 'Humedad (%)') });
    chart3 = new Chart(ctx3, { type: 'line', data: { datasets: [] }, options: getOptions('Temperatura (°C)', 'Humedad (%)') });

    // Vibraciones (Eje X lineal por ser alta frecuencia)
    chartVibraciones = new Chart(ctxV, {
        type: 'line',
        data: { datasets: [{ label: 'Vibración', data: [], borderColor: '#e74c3c', borderWidth: 1, pointRadius: 0 }] },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false, parsing: false, normalized: true,
            scales: {
                x: { type: 'linear', ticks: { font: { size: 14 } }, title: { display: true, text: 'Tiempo (ms)', font: { size: 16, weight: 'bold' } } },
                y: { ticks: { font: { size: 14 } }, title: { display: true, text: 'Amplitud', font: { size: 16, weight: 'bold' } } }
            },
            plugins: { zoom: { zoom: { wheel: { enabled: false }, drag: { enabled: true }, mode: 'x' }, pan: { enabled: true, mode: 'x' } } }
        }
    });

    chartModal = new Chart(ctxM, { type: 'line', data: { datasets: [] }, options: getOptions('Valores') });
}

// --- 2. ACTUALIZACIÓN DE DATOS Y RECUADROS ---
async function updateData() {
    try {
        const res = await fetch('/api/history');
        const data = await res.json();
        if (!data || data.length === 0) return;

        // Hora en formato 24h
        document.getElementById('currentTime').textContent = "Sincronizado: " + new Date().toLocaleTimeString('es-ES', {hour: '2-digit', minute:'2-digit'});

        [1, 2, 3].forEach(num => {
            const filtered = data.filter(i => String(i.device_id).includes(num.toString())).sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
            if (filtered.length > 0) {
                const d = filtered[filtered.length - 1];
                
                // Rellenar Recuadros
                const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val ? val.toFixed(1) : "--"; };
                set(`d${num}-t`, d.t_aht); set(`d${num}-h`, d.h_aht);
                set(`d${num}-s1`, d.t1); set(`d${num}-s2`, d.t2); set(`d${num}-s3`, d.t3); set(`d${num}-s4`, d.t4);
                if(document.getElementById(`d${num}-rssi`)) document.getElementById(`d${num}-rssi`).textContent = d.rssi || "--";

                // Actualizar Gráfica (6 líneas)
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
    } catch (e) { console.error("Error cargando temperaturas:", e); }
}

// --- 3. FUNCIONES DE DESCARGA Y CONTROL ---

function moveChart(chart, offset) {
    const scale = chart.scales.x;
    const range = scale.max - scale.min;
    chart.options.scales.x.min = scale.min + (range * offset);
    chart.options.scales.x.max = scale.max + (range * offset);
    chart.update('none');
}

// Descargar Imagen PNG
function descargarImagen(chartInstance, nombreGrafica) {
    const link = document.createElement('a');
    link.download = `Captura_${nombreGrafica}_${new Date().getTime()}.png`;
    link.href = chartInstance.toBase64Image();
    link.click();
}

// Descargar CSV de la Vibración Cargada
function descargarCSVVibracion() {
    const dataPoints = chartVibraciones.data.datasets[0].data;
    if (!dataPoints || dataPoints.length === 0) {
        alert("Primero carga una captura del historial.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,Tiempo (ms),Amplitud\n";
    dataPoints.forEach(p => { csvContent += `${p.x},${p.y}\n`; });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Vibracion_Muestra_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- 4. LÓGICA DE VIBRACIONES ---

async function actualizarListaVibraciones() {
    try {
        const res = await fetch('/api/vibrations/list');
        const lista = await res.json();
        document.getElementById('select-vibraciones').innerHTML = lista.map(v => 
            `<option value="${v.id}">${new Date(v.fecha).toLocaleString('es-ES')}</option>`
        ).join('');
    } catch (e) { console.error("Error lista vib:", e); }
}

async function cargarVibracionHistorica() {
    const id = document.getElementById('select-vibraciones').value;
    if (!id) return;
    try {
        const res = await fetch(`/api/vibrations/get/${id}`);
        const data = await res.json();
        if (data && data.values) {
            // Frecuencia 5kHz -> 0.2ms por muestra
            chartVibraciones.data.datasets[0].data = data.values.map((y, i) => ({ x: i * 0.2, y: y }));
            chartVibraciones.update('none');
        }
    } catch (e) { console.error("Error cargando muestra:", e); }
}

function cerrarVisor() { document.getElementById('modal-visor').style.display = 'none'; }
