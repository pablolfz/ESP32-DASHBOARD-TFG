# Archivo: app.py (SOLUCIÓN FINAL Y COMPLETA para Render/Gunicorn/PyMongo)

from flask import Flask, request, jsonify, render_template
from datetime import datetime
from pymongo import MongoClient
import os 
from pathlib import Path

# --- CONFIGURACIÓN DE FLASK ---
BASE_DIR = Path(__file__).parent.absolute()
app = Flask(__name__, 
            static_folder=BASE_DIR / 'static',
            template_folder=BASE_DIR / 'templates')

# --- FUNCIÓN AUXILIAR CRÍTICA: safe_float ---
def safe_float(value, default=None):
    """
    Convierte un valor (que puede ser int, float o str) a float de forma segura.
    Si la conversión falla o el valor es None, devuelve el valor por defecto (None).
    """
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return default
    return default
# --- FIN safe_float ---


# --- CONFIGURACIÓN CRÍTICA DE MONGODB ---
# CRÍTICO: Lee la cadena de conexión de las variables de entorno de Render.
MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017/") 
DB_NAME = "lora_dashboard_db" 
COLLECTION_NAME = "readings"  

# Función auxiliar para inicializar la conexión por worker (evita deadlock de Gunicorn)
def get_mongo_collection():
    """Inicializa y devuelve la colección de MongoDB de forma lazy (por worker)."""
    try:
        # Crea la conexión dentro del contexto del worker
        client = MongoClient(MONGO_URI) 
        db = client[DB_NAME]
        return db[COLLECTION_NAME]
    except Exception as e:
        print(f"CRÍTICO: Fallo al conectar a MongoDB Atlas en worker: {e}")
        # Lanza la excepción para que Flask devuelva un 500 si la DB está caída
        raise

# --- ENDPOINT 1: RECIBIR DATOS DEL ESP32 (POST) ---
@app.route('/api/data', methods=['POST'])
def receive_data():
    try:
        readings_collection = get_mongo_collection()
        
        data = request.get_json()
        print(f"DEBUG: Datos recibidos del ESP32: {data}")

        # La llamada a safe_float ya no generará NameError
        temp1_val = safe_float(data.get('temp1'))
        temp2_val = safe_float(data.get('temp2'))
        batt_val = safe_float(data.get('batt'))
        pct_val = safe_float(data.get('pct'))
        rssi_val = safe_float(data.get('rssi'))

        if temp1_val is None or batt_val is None:
             # Si los datos principales son inválidos, retorna un 200 con warning
             print("ADVERTENCIA: Datos principales nulos o inválidos. Omisión de log.")
             return jsonify({"status": "warning", "message": "Invalid data"}), 200

        # Construcción del diccionario 'reading'
        reading = {
            "timestamp": datetime.now().isoformat(),
            "temp1": temp1_val,
            "temp2": temp2_val,
            "batt": batt_val,
            "pct": pct_val,
            "rssi": rssi_val
        }
        
        readings_collection.insert_one(reading)
        
        print(f"DEBUG: Datos guardados en MongoDB. OK.")
        return jsonify({"status": "success", "message": "Data logged successfully"}), 200
        
    except Exception as e:
        print(f"CRÍTICO: Error al guardar datos o conectar: {e}")
        # Retorna error 500
        return jsonify({"status": "error", "message": "Server failed to log data"}), 500


# --- ENDPOINT 2: DEVOLVER DATOS AL JAVASCRIPT (GET) ---
@app.route('/api/history')
def get_history():
    try:
        readings_collection = get_mongo_collection()

        # Consulta a MongoDB: últimos 200, ordenados descendentemente
        cursor = readings_collection.find(
            {}, 
            {"_id": 0} # Excluir el ID interno
        ).sort("timestamp", -1).limit(200)
        
        # Construcción de la lista 'history_data'
        history_data = list(cursor) 
            
        # El frontend espera orden cronológico ASCENDENTE
        return jsonify(list(reversed(history_data))) 
    
    except Exception as e:
        # Se activa si falla la conexión o la consulta a MongoDB
        print(f"Error fetching history from MongoDB: {e}")
        return jsonify([]), 500

# --- SERVIR LA PÁGINA WEB ---
@app.route('/')
def index():
    """Sirve el archivo index.html (buscado en la carpeta 'templates')."""
    return render_template('index.html')


# --- ARRANQUE DEL SERVIDOR ---

if __name__ == '__main__':
    # Esta parte solo se ejecuta si corre el archivo directamente (local)
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
