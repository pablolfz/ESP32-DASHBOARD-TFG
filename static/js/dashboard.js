let chart1, chart2, chart3, chartModal;
let activeChartId = null; 

// Guardar límites de zoom para que no se pierdan al actualizar
let userAxisLimits = { chart1: null, chart2: null, chart3: null };

document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    setupModalClick();
    updateData();
    setInterval(updateData, 30000);
});

function initCharts() {
    const getOptions = (idKey) => ({
        responsive: true, 
        maintainAspectRatio: false,
        scales: {
            x: { 
                type: 'time', 
                time: { unit: 'hour', displayFormats: { minute: 'HH:mm', hour: 'HH:mm' } },
                ticks: { autoSkip: true, minRotation: 45, maxRotation: 45, font: { size: 13, weight: '500' } },
                title: { display: true, text: 'Hora', font: { weight: 'bold', size: 14 } }
            },
            y: { 
                type: 'linear', position: 'left', 
                title: { display: true, text: 'Temperatura (°C)', font: { weight: 'bold', size: 15 }, color: '#c0392b' }
            },
            y1: { 
                type: 'linear', position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, 
                title: { display: true, text: 'Humedad (%)', font: { weight: 'bold', size: 15 }, color: '#2980b9' }
            }
        },
        plugins: { 
            legend: { position: 'bottom', labels: { boxWidth: 20, padding: 20, font: { size: 16, weight: 'bold' } } },
            zoom: { 
                pan: { enabled: true, mode: 'x', onPanComplete: ({chart}) => saveZoomState(idKey, chart) }, 
                zoom: { wheel: { enabled: true }, mode: 'x', onZoomComplete: ({chart}) => saveZoomState(idKey, chart) } 
            } 
        }
    });

    chart1 = new Chart(document.getElementById('chart1'), { type: 'line', data: { datasets: [] }, options: getOptions('chart1') });
    chart2 = new Chart(document.getElementById('chart2'), { type: 'line', data: { datasets: [] }, options: getOptions('chart2') });
    chart3 = new Chart(document.getElementById('chart3'), { type: 'line', data: { datasets: [] }, options: getOptions('chart3') });
    chartModal = new Chart(document.getElementById('chartModal'), { type: 'line', data: { datasets: [] }, options: getOptions('modal') });
}

function saveZoomState(id, chart) {
    if (id !== 'modal') {
        userAxisLimits[id] = { min: chart.scales.x.min, max: chart.scales.x.max };
    }
}

async function updateData() {
    try {
        const res = await fetch('/api/history');
        const fbData = await res.json();
        let data = Array.isArray(fbData) ? fbData : Object.values(fbData);
        if (!data.length) return;
        data.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));

        const now = new Date();
        const past24h = new Date(now.getTime() - (24 * 60 * 60 * 1000));

        const deviceIds = [['Estacion_1', 'Estacion_Remota'], ['Estacion_2'], ['Estacion_3']];
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
                    { label: 'Ambiente', data: clean('t_aht'), borderColor: '#f1c40f', backgroundColor: '#f1c40f', yAxisID: 'y', tension: 0.3, borderWidth: 4 },
                    { label: 'Humedad', data: clean('h_aht'), borderColor: '#3498db', backgroundColor: '#3498db', yAxisID: 'y1', borderDash: [5, 5], tension: 0.3, borderWidth: 3 },
                    { label: 'S1', data: clean('t1'), borderColor: '#e67e22', yAxisID: 'y', borderWidth: 3 },
                    { label: 'S2', data: clean('t2'), borderColor: '#2ecc71', yAxisID: 'y', borderWidth: 3 },
                    { label: 'S3', data: clean('t3'), borderColor: '#9b59b6', yAxisID: 'y', borderWidth: 3 },
                    { label: 'S4', data: clean('t4'), borderColor: '#34495e', yAxisID: 'y', borderWidth: 3 }
                ];

                // Mantener Zoom de usuario o ventana de 24h
                if (userAxisLimits[idKey]) {
                    chartObj.options.scales.x.min = userAxisLimits[idKey].min;
                    chartObj.options.scales.x.max = userAxisLimits[idKey].max;
                } else {
                    chartObj.options.scales.x.min = past24h;
                    chartObj.options.scales.x.max = now;
                }

                chartObj.update('none');
                
                // Actualizar Visor si está abierto
                if (activeChartId === idKey) {
                    chartModal.data = JSON.parse(JSON.stringify(chartObj.data));
                    chartModal.update('none');
                }

                updateUI(last, index + 1);
            }
        });
    } catch (e) { console.error(e); }
}

function setupModalClick() {
    [chart1, chart2, chart3].forEach((c, i) => {
        c.canvas.onclick = () => {
            const idKey = `chart${i+1}`;
            activeChartId = idKey;
            document.getElementById('modal-visor').style.display = 'block';
            document.getElementById('titulo-visor').textContent = `Estación ${i+1} - Vista Detallada`;
            
            chartModal.data = JSON.parse(JSON.stringify(c.data));
            chartModal.options.scales.x.min = c.scales.x.min;
            chartModal.options.scales.x.max = c.scales.x.max;
            chartModal.update();
        };
    });
}

function cerrarVisor() {
    document.getElementById('modal-visor').style.display = 'none';
    activeChartId = null;
}

function descargarImagen() {
    const link = document.createElement('a');
    link.download = `Estacion_${activeChartId}_${new Date().getTime()}.png`;
    link.href = chartModal.toBase64Image();
    link.click();
}

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
    const idKey = Object.keys(userAxisLimits).find(key => {
        if (key === 'chart1' && chart === chart1) return true;
        if (key === 'chart2' && chart === chart2) return true;
        if (key === 'chart3' && chart === chart3) return true;
        return false;
    });

    const newMin = scale.min + (range * pct);
    const newMax = scale.max + (range * pct);
    
    chart.options.scales.x.min = newMin;
    chart.options.scales.x.max = newMax;
    if(idKey) userAxisLimits[idKey] = { min: newMin, max: newMax };
    chart.update();
}

function goToDate(chart, dateStr) {
    if (!dateStr) return;
    const start = new Date(dateStr + "T00:00:00").getTime();
    const end = start + 86400000;
    chart.options.scales.x.min = start;
    chart.options.scales.x.max = end;
    chart.update();
}
