from flask import Flask, request, jsonify, render_template, make_response
from datetime import datetime, timedelta
import os
import requests
import csv
import io

app = Flask(__name__)

# Configuración de límite de subida (10MB) para no bloquear los JSON grandes de vibración
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

# --- API: RECEPCIÓN DE TEMPERATURAS (ESP32 LoRa) ---
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

# --- API: HISTORIAL DE TEMPERATURAS ---
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

# --- DESCARGA CSV TEMPERATURAS (FILTRADO 30 DÍAS) ---
@app.route('/api/download_csv')
def download_csv():
    try:
        response = requests.get(FIREBASE_TEMPS_URL, timeout=15)
        fb_data = response.json()
        if not fb_data: return "No hay datos", 404
        
        # Filtro temporal: 30 días atrás
        limite_30_dias = datetime.utcnow() - timedelta(days=30)
        
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Fecha (UTC)', 'Estacion', 'Temp Amb', 'Hum Amb', 'S1', 'S2', 'S3', 'S4', 'RSSI'])
        
        items = list(fb_data.values() if isinstance(fb_data, dict) else fb_data)
        items_filtrados = []

        for item in items:
            if not item or 'timestamp' not in item: continue
            try:
                # Limpiar 'Z' y convertir a datetime para comparar
                fecha_item = datetime.fromisoformat(item['timestamp'].replace('Z', ''))
                if fecha_item > limite_30_dias:
                    items_filtrados.append(item)
            except: continue
        
        items_filtrados.sort(key=lambda x: x.get('timestamp', ''))

        for item in items_filtrados:
            writer.writerow([
                item.get('timestamp'), item.get('device_id'), 
                item.get('t_aht'), item.get('h_aht'), 
                item.get('t1'), item.get('t2'), item.get('t3'), item.get('t4'), 
                item.get('rssi')
            ])
            
        res = make_response(output.getvalue())
        res.headers["Content-Disposition"] = f"attachment; filename=Historico_30dias_{datetime.now().strftime('%Y%m%d')}.csv"
        res.headers["Content-type"] = "text/csv"
        return res
    except Exception as e:
        return f"Error: {str(e)}", 500

# --- API: VIBRACIONES (SISTEMA DE PAQUETES/BLOQUES) ---
@app.route('/api/vibrations', methods=['POST'])
def post_vibration():
    try:
        data = request.get_json(force=True, silent=True)
        if not data: return jsonify({"status": "error"}), 400

        capture_id = data.get('id')      # Ej: Cap_171500
        new_values = data.get('values', [])
        
        target_url = f"{FIREBASE_VIB_URL}/{capture_id}.json"

        # 1. Comprobar si ya existe la captura para añadir (patch) o crear (put)
        current_res = requests.get(target_url).json()

        if current_res and "values" in current_res:
            # Unir el nuevo bloque de 5,000 puntos al existente
            current_values = current_res["values"]
            current_values.extend(new_values)
            requests.patch(target_url, json={"values": current_values}, timeout=30)
        else:
            # Crear registro nuevo con el primer bloque
            payload = {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "device_id": data.get('device', 'ESP32_4G_Sismo'),
                "values": new_values
            }
            requests.put(target_url, json=payload, timeout=30)

        return jsonify({"status": "success"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# --- API: LISTAR Y OBTENER VIBRACIONES ---
@app.route('/api/vibrations/list')
def list_vibrations():
    try:
        res = requests.get(f"{FIREBASE_VIB_URL}.json", timeout=15).json()
        if not res: return jsonify([])
        lista = [{"id": k, "fecha": v.get('timestamp'), "device": v.get('device_id')} for k, v in res.items() if v]
        return jsonify(lista[::-1]) # De más reciente a más antigua
    except:
        return jsonify([])

@app.route('/api/vibrations/get/<id>')
def get_vibration_detail(id):
    try:
        res = requests.get(f"{FIREBASE_VIB_URL}/{id}.json", timeout=25).json()
        return jsonify(res)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)
