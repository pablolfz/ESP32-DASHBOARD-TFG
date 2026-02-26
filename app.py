from flask import Flask, request, jsonify, render_template, make_response
from datetime import datetime, timedelta
import os
import requests
import csv
import io

app = Flask(__name__)

# URL de tu Realtime Database (Debe terminar en .json)
FIREBASE_URL = "https://tfg2026-511e7-default-rtdb.europe-west1.firebasedatabase.app/readings.json"

def safe_float(value):
    """Convierte a float de forma segura para evitar errores en el servidor."""
    try:
        return float(value)
    except (TypeError, ValueError):
        return None

@app.route('/')
def index():
    """Renderiza la interfaz principal del Dashboard."""
    return render_template('index.html')

@app.route('/api/data', methods=['POST'])
def receive_data():
    """Recibe datos del ESP32 y los guarda en Firebase."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "No data received"}), 400
            
        payload = {
            "timestamp": datetime.now().isoformat(),
            "device_id": data.get('id', 'Estacion_Remota'),
            "t_aht": safe_float(data.get('t_aht')),
            "h_aht": safe_float(data.get('h_aht')),
            "t1": safe_float(data.get('t1')),
            "t2": safe_float(data.get('t2')),
            "t3": safe_float(data.get('t3')),
            "t4": safe_float(data.get('t4')),
            "rssi": safe_float(data.get('rssi'))
        }
        
        # Timeout de 10s para evitar que la app se cuelgue (Error 502)
        requests.post(FIREBASE_URL, json=payload, timeout=10)
        return jsonify({"status": "success"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/history')
def get_history():
    """Obtiene el historial completo para las gráficas."""
    try:
        response = requests.get(FIREBASE_URL, timeout=10)
        fb_data = response.json()
        
        # Procesamiento seguro de la estructura de Firebase
        if isinstance(fb_data, dict):
            history_data = [fb_data[k] for k in fb_data if fb_data[k] is not None]
        elif isinstance(fb_data, list):
            history_data = [x for x in fb_data if x is not None]
        else:
            history_data = []
            
        return jsonify(history_data)
    except Exception as e:
        print(f"Error en history: {e}")
        return jsonify([]), 500

@app.route('/api/download_csv')
def download_csv():
    """Genera y descarga un CSV con los datos de los últimos 30 días."""
    try:
        response = requests.get(FIREBASE_URL, timeout=15)
        fb_data = response.json()
        
        if not fb_data:
            return "No hay datos disponibles", 404

        fecha_limite = datetime.now() - timedelta(days=30)
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Cabecera del archivo CSV
        writer.writerow(['Fecha ISO', 'Dispositivo', 'Temp_Ambiente', 'Hum_Ambiente', 'S1', 'S2', 'S3', 'S4', 'RSSI'])

        # Obtener items de forma segura según el formato de Firebase
        items = fb_data.values() if isinstance(fb_data, dict) else fb_data

        for item in items:
            if not item or 'timestamp' not in item:
                continue
            try:
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
            except (ValueError, TypeError):
                continue

        output.seek(0)
        res = make_response(output.getvalue())
        filename = f"log_lora_30dias_{datetime.now().strftime('%Y%m%d')}.csv"
        res.headers["Content-Disposition"] = f"attachment; filename={filename}"
        res.headers["Content-type"] = "text/csv"
        return res
    except Exception as e:
        return f"Error generando CSV: {str(e)}", 500

if __name__ == '__main__':
    # Configuración de puerto para Render
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port, debug=False)
