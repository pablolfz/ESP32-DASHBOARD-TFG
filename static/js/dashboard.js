let chart1, chart2, chart3, chartVibraciones, chartModal;

document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    updateData();
    actualizarListaVibraciones();
    setInterval(updateData, 30000);
});

function initCharts() {
    const timeOptions = {
        type: 'time',
        time: { unit: 'minute', displayFormats: { minute: 'HH:mm', hour: 'HH:mm' } },
        ticks: { source: 'auto' },
        title: { display: true, text: 'Hora' }
    };

    const getOptions = () => ({
        responsive: true,
        maintainAspectRatio: false,
        scales: { 
            x: timeOptions,
            y: { title: { display: true, text: 'Temp (°C)' } },
            y1: { position: 'right', title: { display: true, text: 'Hum (%)' }, grid: { drawOnChartArea: false }, min: 0, max: 100 }
        },
        plugins: { zoom: { zoom: { wheel: { enabled: false }, drag: { enabled: true }, mode: 'x' }, pan: { enabled: true, mode: 'x' } } }
    });

    chart1 = new Chart(document.getElementById('chart1').getContext('2d'), { type: 'line', data: { datasets: [] }, options: getOptions() });
    chart2 = new Chart(document.getElementById('chart2').getContext('2d'), { type: 'line', data: { datasets: [] }, options: getOptions() });
    chart3 = new Chart(document.getElementById('chart3').getContext('2d'), { type: 'line', data: { datasets: [] }, options: getOptions() });

    chartVibraciones = new Chart(document.getElementById('chartVibraciones').getContext('2d'), {
        type: 'line',
        data: { datasets: [{ label: 'Vibración', data: [], borderColor: '#e74c3c', borderWidth: 1, pointRadius: 0 }] },
        options: { 
            responsive: true, maintainAspectRatio: false, animation: false, parsing: false, normalized: true,
            scales: { x: { type: 'linear', title: { display: true, text: 'Tiempo (ms)' } } },
            plugins: { zoom: { zoom: { wheel: { enabled: false }, drag: { enabled: true }, mode: 'x' }, pan: { enabled: true, mode: 'x' } } }
        }
    });

    chartModal = new Chart(document.getElementById('chartModal').getContext('2d'), { type: 'line', data: { datasets: [] }, options: getOptions() });
}

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
                // Llenar recuadros
                const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val ? val.toFixed(1) : "--"; };
                set(`d${num}-t`, d.t_aht); set(`d${num}-h`, d.h_aht);
                set(`d${num}-s1`, d.t1); set(`d${num}-s2`, d.t2); set(`d${num}-s3`, d.t3); set(`d${num}-s4`, d.t4);
                if(document.getElementById(`d${num}-rssi`)) document.getElementById(`d${num}-rssi`).textContent = d.rssi || "--";

                // Actualizar gráfica de la estación
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
    document.getElementById('select-vibraciones').innerHTML = lista.map(v => `<option value="${v.id}">${new Date(v.fecha).toLocaleString('es-ES')}</option>`).join('');
}

async function cargarVibracionHistorica() {
    const id = document.getElementById('select-vibraciones').value;
    const res = await fetch(`/api/vibrations/get/${id}`);
    const data = await res.json();
    if (data && data.values) {
        chartVibraciones.data.datasets[0].data = data.values.map((y, i) => ({ x: i * 0.2, y: y }));
        chartVibraciones.update('none');
    }
}

function cerrarVisor() { document.getElementById('modal-visor').style.display = 'none'; }
