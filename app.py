from flask import Flask, request, jsonify, render_template, make_response
from datetime import datetime
import os
import requests
import csv
import io

app = Flask(__name__)

# --- CONFIGURACIÓN DE FIREBASE ---
# URL para lecturas de temperatura y humedad (Datos ligeros)
FIREBASE_TEMPS_URL = "https://tfg2026-511e7-default-rtdb.europe-west1.firebasedatabase.app/readings.json"
# URL para capturas de vibración (Datos pesados - 25k puntos)
FIREBASE_VIB_URL = "https://tfg2026-511e7-default-rtdb.europe-west1.firebasedatabase.app/vibrations.json"

# --- UTILIDADES ---
def safe_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None

# --- RUTAS DE NAVEGACIÓN ---
@app.route('/')
def index():
    return render_template('index.html')

# --- API: TEMPERATURAS Y HUMEDAD ---

@app.route('/api/data', methods=['POST'])
def receive_data():
    """Recibe datos de sensores de las estaciones LoRa"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "No data received"}), 400
            
        device_id = data.get('id', 'Estacion_Desconocida')
        
        payload = {
            # Guardamos en UTC (Z) para que JS convierta a hora local España
            "timestamp": datetime.utcnow().isoformat() + "Z", 
            "device_id": device_id,
            "t_aht": safe_float(data.get('t_aht')),
            "h_aht": safe_float(data.get('h_aht')),
            "t1": safe_float(data.get('t1')),
            "t2": safe_float(data.get('t2')),
            "t3": safe_float(data.get('t3')),
            "t4": safe_float(data.get('t4')),
            "rssi": safe_float(data.get('rssi'))
        }
        
        requests.post(FIREBASE_TEMPS_URL, json=payload, timeout=10)
        return jsonify({"status": "success"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/history')
def get_history():
    """Retorna el historial de temperaturas para las gráficas"""
    try:
        response = requests.get(FIREBASE_TEMPS_URL, timeout=10)
        fb_data = response.json()
        
        if not fb_data:
            return jsonify([])

        if isinstance(fb_data, dict):
            history_data = [v for v in fb_data.values() if v is not None]
        else:
            history_data = [v for v in fb_data if v is not None]
            
        return jsonify(history_data)
    except Exception as e:
        return jsonify([]), 500

@app.route('/api/download_csv')
def download_csv():
    """Genera CSV de todas las lecturas de temperatura acumuladas"""
    try:
        response = requests.get(FIREBASE_TEMPS_URL, timeout=15)
        fb_data = response.json()
        
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Fecha (UTC)', 'ID Dispositivo', 'Temp Amb', 'Hum Amb', 'S1', 'S2', 'S3', 'S4', 'RSSI'])
        
        items = list(fb_data.values() if isinstance(fb_data, dict) else fb_data)
        items.sort(key=lambda x: x.get('timestamp', ''))

        for item in items:
            if not item: continue
            writer.writerow([
                item.get('timestamp'), item.get('device_id'), 
                item.get('t_aht'), item.get('h_aht'), 
                item.get('t1'), item.get('t2'), item.get('t3'), item.get('t4'), 
                item.get('rssi')
            ])
            
        res = make_response(output.getvalue())
        res.headers["Content-Disposition"] = f"attachment; filename=historico_temps_{datetime.now().strftime('%Y%m%d')}.csv"
        res.headers["Content-type"] = "text/csv"
        return res
    except:
        return "Error generando CSV", 500

# --- API: VIBRACIONES (ALTA DENSIDAD) ---

@app.route('/api/vibrations', methods=['POST'])
def post_vibration():
    """Recibe una captura completa de 25.000 puntos de vibración"""
    try:
        data = request.get_json()
        values = data.get('values', [])
        
        if len(values) == 0:
            return jsonify({"status": "error", "message": "No vibration values"}), 400

        payload = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "device_id": data.get('id', 'Sensor_Piezo'),
            "values": values  # Array de 25k muestras
        }
        
        # Timeout extendido porque 25k puntos es un JSON pesado
        requests.post(FIREBASE_VIB_URL, json=payload, timeout=30)
        return jsonify({"status": "success"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/vibrations/list')
def list_vibrations():
    """Retorna solo la lista de capturas (sin los puntos) para el selector"""
    try:
        res = requests.get(FIREBASE_VIB_URL).json()
        if not res:
            return jsonify([])
        
        # Solo enviamos ID, Fecha y Dispositivo para no saturar el navegador
        lista = []
        for key, val in res.items():
            lista.append({
                "id": key,
                "fecha": val.get('timestamp'),
                "device": val.get('device_id')
            })
            
        # Ordenamos por fecha descendente (más recientes primero)
        return jsonify(lista[::-1])
    except:
        return jsonify([])

@app.route('/api/vibrations/get/<id>')
def get_vibration_detail(id):
    """Retorna los 25.000 puntos de una captura específica por su ID"""
    try:
        # Accedemos directamente al nodo del ID en Firebase
        single_url = f"https://tfg2026-511e7-default-rtdb.europe-west1.firebasedatabase.app/vibrations/{id}.json"
        res = requests.get(single_url).json()
        return jsonify(res)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# --- INICIO DE LA APLICACIÓN ---
if __name__ == '__main__':
    # Puerto dinámico para Render/Heroku
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)
