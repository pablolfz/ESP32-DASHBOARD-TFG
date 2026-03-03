let chart1, chart2, chart3, chartVibraciones, chartModal;

document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    updateData();
    actualizarListaVibraciones();
    setInterval(updateData, 30000);
});

function initCharts() {
    const getOptions = (yTitle, isTime = true) => ({
        responsive: true, maintainAspectRatio: false,
        scales: {
            x: { 
                type: isTime ? 'time' : 'linear',
                time: isTime ? { unit: 'minute', displayFormats: { minute: 'HH:mm' } } : {},
                ticks: { font: { size: 14 } },
                title: { display: true, text: isTime ? 'Hora' : 'Tiempo (ms)', font: { size: 16, weight: 'bold' } }
            },
            y: { ticks: { font: { size: 14 } }, title: { display: true, text: yTitle, font: { size: 16, weight: 'bold' } } }
        },
        plugins: { zoom: { zoom: { wheel: { enabled: false }, drag: { enabled: true }, mode: 'x' }, pan: { enabled: true, mode: 'x' } } }
    });

    chart1 = new Chart(document.getElementById('chart1').getContext('2d'), { type: 'line', data: { datasets: [] }, options: getOptions('Temp (°C)') });
    chartVibraciones = new Chart(document.getElementById('chartVibraciones').getContext('2d'), { 
        type: 'line', data: { datasets: [{ label: 'Piezo', data: [], borderColor: '#e74c3c', borderWidth: 1, pointRadius: 0 }] }, 
        options: { ...getOptions('Amplitud', false), animation: false, parsing: false, normalized: true } 
    });
    chartModal = new Chart(document.getElementById('chartModal').getContext('2d'), { type: 'line', data: { datasets: [] }, options: getOptions('Valores') });
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
                const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val ? val.toFixed(1) : "--"; };
                
                set(`d${num}-t`, d.t_aht); set(`d${num}-h`, d.h_aht);
                set(`d${num}-s1`, d.t1); set(`d${num}-s2`, d.t2); set(`d${num}-s3`, d.t3); set(`d${num}-s4`, d.t4);
                if(document.getElementById(`d${num}-rssi`)) document.getElementById(`d${num}-rssi`).textContent = d.rssi || "--";
                
                if(num === 1) { // Ejemplo para chart1
                    chart1.data.labels = filtered.map(i => new Date(i.timestamp));
                    chart1.data.datasets = [{ label: 'Ambiente', data: filtered.map(i => i.t_aht), borderColor: '#f1c40f' }];
                    chart1.update('none');
                }
            }
        });
    } catch (e) { console.error(e); }
}

async function actualizarListaVibraciones() {
    try {
        const res = await fetch('/api/vibrations/list');
        const lista = await res.json();
        const select = document.getElementById('select-vibraciones');
        if (select && lista.length > 0) {
            select.innerHTML = lista.map(v => `<option value="${v.id}">${new Date(v.fecha).toLocaleString('es-ES')}</option>`).join('');
        }
    } catch (e) { console.error(e); }
}

function abrirMaxivisor(chartOrigen, titulo) {
    document.getElementById('modal-visor').style.display = 'block';
    document.getElementById('titulo-visor').textContent = titulo;
    chartModal.data = JSON.parse(JSON.stringify(chartOrigen.data));
    chartModal.options.scales.x.type = chartOrigen.options.scales.x.type;
    chartModal.update('none');
}

function cerrarVisor() { document.getElementById('modal-visor').style.display = 'none'; }

function descargarImagen(chart, nombre) {
    const link = document.createElement('a');
    link.download = `${nombre}.png`;
    link.href = chart.toBase64Image();
    link.click();
}
