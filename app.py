from flask import Flask, request, jsonify, render_template, make_response
from datetime import datetime, timedelta
import os
import requests
import csv
import io

app = Flask(__name__)

# URL de tu Realtime Database
FIREBASE_URL = "https://tfg2026-511e7-default-rtdb.europe-west1.firebasedatabase.app/readings.json"

def safe_float(value):
    try: return float(value)
    except: return None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/data', methods=['POST'])
def receive_data():
    try:
        data = request.get_json()
        device_id = data.get('id', 'Estacion_1')
        
        payload = {
            "timestamp": datetime.now().isoformat(),
            "device_id": device_id,
            "t_aht": safe_float(data.get('t_aht')),
            "h_aht": safe_float(data.get('h_aht')),
            "t1": safe_float(data.get('t1')),
            "t2": safe_float(data.get('t2')),
            "t3": safe_float(data.get('t3')),
            "t4": safe_float(data.get('t4')),
            "rssi": safe_float(data.get('rssi'))
        }
        requests.post(FIREBASE_URL, json=payload, timeout=10)
        return jsonify({"status": "success"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/history')
def get_history():
    try:
        response = requests.get(FIREBASE_URL, timeout=10)
        fb_data = response.json()
        if isinstance(fb_data, dict):
            history_data = [fb_data[k] for k in fb_data if fb_data[k] is not None]
        else:
            history_data = fb_data if fb_data else []
        return jsonify(history_data)
    except:
        return jsonify([]), 500

@app.route('/api/download_csv')
def download_csv():
    try:
        response = requests.get(FIREBASE_URL, timeout=15)
        fb_data = response.json()
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Fecha', 'ID', 'T_Amb', 'H_Amb', 'S1', 'S2', 'S3', 'S4', 'RSSI'])
        items = fb_data.values() if isinstance(fb_data, dict) else fb_data
        for item in items:
            if not item: continue
            writer.writerow([item.get('timestamp'), item.get('device_id'), item.get('t_aht'), 
                             item.get('h_aht'), item.get('t1'), item.get('t2'), 
                             item.get('t3'), item.get('t4'), item.get('rssi')])
        output.seek(0)
        res = make_response(output.getvalue())
        res.headers["Content-Disposition"] = f"attachment; filename=datos_lora_{datetime.now().strftime('%Y%m%d')}.csv"
        res.headers["Content-type"] = "text/csv"
        return res
    except: return "Error", 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)
