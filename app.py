from flask import Flask, request, jsonify, render_template, make_response
from datetime import datetime
import os
import requests
import csv
import io

app = Flask(__name__)

# Configuración de límites: 10MB para evitar Error 500 con JSONs grandes
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024 

# --- CONFIGURACIÓN DE FIREBASE ---
FIREBASE_TEMPS_URL = "https://tfg2026-511e7-default-rtdb.europe-west1.firebasedatabase.app/readings.json"
FIREBASE_VIB_URL = "https://tfg2026-511e7-default-rtdb.europe-west1.firebasedatabase.app/vibrations"

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
            
        payload = {
            "timestamp": datetime.utcnow().isoformat() + "Z", 
            "device_id": data.get('id', 'Estacion_Desconocida'),
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

# --- API: VIBRACIONES (FRAGMENTADAS) ---
@app.route('/api/vibrations', methods=['POST'])
def post_vibration():
    try:
        data = request.get_json(force=True, silent=True)
        if not data:
            return jsonify({"status": "error", "message": "Invalid JSON"}), 400

        capture_id = data.get('id')      # Ej: Cap_1234567
        new_values = data.get('values', [])
        
        # URL específica para este ID de captura
        target_url = f"{FIREBASE_VIB_URL}/{capture_id}.json"

        # 1. Intentamos obtener lo que ya hay en esa captura
        current_data = requests.get(target_url).json()

        if current_data and "values" in current_data:
            # Si ya existe, unimos los arrays
            combined_values = current_data["values"]
            combined_values.extend(new_values)
            # Actualizamos solo el campo values con PATCH
            update_res = requests.patch(target_url, json={"values": combined_values}, timeout=20)
        else:
            # Si es el primer bloque, creamos el registro completo
            payload = {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "device_id": data.get('device', 'Sensor_4G_Vib'),
                "values": new_values
            }
            update_res = requests.put(target_url, json=payload, timeout=20)

        if update_res.status_code == 200:
            return jsonify({"status": "success"}), 200
        else:
            return jsonify({"status": "error", "message": "Firebase Error"}), 500

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/vibrations/list')
def list_vibrations():
    try:
        res = requests.get(f"{FIREBASE_VIB_URL}.json", timeout=15).json()
        if not res: return jsonify([])
        lista = [{"id": k, "fecha": v.get('timestamp'), "device": v.get('device_id')} for k, v in res.items() if v]
        return jsonify(lista[::-1])
    except:
        return jsonify([])

@app.route('/api/vibrations/get/<id>')
def get_vibration_detail(id):
    try:
        res = requests.get(f"{FIREBASE_VIB_URL}/{id}.json", timeout=20).json()
        return jsonify(res)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# --- HISTORIAL Y CSV ---
@app.route('/api/history')
def get_history():
    try:
        response = requests.get(FIREBASE_TEMPS_URL, timeout=10)
        fb_data = response.json()
        if not fb_data: return jsonify([])
        history_data = [v for v in fb_data.values() if v] if isinstance(fb_data, dict) else [v for v in fb_data if v]
        return jsonify(history_data)
    except:
        return jsonify([]), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)
