from flask import Flask, request, jsonify, render_template, make_response
from datetime import datetime, timedelta
import os, requests, csv, io

# 1. Inicialización de la App (DEBE IR AQUÍ ARRIBA para Render)
app = Flask(__name__)

# Aumentamos el límite de memoria para los 3 sensores (aprox 75,000 puntos en total)
app.config['MAX_CONTENT_LENGTH'] = 25 * 1024 * 1024 

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
        # Consultamos si la captura ya existe en Firebase
        curr = requests.get(url).json()
        
        # Extraemos los nuevos datos del JSON recibido (v1/ch1, v2/ch2, v3/ch3)
        v1_new = data.get('v1') or data.get('ch1') or []
        v2_new = data.get('v2') or data.get('ch2') or []
        v3_new = data.get('v3') or data.get('ch3') or []

        # Preparamos el objeto final normalizado a v1, v2, v3
        payload = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "device_id": data.get('device', 'ESP32_Triaxial')
        }

        if curr and isinstance(curr, dict):
            # Si ya existe, recuperamos los datos viejos (normalizando nombres si hace falta)
            v1_old = curr.get("v1") or curr.get("ch1") or []
            v2_old = curr.get("v2") or curr.get("ch2") or []
            v3_old = curr.get("v3") or curr.get("ch3") or []
            
            payload["v1"] = v1_old + v1_new
            payload["v2"] = v2_old + v2_new
            payload["v3"] = v3_old + v3_new
            
            # Usamos PUT para sobreescribir el documento con la nueva estructura v1/v2/v3
            # y eliminar posibles restos de ch1/ch2/ch3
            requests.put(url, json=payload, timeout=30)
        else:
            # Si es la primera vez que llega esta captura
            payload["v1"] = v1_new
            payload["v2"] = v2_new
            payload["v3"] = v3_new
            requests.put(url, json=payload, timeout=30)

        return jsonify({"status": "success"}), 200
    except Exception as e:
        print(f"Error procesando vibración: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/vibrations/list')
def list_vibrations():
    try:
        res = requests.get(f"{FIREBASE_VIB_URL}.json", timeout=10).json()
        if not res: return jsonify([])
        
        lista = []
        for k, v in res.items():
            if v and isinstance(v, dict):
                fecha = v.get('timestamp') or datetime.utcnow().isoformat() + "Z"
                lista.append({"id": k, "fecha": fecha})
        
        lista.sort(key=lambda x: x['fecha'], reverse=True)
        return jsonify(lista)
    except:
        return jsonify([])

@app.route('/api/vibrations/get/<id>')
def get_vibration_detail(id):
    try:
        res = requests.get(f"{FIREBASE_VIB_URL}/{id}.json", timeout=25).json()
        if not res:
            return jsonify({"error": "No encontrado"}), 404
            
        # Normalización final para asegurar que el JS reciba v1, v2, v3
        if isinstance(res, dict):
            if 'ch1' in res and 'v1' not in res: res['v1'] = res.pop('ch1')
            if 'ch2' in res and 'v2' not in res: res['v2'] = res.pop('ch2')
            if 'ch3' in res and 'v3' not in res: res['v3'] = res.pop('ch3')
            
        return jsonify(res)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)
