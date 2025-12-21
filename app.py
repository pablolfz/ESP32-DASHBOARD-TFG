# app.py --- VERSIÓN SQLITE (Sin MongoDB externo)

from flask import Flask, request, jsonify, render_template
from datetime import datetime
import sqlite3 # Librería estándar para base de datos en archivo
import os 
from pathlib import Path

# ==============================================================================
# 1. FUNCIONES AUXILIARES DE VALIDACIÓN
# ==============================================================================

def safe_float(value):
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None

# --- CONFIGURACIÓN DE FLASK ---
BASE_DIR = Path(__file__).parent.absolute()
DB_FILE = BASE_DIR / 'station_data.db' # El archivo de base de datos se creará aquí

app = Flask(
    __name__, 
    static_folder=BASE_DIR / 'static',
    template_folder=BASE_DIR / 'templates'
)

# ==============================================================================
# 2. CONFIGURACIÓN DE SQLITE
# ==============================================================================

def get_db_connection():
    """Abre conexión con el archivo SQLite y configura el formato de filas."""
    conn = sqlite3.connect(DB_FILE)
    # Esto permite acceder a las columnas por nombre (row['temp']) en lugar de índice
    conn.row_factory = sqlite3.Row 
    return conn

def init_db():
    """Crea la tabla si no existe. Se llama al iniciar la app."""
    conn = get_db_connection()
    try:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                device_id TEXT,
                temp REAL,
                hum REAL,
                pres REAL,
                rssi REAL
            )
        ''')
        conn.commit()
        print("BASE DE DATOS SQLITE INICIADA CORRECTAMENTE.")
    except Exception as e:
        print(f"Error iniciando DB: {e}")
    finally:
        conn.close()

# ==============================================================================
# 3. ENDPOINTS DE LA API
# ==============================================================================

# --- RECIBIR DATOS (POST) ---
@app.route('/api/data', methods=['POST'])
def receive_data():
    try:
        data = request.get_json()
        print(f"DEBUG: Datos recibidos: {data}")

        # Leer datos
        device_id = data.get('id', 'unknown')
        temp_val = safe_float(data.get('temp'))
        hum_val  = safe_float(data.get('hum'))
        pres_val = safe_float(data.get('pres'))
        rssi_val = safe_float(data.get('rssi'))

        if temp_val is None:
            return jsonify({"status": "warning", "message": "Invalid data: temp is required"}), 200

        # Guardar en SQLite
        conn = get_db_connection()
        conn.execute(
            'INSERT INTO readings (timestamp, device_id, temp, hum, pres, rssi) VALUES (?, ?, ?, ?, ?, ?)',
            (datetime.now().isoformat(), device_id, temp_val, hum_val, pres_val, rssi_val)
        )
        conn.commit()
        conn.close()
        
        print(f"DEBUG: Datos guardados en SQLite.")
        return jsonify({"status": "success", "message": "Data logged successfully"}), 200
        
    except Exception as e:
        print(f"CRÍTICO: Error en SQLite: {e}")
        return jsonify({"status": "error", "message": "Server failed to log data"}), 500


# --- OBTENER HISTORIAL (GET) ---
@app.route('/api/history')
def get_history():
    try:
        conn = get_db_connection()
        # Seleccionar las últimas 200 lecturas
        cursor = conn.execute('SELECT * FROM readings ORDER BY timestamp DESC LIMIT 200')
        rows = cursor.fetchall()
        conn.close()
        
        # Convertir filas SQLite a lista de diccionarios para JSON
        history_data = [dict(row) for row in rows]
            
        return jsonify(list(reversed(history_data))) 
    
    except Exception as e:
        print(f"Error fetching history: {e}")
        return jsonify([]), 500

# --- LIMPIEZA DE DATOS ---
@app.route('/api/cleanup', methods=['POST'])
def cleanup_data():
    try:
        conn = get_db_connection()
        cursor = conn.execute('DELETE FROM readings')
        conn.commit()
        deleted_count = cursor.rowcount
        conn.close()
        return jsonify({"status": "success", "message": f"Deleted {deleted_count} records"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# --- PÁGINA WEB ---
@app.route('/')
def index():
    return render_template('index.html')


# ==============================================================================
# 4. ARRANQUE
# ==============================================================================

if __name__ == '__main__':
    # Inicializar la DB antes de arrancar (crea el archivo si no existe)
    init_db()
    
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
