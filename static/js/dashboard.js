let chart1, chartVibraciones, chartModal;
let datosVibMemoria = [];

document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    updateData();
    actualizarListaVibraciones();
    setInterval(updateData, 30000);
});

function initCharts() {
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            zoom: {
                zoom: { wheel: { enabled: false }, drag: { enabled: true }, mode: 'x' },
                pan: { enabled: true, mode: 'x' }
            }
        }
    };

    chart1 = new Chart(document.getElementById('chart1').getContext('2d'), {
        type: 'line',
        data: { datasets: [] },
        options: commonOptions
    });

    chartVibraciones = new Chart(document.getElementById('chartVibraciones').getContext('2d'), {
        type: 'line',
        data: { datasets: [{ label: 'Vibración', data: [], borderColor: '#e74c3c', borderWidth: 1, pointRadius: 0 }] },
        options: { 
            ...commonOptions, 
            animation: false, 
            parsing: false, 
            normalized: true,
            scales: { x: { type: 'linear' } } 
        }
    });

    chartModal = new Chart(document.getElementById('chartModal').getContext('2d'), {
        type: 'line',
        data: { datasets: [] },
        options: commonOptions
    });

    document.getElementById('chartVibraciones').onclick = () => abrirMaxivisor();
}

async function updateData() {
    try {
        const res = await fetch('/api/history');
        const data = await res.json();
        if (!data || data.length === 0) return;

        document.getElementById('currentTime').textContent = "Última actualización: " + new Date().toLocaleTimeString();

        // Mapeo flexible para las 3 estaciones
        [1, 2, 3].forEach(num => {
            const filtered = data.filter(i => String(i.device_id).includes(num.toString()))
                                .sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
            
            if (filtered.length > 0) {
                const last = filtered[filtered.length - 1];
                // Llenar recuadros de colores
                actualizarDOM(last, num);
                
                // Actualizar gráfica principal (usamos chart1 como ejemplo, puedes replicar para chart2,3)
                if (num === 1) {
                    chart1.data.labels = filtered.map(i => new Date(i.timestamp));
                    chart1.data.datasets = [
                        { label: 'Ambiente', data: filtered.map(i => i.t_aht), borderColor: '#f1c40f' },
                        { label: 'S1', data: filtered.map(i => i.t1), borderColor: '#e67e22' }
                    ];
                    chart1.update('none');
                }
            }
        });
    } catch (e) { console.error(e); }
}

function actualizarDOM(d, id) {
    const set = (suffix, val) => {
        const el = document.getElementById(`d${id}-${suffix}`);
        if (el) el.textContent = val !== undefined ? (typeof val === 'number' ? val.toFixed(1) : val) : "--";
    };
    set('t', d.t_aht); set('h', d.h_aht);
    set('s1', d.t1); set('s2', d.t2); set('s3', d.t3); set('s4', d.t4);
    set('rssi', d.rssi);
}

function controlGrafica(accion, key) {
    let chart = key === 'modal' ? chartModal : (key === 'vib' ? chartVibraciones : chart1);
    const scale = chart.scales.x;
    const range = scale.max - scale.min;

    if (accion === 'reset') chart.resetZoom();
    else if (accion === 'left') { chart.options.scales.x.min = scale.min - (range * 0.1); chart.options.scales.x.max = scale.max - (range * 0.1); }
    else if (accion === 'right') { chart.options.scales.x.min = scale.min + (range * 0.1); chart.options.scales.x.max = scale.max + (range * 0.1); }
    chart.update('none');
}

async function actualizarListaVibraciones() {
    const res = await fetch('/api/vibrations/list');
    const lista = await res.json();
    document.getElementById('select-vibraciones').innerHTML = lista.map(v => `<option value="${v.id}">${new Date(v.fecha).toLocaleString()}</option>`).join('');
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

function abrirMaxivisor() {
    document.getElementById('modal-visor').style.display = 'block';
    chartModal.data.datasets = [{ ...chartVibraciones.data.datasets[0] }];
    chartModal.options.scales.x.type = 'linear';
    chartModal.update();
}

function cerrarVisor() { document.getElementById('modal-visor').style.display = 'none'; }
