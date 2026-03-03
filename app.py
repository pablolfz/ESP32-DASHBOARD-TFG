from flask import Flask, request, jsonify, render_template, make_response
from datetime import datetime, timedelta
import os
import requests
import csv
import io

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024 

FIREBASE_TEMPS_URL = "https://tfg2026-511e7-default-rtdb.europe-west1.firebasedatabase.app/readings.json"
FIREBASE_VIB_URL = "https://tfg2026-511e7-default-rtdb.europe-west1.firebasedatabase.app/vibrations"

def safe_float(value):
    try: return float(value)
    except: return None

@app.route('/')
def index(): return render_template('index.html')

@app.route('/api/data', methods=['POST'])
def receive_data():
    try:
        data = request.get_json(silent=True)
        payload = {
            "timestamp": datetime.utcnow().isoformat() + "Z", 
            "device_id": data.get('id', 'Estacion_Desconocida'),
            "t_aht": safe_float(data.get('t_aht')), "h_aht": safe_float(data.get('h_aht')),
            "t1": safe_float(data.get('t1')), "t2": safe_float(data.get('t2')),
            "t3": safe_float(data.get('t3')), "t4": safe_float(data.get('t4')),
            "rssi": safe_float(data.get('rssi'))
        }
        requests.post(FIREBASE_TEMPS_URL, json=payload, timeout=10)
        return jsonify({"status": "success"}), 200
    except Exception as e: return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/history')
def get_history():
    try:
        res = requests.get(FIREBASE_TEMPS_URL, timeout=10).json()
        return jsonify([v for v in res.values() if v] if isinstance(res, dict) else [v for v in res if v])
    except: return jsonify([])

@app.route('/api/download_csv')
def download_csv():
    try:
        fb_data = requests.get(FIREBASE_TEMPS_URL, timeout=15).json()
        limite = datetime.utcnow() - timedelta(days=30)
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Fecha (UTC)', 'Estacion', 'Temp Amb', 'Hum Amb', 'S1', 'S2', 'S3', 'S4', 'RSSI'])
        
        items = list(fb_data.values() if isinstance(fb_data, dict) else fb_data)
        for item in sorted(items, key=lambda x: x.get('timestamp', '')):
            try:
                fecha = datetime.fromisoformat(item['timestamp'].replace('Z', ''))
                if fecha > limite:
                    writer.writerow([item.get('timestamp'), item.get('device_id'), item.get('t_aht'), item.get('h_aht'), item.get('t1'), item.get('t2'), item.get('t3'), item.get('t4'), item.get('rssi')])
            except: continue
            
        res = make_response(output.getvalue())
        res.headers["Content-Disposition"] = f"attachment; filename=Historico_30dias.csv"
        res.headers["Content-type"] = "text/csv"
        return res
    except: return "Error", 500

@app.route('/api/vibrations', methods=['POST'])
def post_vibration():
    data = request.get_json(force=True)
    target_url = f"{FIREBASE_VIB_URL}/{data.get('id')}.json"
    curr = requests.get(target_url).json()
    if curr and "values" in curr:
        curr["values"].extend(data.get('values', []))
        requests.patch(target_url, json={"values": curr["values"]}, timeout=30)
    else:
        payload = {"timestamp": datetime.utcnow().isoformat() + "Z", "device_id": data.get('device'), "values": data.get('values')}
        requests.put(target_url, json=payload, timeout=30)
    return jsonify({"status": "success"})

@app.route('/api/vibrations/list')
def list_vibrations():
    res = requests.get(f"{FIREBASE_VIB_URL}.json").json()
    if not res: return jsonify([])
    return jsonify([{"id": k, "fecha": v.get('timestamp')} for k, v in res.items() if v][::-1])

@app.route('/api/vibrations/get/<id>')
def get_vibration_detail(id):
    return jsonify(requests.get(f"{FIREBASE_VIB_URL}/{id}.json").json())
