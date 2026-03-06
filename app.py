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
        items = list(res.values()) if isinstance(res, dict) else [x for x in res if x is not None]
        return jsonify(items)
    except:
        return jsonify([])

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
            if not i: continue
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

# --- API PIEZOELÉCTRICO (Soporte 3 Sensores OPTIMIZADO PARA BLOQUES) ---
@app.route('/api/vibrations', methods=['POST'])
def post_vibration():
    try:
        data = request.get_json(force=True)
        id_cap = data.get('id')
        if not id_cap: return jsonify({"status": "error", "message": "No ID"}), 400
        
        # El ESP32 nos dirá a partir de qué posición insertar este bloque
        offset = data.get('offset', 0)
        
        v1_new = data.get('v1') or data.get('ch1') or []
        v2_new = data.get('v2') or data.get('ch2') or []
        v3_new = data.get('v3') or data.get('ch3') or []

        # Log para depuración en Render
        print(f">> Recibido bloque para {id_cap} | Offset: {offset} | Puntos: {len(v1_new)}")

        patch_payload = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "device_id": data.get('device', 'ESP32_Triaxial')
        }

        # Preparamos los índices exactos para Firebase (ej: "v1/450": valor)
        for idx, val in enumerate(v1_new): patch_payload[f"v1/{offset + idx}"] = val
        for idx, val in enumerate(v2_new): patch_payload[f"v2/{offset + idx}"] = val
        for idx, val in enumerate(v3_new): patch_payload[f"v3/{offset + idx}"] = val

        url = f"{FIREBASE_VIB_URL}/{id_cap}.json"
        
        # PATCH actualiza solo los campos indicados sin descargar ni borrar lo anterior
        requests.patch(url, json=patch_payload, timeout=30)

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
        if isinstance(res, dict):
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
        url = f"{FIREBASE_VIB_URL}/{id}.json"
        res = requests.get(url, timeout=25).json()
        
        if not res:
            return jsonify({"error": "Muestra no encontrada"}), 404
            
        if isinstance(res, dict):
            # Normalización para el frontend
            if 'ch1' in res and 'v1' not in res: res['v1'] = res.pop('ch1')
            if 'ch2' in res and 'v2' not in res: res['v2'] = res.pop('ch2')
            if 'ch3' in res and 'v3' not in res: res['v3'] = res.pop('ch3')
            
            # Salvavidas: Asegurarnos de que v1, v2 y v3 sean listas y no diccionarios
            for key in ['v1', 'v2', 'v3']:
                if key not in res or not res[key]: 
                    res[key] = []
                elif isinstance(res[key], dict):
                    # Si Firebase lo devuelve como dict {"0": 1, "1": 2}, lo forzamos a lista
                    max_idx = max([int(k) for k in res[key].keys() if str(k).isdigit()] + [-1])
                    arr = [0] * (max_idx + 1)
                    for k, v in res[key].items():
                        if str(k).isdigit(): arr[int(k)] = v
                    res[key] = arr
                
        return jsonify(res)
    except Exception as e:
        print(f"Error recuperando detalle: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    # Obtenemos el puerto de Render; si no existe, usamos 10000 por defecto
    port = int(os.environ.get('PORT', 10000))
    # Forzamos debug=False para producción y nos aseguramos de escuchar en 0.0.0.0
    app.run(host='0.0.0.0', port=port, debug=False)
