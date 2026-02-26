let chart1, chart2, chart3;

document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    updateData();
    setInterval(updateData, 30000);
});

function initCharts() {
    const getOptions = () => ({
        responsive: true, maintainAspectRatio: false,
        scales: {
            x: { 
                type: 'time', 
                time: { unit: 'minute', displayFormats: { minute: 'HH:mm', hour: 'HH:mm' } },
                ticks: { autoSkip: true, maxRotation: 0, font: { size: 10 } }
            },
            y: { type: 'linear', position: 'left', ticks: { font: { size: 10 } } },
            y1: { type: 'linear', position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, ticks: { font: { size: 10 } } }
        },
        plugins: { 
            legend: { labels: { boxWidth: 12, font: { size: 10 } } },
            zoom: { pan: { enabled: true, mode: 'x' }, zoom: { wheel: { enabled: false }, mode: 'x' } } 
        }
    });

    chart1 = new Chart(document.getElementById('chart1'), { type: 'line', data: { datasets: [] }, options: getOptions() });
    chart2 = new Chart(document.getElementById('chart2'), { type: 'line', data: { datasets: [] }, options: getOptions() });
    chart3 = new Chart(document.getElementById('chart3'), { type: 'line', data: { datasets: [] }, options: getOptions() });
}

async function updateData() {
    try {
        const res = await fetch('/api/history');
        const fbData = await res.json();
        let data = Array.isArray(fbData) ? fbData : Object.values(fbData);
        if (!data.length) return;
        data.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));

        const deviceIds = [['Estacion_1', 'Estacion_Remota'], ['Estacion_2'], ['Estacion_3']];
        const charts = [chart1, chart2, chart3];

        deviceIds.forEach((ids, index) => {
            const d = data.filter(i => ids.includes(i.device_id));
            if (charts[index] && d.length > 0) {
                const last = d[d.length - 1];
                const clean = (key) => d.map(i => (i[key] != null && i[key] > -100) ? i[key] : null);
                charts[index].data.labels = d.map(i => new Date(i.timestamp));
                charts[index].data.datasets = [
                    { label: 'Ambiente', data: clean('t_aht'), borderColor: '#f1c40f', yAxisID: 'y' },
                    { label: 'Humedad', data: clean('h_aht'), borderColor: '#3498db', yAxisID: 'y1', borderDash: [5, 5] },
                    { label: 'S1', data: clean('t1'), borderColor: '#e67e22', yAxisID: 'y' },
                    { label: 'S2', data: clean('t2'), borderColor: '#2ecc71', yAxisID: 'y' }
                ];
                charts[index].update('none');
                updateUI(last, index + 1);
            }
        });
    } catch (e) { console.error(e); }
}

function updateUI(l, id) {
    const fmt = (v) => v != null ? parseFloat(v).toFixed(1) : "--";
    const tElem = document.getElementById(`d${id}-t`);
    if(tElem) {
        tElem.textContent = fmt(l.t_aht) + "°";
        document.getElementById(`d${id}-h`).textContent = fmt(l.h_aht) + "%";
        for(let s=1; s<=4; s++) document.getElementById(`d${id}-s${s}`).textContent = fmt(l[`t${s}`]) + "°";
        document.getElementById(`d${id}-rssi`).textContent = (l.rssi || "--");
    }
    if(id === 1) document.getElementById('currentTime').textContent = "Último: " + new Date(l.timestamp).toLocaleTimeString('es-ES', {hour:'2-digit', minute:'2-digit', hour12:false});
}

// FUNCIONES DE CONTROL MANUAL
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
    const end = start + 86400000;
    chart.options.scales.x.min = start;
    chart.options.scales.x.max = end;
    chart.update();
}
