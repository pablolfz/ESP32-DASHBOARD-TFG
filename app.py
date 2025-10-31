# Archivo: app.py (Adaptado para Render y MongoDB Atlas)

from flask import Flask, request, jsonify, render_template
from datetime import datetime
from pymongo import MongoClient
import os 
from pathlib import Path

# --- CONFIGURACIÓN DE FLASK ---
# Obtener la ruta del directorio donde se encuentra app.py
BASE_DIR = Path(__file__).parent.absolute()

# Asume que 'static' y 'templates' están en la misma carpeta que app.py
app = Flask(__name__, 
            static_folder=BASE_DIR / 'static',
            template_folder=BASE_DIR / 'templates')

# --- CONFIGURACIÓN CRÍTICA DE MONGODB ---

# CRÍTICO: Lee la cadena de conexión de las variables de entorno de Render.
# Si no está en Render, usa una URL local (solo para pruebas en su PC).
MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017/") 
DB_NAME = "lora_dashboard_db" # Nombre de la base de datos en MongoDB
COLLECTION_NAME = "readings"  # Nombre de la colección (equivalente a tabla)

try:
    # Conexión al cliente de MongoDB
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]
    readings_collection = db[COLLECTION_NAME]
    
    # Intenta hacer una operación simple para verificar la conexión
    # (Opcional, pero bueno para diagnóstico)
    db.command('ping') 
    print("DEBUG: Conexión a MongoDB Atlas exitosa.")
except Exception as e:
    # Si la conexión falla, es CRÍTICO para la app, Render debería mostrar esto en los logs
    print(f"CRÍTICO: Fallo al conectar a MongoDB Atlas. Verifique MONGO_URI en Render: {e}")
    # En un entorno de producción, es mejor que la app no arranque si no tiene DB.
    # No haremos 'exit(1)' aquí para que Render no falle, pero es un punto de fallo.


# --- FUNCIÓN AUXILIAR DE VALIDACIÓN ---

def safe_float(value, default=None):
    """Convierte un valor a float de forma segura."""
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return default
    return default


# --- ENDPOINT 1: RECIBIR DATOS DEL ESP32 (POST) ---

@app.route('/api/data', methods=['POST'])
def receive_data():
    """Recibe datos JSON del ESP32 y los guarda en MongoDB."""
    try:
        data = request.get_json()
        print(f"DEBUG: Datos recibidos del ESP32: {data}")

        # Extracción y validación de datos (usando la función safe_float)
        temp1_val = safe_float(data.get('temp1'))
        temp2_val = safe_float(data.get('temp2'))
        batt_val = safe_float(data.get('batt'))
        pct_val = safe_float(data.get('pct'))
        rssi_val = safe_float(data.get('rssi'))
        
        # Omitimos 'humedad' (humidity) ya que no se usaba en el código original.
        
        # Validar que al menos los campos críticos sean números válidos
        if temp1_val is None or batt_val is None:
             print("ADVERTENCIA: Datos críticos (temp1 o batt) no son números válidos.")
             return jsonify({"status": "warning", "message": "Invalid numeric data received"}), 200

        # Crear el documento para MongoDB
        reading = {
            "timestamp": datetime.now().isoformat(), # Usamos ISO format para ordenar y mostrar
            "temp1": temp1_val,
            "temp2": temp2_val,
            "batt": batt_val,
            "pct": pct_val,
            "rssi": rssi_val
        }
        
        # ⭐ INSERCIÓN EN MONGODB ⭐
        result = readings_collection.insert_one(reading)
        
        print(f"DEBUG: Datos guardados en MongoDB con ID: {result.inserted_id}. OK.")
        return jsonify({"status": "success", "message": "Data logged successfully"}), 200
        
    except Exception as e:
        print(f"CRÍTICO: Error al guardar datos en MongoDB: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# --- ENDPOINT 2: DEVOLVER DATOS AL JAVASCRIPT (GET) ---

@app.route('/api/history')
def get_history():
    """Consulta los últimos 200 registros en MongoDB y los devuelve al frontend."""
    try:
        # ⭐ CONSULTA A MONGODB ⭐
        # Sort by timestamp DESC (-1) y limita a 200
        cursor = readings_collection.find(
            {}, # Filtro vacío (trae todos)
            {"_id": 0} # No incluir el ID interno de MongoDB en el resultado
        ).sort("timestamp", -1).limit(200)
        
        # Convertir el cursor (resultados) a lista
        history_data = list(cursor)
        
        # El frontend (dashboard.js) espera la lista en orden cronológico ASCENDENTE
        # Por eso revertimos el orden (los 200 más recientes irán del más antiguo al más nuevo)
        return jsonify(list(reversed(history_data))) 
    
    except Exception as e:
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
    # En Render, gunicorn maneja el puerto y el host.
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)