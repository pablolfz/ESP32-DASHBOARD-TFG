# Archivo: app.py (SOLUCIÓN FINAL Y COMPLETA)

from flask import Flask, request, jsonify, render_template, send_file
from datetime import datetime, timedelta
from pymongo import MongoClient
from io import StringIO
import os 
import csv
from pathlib import Path

# --- CONFIGURACIÓN DE FLASK ---
BASE_DIR = Path(__file__).parent.absolute()
app = Flask(__name__, 
            static_folder=BASE_DIR / 'static',
            template_folder=BASE_DIR / 'templates')

# --- CONFIGURACIÓN CRÍTICA DE MONGODB ---
MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017/") 
DB_NAME = "lora_dashboard_db" 
COLLECTION_NAME = "readings"  

# Función auxiliar de validación (SOLUCIONA NameError: safe_float)
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

# Función auxiliar para inicializar la conexión por worker (SOLUCIONA DEADLOCK)
def get_mongo_collection():
    """Inicializa y devuelve la colección de MongoDB de forma lazy (por worker)."""
    try:
        # La variable MONGO_URI debe ser leída aquí (dentro de la función worker)
        # Esto es necesario para que cada worker tenga su propia conexión después del fork de Gunicorn
        client = MongoClient(MONGO_URI) 
        db = client[DB_NAME]
        # Devuelve la colección, lista para ser usada
        return db[COLLECTION_NAME]
    except Exception as e:
        print(f"CRÍTICO: Fallo al conectar a MongoDB Atlas en worker: {e}")
        # Lanza la excepción para que Render muestre el error 500
        raise


# --- ENDPOINT 1: RECIBIR DATOS DEL ESP32 (POST) ---
@app.route('/api/data', methods=['POST'])
def receive_data():
    try:
        readings_collection = get_mongo_collection()
        
        data = request.get_json()
        
        # Extracción y validación de datos
        temp1_val = safe_float(data.get('temp1'))
        temp2_val = safe_float(data.get('temp2'))
        batt_val = safe_float(data.get('batt'))
        pct_val = safe_float(data.get('pct'))
        rssi_val = safe_float(data.get('rssi'))

        if temp1_val is None or batt_val is None:
             # Si los datos principales son inválidos, retorna un 200 con warning
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
        
        # print(f"DEBUG: Datos guardados en MongoDB. OK.") # Descomentar para debug
        return jsonify({"status": "success", "message": "Data logged successfully"}), 200
        
    except Exception as e:
        print(f"CRÍTICO: Error al guardar datos o conectar: {e}")
        return jsonify({"status": "error", "message": "Server failed to log data"}), 500


# --- ENDPOINT 2: DEVOLVER DATOS AL JAVASCRIPT (GET) ---
@app.route('/api/history')
def get_history():
    try:
        readings_collection = get_mongo_collection()

        # Consulta a MongoDB: últimos 200
        cursor = readings_collection.find(
            {}, 
            {"_id": 0}
        ).sort("timestamp", -1).limit(200)
        
        history_data = list(cursor) 
            
        # El frontend espera orden cronológico ASCENDENTE
        return jsonify(list(reversed(history_data))) 
    
    except Exception as e:
        print(f"Error fetching history from MongoDB: {e}")
        return jsonify([]), 500

# --- ENDPOINT 3: EXPORTAR DATOS A CSV ---
@app.route('/api/export', methods=['GET'])
def export_data():
    try:
        readings_collection = get_mongo_collection()
        
        # Obtener TODOS los datos de la colección, ordenados
        cursor = readings_collection.find({}, {"_id": 0}).sort("timestamp", 1)
        data = list(cursor)

        if not data:
            return jsonify({"status": "error", "message": "No hay datos para exportar."}), 404

        # Crear un buffer en memoria para el archivo CSV
        buffer = StringIO()
        writer = csv.writer(buffer)

        # Definir cabeceras (keys del primer documento)
        headers = ["timestamp", "temp1", "temp2", "batt", "pct", "rssi"] # Asegurar orden
        writer.writerow(headers)

        # Escribir filas de datos
        for item in data:
            row = [item.get(h) for h in headers]
            writer.writerow(row)

        # Mover el puntero del buffer al inicio para la lectura
        buffer.seek(0)

        # Configurar el nombre del archivo de descarga
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"lora_dashboard_data_{timestamp}.csv"

        # Enviar el archivo
        return send_file(
            buffer,
            mimetype='text/csv',
            as_attachment=True,
            download_name=filename
        )

    except Exception as e:
        print(f"CRÍTICO: Error al exportar datos: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

# --- ENDPOINT 4: LIMPIEZA DE DATOS ANTIGUOS ---
@app.route('/api/cleanup', methods=['POST'])
def delete_old_data():
    try:
        readings_collection = get_mongo_collection()
        
        # Definir el punto de corte (30 días atrás)
        cutoff_date = datetime.now() - timedelta(days=30)
        
        # Eliminar documentos donde el timestamp es anterior a 30 días
        # CRÍTICO: Usar el formato ISO para la comparación
        result = readings_collection.delete_many({
            "timestamp": {"$lt": cutoff_date.isoformat()}
        })
        
        message = f"{result.deleted_count} registros eliminados exitosamente (anteriores a 30 días)."
        print(f"DEBUG: {message}")
        
        return jsonify({"status": "success", "message": message}), 200

    except Exception as e:
        print(f"CRÍTICO: Error al limpiar datos: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# --- SERVIR LA PÁGINA WEB ---
@app.route('/')
def index():
    """Sirve el archivo index.html (buscado en la carpeta 'templates')."""
    return render_template('index.html')


# --- ARRANQUE DEL SERVIDOR ---

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
