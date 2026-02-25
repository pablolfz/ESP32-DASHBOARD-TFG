async function fetchAndDrawHistoricalData(forceReset = false) {
    console.log("Obteniendo datos desde Firebase...");

    try {
        const response = await fetch('/api/history'); 
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        
        // Verificación: Firebase puede devolver null si la base de datos está vacía
        if (!data || data.length === 0) {
            document.getElementById('currentTime').textContent = 'Esperando datos de Firebase...';
            return;
        }

        const lastReading = data[data.length - 1];
        const labels = data.map(item => item.timestamp);

        // Helper para mapear datos y filtrar errores de sonda (-127 o -99)
        const mapData = (key) => data.map(item => {
            const val = item[key];
            return (typeof val === 'number' && val > -120) ? val : null;
        });

        // 1. EXTRAER VARIABLES (Nombres exactos de Firebase)
        const t_aht = mapData('t_aht');
        const h_aht = mapData('h_aht');
        const t1 = mapData('t1');
        const t2 = mapData('t2');
        const t3 = mapData('t3');
        const t4 = mapData('t4');

        // 2. CONFIGURACIÓN EJE X
        const endTime = new Date(lastReading.timestamp).getTime();
        const startTime = new Date(data[0].timestamp).getTime();
        const xAxisConfig = { min: startTime, max: endTime };

        // 3. DIBUJAR GRÁFICA DE TEMPERATURAS
        const tempDatasets = [
            { label: 'Ambiente (AHT)', data: t_aht, color: 'rgb(255, 99, 132)' },
            { label: 'Sonda 1', data: t1, color: 'rgb(255, 159, 64)' },
            { label: 'Sonda 2', data: t2, color: 'rgb(75, 192, 192)' },
            { label: 'Sonda 3', data: t3, color: 'rgb(153, 102, 255)' },
            { label: 'Sonda 4', data: t4, color: 'rgb(201, 203, 207)' }
        ];
        drawChart('tempChart', tempDatasets, labels, { title: { display: true, text: 'Temperaturas (°C)' } }, xAxisConfig);

        // 4. DIBUJAR GRÁFICA DE HUMEDAD
        const humDatasets = [
            { label: 'Humedad %', data: h_aht, color: 'rgb(54, 162, 235)' }
        ];
        drawChart('batteryChart', humDatasets, labels, { min: 0, max: 100 }, xAxisConfig);

        // 5. ACTUALIZAR CAJAS DE TEXTO (Cards)
        const fmt = (val) => (val !== null && val !== undefined) ? val.toFixed(1) : "--";
        const fmtSonda = (val) => (val === null || val <= -120) ? "ERR" : val.toFixed(1);

        document.getElementById('current-temp1-value').textContent = `${fmt(lastReading.t_aht)} °C`;
        document.getElementById('current-humidity-value').textContent = `${fmt(lastReading.h_aht)} %`;
        
        // IDs de las sondas Dallas
        document.getElementById('val-t1').textContent = fmtSonda(lastReading.t1);
        document.getElementById('val-t2').textContent = fmtSonda(lastReading.t2);
        document.getElementById('val-t3').textContent = fmtSonda(lastReading.t3);
        document.getElementById('val-t4').textContent = fmtSonda(lastReading.t4);

        document.getElementById('current-signal-value').textContent = `${lastReading.rssi || "--"} dBm`;
        
        const lastTime = new Date(lastReading.timestamp).toLocaleTimeString();
        document.getElementById('currentTime').textContent = `Última: ${lastTime}`;

        updateSignalIcon(lastReading.rssi);

    } catch (error) {
        console.error('Error en Dashboard:', error);
        document.getElementById('currentTime').textContent = 'Error de conexión';
    }
}
