import csv
import io
from datetime import datetime, timedelta
from flask import make_response

# ... (resto de tu app.py)

@app.route('/api/download_csv')
def download_csv():
    try:
        # 1. Obtener datos de Firebase
        response = requests.get(FIREBASE_URL)
        fb_data = response.json()
        if not fb_data:
            return "No hay datos para descargar", 404

        # 2. Filtrar por fecha (30 días atrás)
        fecha_limite = datetime.now() - timedelta(days=30)
        all_data = [fb_data[k] for k in fb_data]
        
        # 3. Crear el archivo CSV en memoria
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Cabecera del CSV
        writer.writerow(['Fecha y Hora', 'Dispositivo', 'Temp Ambiente', 'Humedad', 'S1', 'S2', 'S3', 'S4', 'RSSI'])

        for item in all_data:
            # Convertir timestamp ISO a objeto datetime para comparar
            fecha_item = datetime.fromisoformat(item.get('timestamp'))
            
            if fecha_item >= fecha_limite:
                writer.writerow([
                    item.get('timestamp'),
                    item.get('device_id'),
                    item.get('t_aht'),
                    item.get('h_aht'),
                    item.get('t1'),
                    item.get('t2'),
                    item.get('t3'),
                    item.get('t4'),
                    item.get('rssi')
                ])

        # 4. Configurar la respuesta para el navegador
        output.seek(0)
        response = make_response(output.getvalue())
        response.headers["Content-Disposition"] = f"attachment; filename=log_sensores_{datetime.now().strftime('%Y-%m-%d')}.csv"
        response.headers["Content-type"] = "text/csv"
        return response

    except Exception as e:
        return str(e), 500
