from flask import Flask, request, jsonify, render_template, make_response
from datetime import datetime
import os
import requests
import csv
import io

app = Flask(__name__)

# --- CONFIGURACIÓN DE SEGURIDAD ---
# Aumentamos el límite de recepción a 10MB para soportar los 25k puntos sin Error 500
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024 

# --- CONFIGURACIÓN DE FIREBASE ---
FIREBASE_TEMPS_URL = "https://tfg2026-511e7-default-rtdb.europe-west1.firebasedatabase.app/readings.json"
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
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({"status": "error", "message": "No data received"}), 400
            
        device_id = data.get('id', 'Estacion_Desconocida')
        
        payload = {
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
    try:
        response = requests.get(FIREBASE_TEMPS_URL, timeout=10)
        fb_data = response.json()
        if not fb_data: return jsonify([])
        history_data = [v for v in fb_data.values() if v is not None] if isinstance(fb_data, dict) else [v for v in fb_data if v is not None]
        return jsonify(history_data)
    except:
        return jsonify([]), 500

# --- API: VIBRACIONES (ALTA DENSIDAD) ---

@app.route('/api/vibrations', methods=['POST'])
def post_vibration():
    """Recibe una captura completa de 25.000 puntos de vibración"""
    try:
        # Forzamos la lectura del JSON pesado
        data = request.get_json(force=True, silent=True)
        
        if not data:
            return jsonify({"status": "error", "message": "JSON invalido o vacio"}), 400

        values = data.get('values', [])
        
        if not values or len(values) == 0:
            return jsonify({"status": "error", "message": "No vibration values"}), 400

        payload = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "device_id": data.get('id', 'Sensor_4G_Vib'),
            "values": values 
        }
        
        # Enviamos a Firebase con un timeout largo (30s) para evitar cortes
        fb_response = requests.post(FIREBASE_VIB_URL, json=payload, timeout=35)
        
        if fb_response.status_code == 200:
            return jsonify({"status": "success", "puntos_recibidos": len(values)}), 200
        else:
            return jsonify({"status": "error", "message": "Firebase rejection"}), fb_response.status_code

    except Exception as e:
        print(f"Error en /api/vibrations: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/vibrations/list')
def list_vibrations():
    try:
        res = requests.get(FIREBASE_VIB_URL, timeout=15).json()
        if not res: return jsonify([])
        lista = [{"id": k, "fecha": v.get('timestamp'), "device": v.get('device_id')} for k, v in res.items() if v]
        return jsonify(lista[::-1])
    except:
        return jsonify([])

@app.route('/api/vibrations/get/<id>')
def get_vibration_detail(id):
    try:
        single_url = f"https://tfg2026-511e7-default-rtdb.europe-west1.firebasedatabase.app/vibrations/{id}.json"
        res = requests.get(single_url, timeout=20).json()
        return jsonify(res)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/download_csv')
def download_csv():
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
            writer.writerow([item.get('timestamp'), item.get('device_id'), item.get('t_aht'), item.get('h_aht'), item.get('t1'), item.get('t2'), item.get('t3'), item.get('t4'), item.get('rssi')])
        res = make_response(output.getvalue())
        res.headers["Content-Disposition"] = f"attachment; filename=historico_temps_{datetime.now().strftime('%Y%m%d')}.csv"
        res.headers["Content-type"] = "text/csv"
        return res
    except:
        return "Error", 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)
