from flask import Flask, request, jsonify, render_template, make_response
from datetime import datetime, timedelta
import os, requests, csv, io

# 1. Inicialización de la App (DEBE IR AQUÍ ARRIBA)
app = Flask(__name__)

# Aumentamos el límite de memoria para los 3 sensores (aprox 75,000 puntos)
app.config['MAX_CONTENT_LENGTH'] = 20 * 1024 * 1024 

# --- CONFIGURACIÓN DE FIREBASE ---
FIREBASE_TEMPS_URL = "https://tfg2026-511e7-default-rtdb.europe-west1.firebasedatabase.app/readings.json"
FIREBASE_VIB_URL = "https://tfg2026-511e7-default-rtdb.europe-west1.firebasedatabase.app/vibrations"

# --- RUTAS DE NAVEGACIÓN ---
@app.route('/')
def index(): 
    return render_template('index.html')

# --- API TEMPERATURAS (ESP32 LoRa) ---
@app.route('/api/data', methods=['POST'])
def receive_data():
    try:
        data = request.get_json(silent=True)
        if not data: return jsonify({"status": "error", "message": "No data"}), 400
        
        payload = {
            "timestamp": datetime.utcnow().isoformat() + "Z", 
            "device_id": data.get('id'),
            "t_aht": data.get('t_aht'), "h_aht": data.get('h_aht'),
            "t1": data.get('t1'), "t2": data.get('t2'), "t3": data.get('t3'), "t4": data.get('t4'),
            "rssi": data.get('rssi')
        }
        requests.post(FIREBASE_TEMPS_URL, json=payload, timeout=10)
        return jsonify({"status": "success"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/history')
def get_history():
    try:
        res = requests.get(FIREBASE_TEMPS_URL, timeout=10).json()
        if not res: return jsonify([])
        return jsonify(list(res.values()) if isinstance(res, dict) else res)
    except:
        return jsonify([])

# --- DESCARGA CSV 30 DÍAS ---
@app.route('/api/download_csv')
def download_csv():
    try:
        fb_data = requests.get(FIREBASE_TEMPS_URL, timeout=15).json()
        limite = datetime.utcnow() - timedelta(days=30)
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Fecha', 'Estacion', 'T_Amb', 'H_Amb', 'S1', 'S2', 'S3', 'S4', 'RSSI'])
        
        items = list(fb_data.values()) if isinstance(fb_data, dict) else fb_data
        for i in items:
            try:
                fecha = datetime.fromisoformat(i['timestamp'].replace('Z', ''))
                if fecha > limite:
                    writer.writerow([i['timestamp'], i['device_id'], i.get('t_aht'), i.get('h_aht'), i.get('t1'), i.get('t2'), i.get('t3'), i.get('t4'), i.get('rssi')])
            except: continue
            
        res = make_response(output.getvalue())
        res.headers["Content-Disposition"] = "attachment; filename=Historico_30d.csv"
        res.headers["Content-type"] = "text/csv"
        return res
    except:
        return "Error", 500

# --- API PIEZOELÉCTRICO (Soporte 3 Sensores) ---
@app.route('/api/vibrations', methods=['POST'])
def post_vibration():
    try:
        data = request.get_json(force=True)
        id_cap = data.get('id')
        if not id_cap: return jsonify({"status": "error", "message": "No ID"}), 400
        
        url = f"{FIREBASE_VIB_URL}/{id_cap}.json"
        curr = requests.get(url).json()
        
        # Nuevos bloques de los 3 canales
        v1 = data.get('v1', [])
        v2 = data.get('v2', [])
        v3 = data.get('v3', [])

        if curr and "v1" in curr:
            # Unión de bloques existentes
            requests.patch(url, json={
                "v1": curr.get("v1", []) + v1,
                "v2": curr.get("v2", []) + v2,
                "v3": curr.get("v3", []) + v3
            }, timeout=30)
        else:
            # Creación de nueva captura
            payload = {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "device_id": data.get('device', 'ESP32_Triaxial'),
                "v1": v1, "v2": v2, "v3": v3
            }
            requests.put(url, json=payload, timeout=30)

        return jsonify({"status": "success"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/vibrations/list')
def list_vibrations():
    try:
        res = requests.get(f"{FIREBASE_VIB_URL}.json", timeout=10).json()
        if not res: return jsonify([])
        return jsonify([{"id": k, "fecha": v.get('timestamp')} for k, v in res.items() if v and isinstance(v, dict)][::-1])
    except:
        return jsonify([])

@app.route('/api/vibrations/get/<id>')
def get_vibration_detail(id):
    try:
        res = requests.get(f"{FIREBASE_VIB_URL}/{id}.json", timeout=25).json()
        return jsonify(res)
    except:
        return jsonify({"status": "error"}), 500

# Lanzamiento para Render
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)
