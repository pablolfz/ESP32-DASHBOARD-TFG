from flask import Flask, request, jsonify, render_template
from datetime import datetime
import requests

app = Flask(__name__)

# --- CONFIGURACIÓN FIREBASE ---
# PEGA AQUÍ TU URL Y AÑADE 'readings.json' AL FINAL
FIREBASE_URL = "https://console.firebase.google.com/u/0/project/tfg2026-511e7/database/tfg2026-511e7-default-rtdb/data/~2F?hl=es-419&fb_gclid=CjwKCAiA2PrMBhA4EiwAwpHyCx5lWsA6mWx1wP_90ulczy5RD1p5Ol2L77Q3qLknxdQiFQNBX5ne-RoCSbcQAvD_BwE&fb_utm_campaign=Cloud-SS-DR-Firebase-FY26-global-gsem-1713590&fb_utm_content=text-ad&fb_utm_medium=cpc&fb_utm_source=google&fb_utm_term=KW_database%20firebase/readings.json"

def safe_float(value):
    try: return float(value)
    except: return None

@app.route('/api/data', methods=['POST'])
def receive_data():
    try:
        data = request.get_json()
        
        # Estructura de datos para Firebase
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

        # Guardar en Firebase
        requests.post(FIREBASE_URL, json=payload)
        return jsonify({"status": "success"}), 200
            
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/history')
def get_history():
    try:
        response = requests.get(FIREBASE_URL)
        fb_data = response.json()
        
        history_data = []
        if fb_data:
            # Firebase devuelve un diccionario, lo convertimos a lista para el JS
            for key in fb_data:
                history_data.append(fb_data[key])
        
        # Ordenamos por tiempo para que la gráfica no salga desordenada
        history_data.sort(key=lambda x: x['timestamp'])
        return jsonify(history_data[-100:]) # Mandamos los últimos 100 puntos
    except:
        return jsonify([]), 500

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    # Render usa el puerto 10000 por defecto
    app.run(host='0.0.0.0', port=10000)
