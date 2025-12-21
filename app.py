# app.py --- CORREGIDO PARA LORA (Temp, Hum, Pres)

# Importamos librerias necesarias
from flask import Flask, request, jsonify, render_template
from datetime import datetime
from pymongo import MongoClient
import os 
from pathlib import Path

# ==============================================================================
# 1. FUNCIONES AUXILIARES DE VALIDACIÓN Y CONFIGURACIÓN
# ==============================================================================

def safe_float(value):
    """
    Intenta convertir un valor de entrada a flotante. 
    Devuelve None si el valor es None o si la conversión falla.
    """
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


# --- CONFIGURACIÓN DE FLASK ---
BASE_DIR = Path(__file__).parent.absolute()

app = Flask(
    __name__, 
    static_folder=BASE_DIR / 'static',
    template_folder=BASE_DIR / 'templates'
)

# ==============================================================================
# 2. CONFIGURACIÓN DE MONGODB
# ==============================================================================

# IMPORTANTE: En Render, debes tener la variable de entorno MONGO_URI configurada.
# Si no la tienes, este código intentará conectar a localhost y fallará en la nube.
MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017/") 
DB_NAME = "lora_dashboard_db" 
COLLECTION_NAME = "readings"  

def get_mongo_collection():
    """
    Inicializa la conexión de MongoDB y devuelve el objeto 'collection'.
    """
    try:
        client = MongoClient(MONGO_URI) 
        db = client[DB_NAME]
        return db[COLLECTION_NAME]
    except Exception as e:
        print(f"CRÍTICO: Fallo al conectar a MongoDB: {e}")
        raise

# ==============================================================================
# 3. ENDPOINTS DE LA API (Rutas de Servicio)
# ==============================================================================

# --- ENDPOINT 1: RECIBIR DATOS DEL ESP32 (POST) ---
@app.route('/api/data', methods=['POST'])
def receive_data():
    """
    Maneja las peticiones POST enviadas por el nodo LoRaWAN/ESP32.
    ESPERA JSON: {"id": "...", "temp": X, "hum": Y, "pres": Z, "rssi": W}
    """
    try:
        readings_collection = get_mongo_collection()
        
        data = request.get_json()
        print(f"DEBUG: Datos recibidos del dispositivo: {data}")

        # --- CORRECCIÓN: LEER LAS CLAVES NUEVAS (temp, hum, pres) ---
        device_id = data.get('id', 'unknown')
        temp_val = safe_float(data.get('temp'))
        hum_val  = safe_float(data.get('hum'))
        pres_val = safe_float(data.get('pres'))
        rssi_val = safe_float(data.get('rssi'))

        # Validación: Al menos la temperatura debe ser válida para guardar
        if temp_val is None:
            print("DEBUG: Datos inválidos (Falta temperatura)")
            return jsonify({"status": "warning", "message": "Invalid data: temp is required"}), 200

        # Construcción del documento
        reading = {
            "timestamp": datetime.now().isoformat(),
            "device_id": device_id,
            "temp": temp_val, # Guardamos como 'temp' para coincidir con JS
            "hum":  hum_val,  # Guardamos como 'hum'
            "pres": pres_val, # Guardamos como 'pres'
            "rssi": rssi_val
        }
        
        readings_collection.insert_one(reading)
        
        print(f"DEBUG: Datos guardados en MongoDB. OK.")
        return jsonify({"status": "success", "message": "Data logged successfully"}), 200
        
    except Exception as e:
        print(f"CRÍTICO: Error al guardar datos o conectar: {e}")
        return jsonify({"status": "error", "message": "Server failed to log data"}), 500


# --- ENDPOINT 2: DEVOLVER DATOS AL JAVASCRIPT (GET) ---
@app.route('/api/history')
def get_history():
    """
    Recupera las últimas 200 lecturas.
    """
    try:
        readings_collection = get_mongo_collection()

        cursor = readings_collection.find(
            {}, 
            {"_id": 0} 
        ).sort("timestamp", -1).limit(200) 
        
        history_data = list(cursor) 
            
        return jsonify(list(reversed(history_data))) 
    
    except Exception as e:
        print(f"Error fetching history from MongoDB: {e}")
        return jsonify([]), 500

# --- ENDPOINT 3: LIMPIEZA DE DATOS (OPCIONAL) ---
@app.route('/api/cleanup', methods=['POST'])
def cleanup_data():
    """
    Borra datos antiguos (Endpoint simple para el botón de la web).
    """
    try:
        readings_collection = get_mongo_collection()
        # Borra todo para reiniciar (o podrías filtrar por fecha)
        result = readings_collection.delete_many({})
        return jsonify({"status": "success", "message": f"Deleted {result.deleted_count} records"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# --- ENDPOINT 4: SERVIR LA PÁGINA WEB ---
@app.route('/')
def index():
    return render_template('index.html')


# ==============================================================================
# 4. ARRANQUE DEL SERVIDOR
# ==============================================================================

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
