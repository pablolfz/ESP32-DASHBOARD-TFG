/**
 * Dashboard Multi-sensor LoRa - Versión Firebase Blindada
 */

let tempChart, batteryChart;

document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    fetchAndDrawHistoricalData();

    // Refresco automático
    setInterval(fetchAndDrawHistoricalData, 30000); 
});

function initCharts() {
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { type: 'time', time: { unit: 'minute' } },
            y: { beginAtZero: false }
        }
    };

    const ctxTemp = document.getElementById('tempChart')?.getContext('2d');
    if (ctxTemp) {
        tempChart = new Chart(ctxTemp, {
            type: 'line',
            data: { datasets: [] },
            options: commonOptions
        });
    }

    const ctxHum = document.getElementById('batteryChart')?.getContext('2d');
    if (ctxHum) {
        batteryChart = new Chart(ctxHum, {
            type: 'line',
            data: { datasets: [] },
            options: { ...commonOptions, scales: { y: { min: 0, max: 100 } } }
        });
    }
}

async function fetchAndDrawHistoricalData() {
    try {
        const response = await fetch('/api/history');
        const rawData = await response.json();
        
        // DEBUG: Mira la consola del navegador (F12) para ver si llega esto
        console.log("Datos recibidos de la API:", rawData);

        // Convertir a array si Firebase envió un objeto
        let data = Array.isArray(rawData) ? rawData : Object.values(rawData);
        
        if (!data || data.length === 0) {
            console.warn("La base de datos está vacía.");
            return;
        }

        // Ordenar por fecha por si Firebase los mandó desordenados
        data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        const lastReading = data[data.length - 1];
        const labels = data.map(item => new Date(item.timestamp));

        const getCleanData = (key) => data.map(item => {
            const val = parseFloat(item[key]);
            return (!isNaN(val) && val > -120) ? val : null;
        });

        // Actualizar Gráficas
        if (tempChart) {
            tempChart.data.labels = labels;
            tempChart.data.datasets = [
                { label: 'Ambiente', data: getCleanData('t_aht'), borderColor: '#ff6384' },
                { label: 'S1', data: getCleanData('t1'), borderColor: '#ff9f40' },
                { label: 'S2', data: getCleanData('t2'), borderColor: '#4bc0c0' },
                { label: 'S3', data: getCleanData('t3'), borderColor: '#9966ff' },
                { label: 'S4', data: getCleanData('t4'), borderColor: '#c9cbcf' }
            ];
            tempChart.update('none');
        }

        if (batteryChart) {
            batteryChart.data.labels = labels;
            batteryChart.data.datasets = [
                { label: 'Humedad %', data: getCleanData('h_aht'), borderColor: '#36a2eb' }
            ];
            batteryChart.update('none');
        }

        // Actualizar tarjetas (Cards) con IDs genéricas por si acaso
        updateUI(lastReading);

    } catch (error) {
        console.error('Error cargando datos:', error);
    }
}

function updateUI(last) {
    const setSafeText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    };

    const fmt = (val) => (val != null && val > -120) ? parseFloat(val).toFixed(1) : "--";

    setSafeText('current-temp1-value', `${fmt(last.t_aht)} °C`);
    setSafeText('current-humidity-value', `${fmt(last.h_aht)} %`);
    setSafeText('current-signal-value', `${last.rssi || "--"} dBm`);
    
    // IDs de las sondas Dallas
    setSafeText('val-t1', fmt(last.t1));
    setSafeText('val-t2', fmt(last.t2));
    setSafeText('val-t3', fmt(last.t3));
    setSafeText('val-t4', fmt(last.t4));

    if (last.timestamp) {
        setSafeText('currentTime', `Última: ${new Date(last.timestamp).toLocaleTimeString()}`);
    }
}
