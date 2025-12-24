# app.py --- VERSIÓN ACTUALIZADA (Soporte para temp_local)

from flask import Flask, request, jsonify, render_template
from datetime import datetime
import os 
from pathlib import Path
import psycopg2 
from psycopg2.extras import RealDictCursor 

# ==============================================================================
# 1. FUNCIONES AUXILIARES
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

app = Flask(
    __name__, 
    static_folder=BASE_DIR / 'static',
    template_folder=BASE_DIR / 'templates'
)

# ==============================================================================
# 2. CONFIGURACIÓN DE POSTGRESQL
# ==============================================================================

DATABASE_URL = os.environ.get("DATABASE_URL")

def get_db_connection():
    if not DATABASE_URL:
        raise Exception("CRÍTICO: La variable de entorno DATABASE_URL no está configurada.")
    conn = psycopg2.connect(DATABASE_URL, sslmode='require')
    return conn

def init_db():
    """Crea la tabla si no existe (incluyendo columna temp_local)."""
    msg = ""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Tabla actualizada con temp_local
        cur.execute('''
            CREATE TABLE IF NOT EXISTS readings (
                id SERIAL PRIMARY KEY,
                timestamp TIMESTAMP NOT NULL,
                device_id TEXT,
                temp REAL,
                hum REAL,
                pres REAL,
                rssi REAL,
                temp_local REAL
            );
        ''')
        
        conn.commit()
        cur.close()
        conn.close()
        msg = "BASE DE DATOS INICIADA (Soporte temp_local)."
        print(msg)
        return True, msg
    except Exception as e:
        msg = f"Error iniciando PostgreSQL: {e}"
        print(msg)
        return False, msg

# ==============================================================================
# 3. ENDPOINTS DE LA API
# ==============================================================================

@app.route('/api/init-db', methods=['GET'])
def manual_init_db():
    success, message = init_db()
    return jsonify({"status": "success" if success else "error", "message": message}), 200 if success else 500

# --- RECIBIR DATOS (POST) ---
@app.route('/api/data', methods=['POST'])
def receive_data():
    try:
        data = request.get_json()
        print(f"DEBUG: Datos recibidos: {data}")

        # Leer datos (incluyendo el nuevo temp_local)
        device_id = data.get('id', 'unknown')
        temp_val = safe_float(data.get('temp'))
        hum_val  = safe_float(data.get('hum'))
        pres_val = safe_float(data.get('pres'))
        rssi_val = safe_float(data.get('rssi'))
        temp_local_val = safe_float(data.get('temp_local')) # <--- NUEVO

        if temp_val is None:
            return jsonify({"status": "warning", "message": "Falta temperatura"}), 200

        # Guardar en PostgreSQL
        conn = get_db_connection()
        cur = conn.cursor()
        
        # SQL Actualizado
        cur.execute(
            'INSERT INTO readings (timestamp, device_id, temp, hum, pres, rssi, temp_local) VALUES (%s, %s, %s, %s, %s, %s, %s)',
            (datetime.now(), device_id, temp_val, hum_val, pres_val, rssi_val, temp_local_val)
        )
        
        conn.commit()
        cur.close()
        conn.close()
        
        print(f"DEBUG: Datos guardados (incluyendo temp_local).")
        return jsonify({"status": "success", "message": "Data logged successfully"}), 200
        
    except Exception as e:
        print(f"CRÍTICO: Error PostgreSQL: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# --- OBTENER HISTORIAL (GET) ---
@app.route('/api/history')
def get_history():
    try:
        conn = get_db_connection()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        cur.execute('SELECT * FROM readings ORDER BY timestamp DESC LIMIT 200')
        rows = cur.fetchall()
        
        cur.close()
        conn.close()
        
        history_data = []
        for row in rows:
            row_dict = dict(row)
            if isinstance(row_dict['timestamp'], datetime):
                row_dict['timestamp'] = row_dict['timestamp'].isoformat()
            history_data.append(row_dict)
            
        return jsonify(list(reversed(history_data))) 
    
    except Exception as e:
        print(f"Error fetching history: {e}")
        return jsonify([]), 500

# --- LIMPIEZA DE DATOS ---
@app.route('/api/cleanup', methods=['POST'])
def cleanup_data():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('DELETE FROM readings')
        deleted_count = cur.rowcount
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"status": "success", "message": f"Eliminados {deleted_count} registros"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/')
def index():
    return render_template('index.html')

if os.environ.get("DATABASE_URL"):
    init_db()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
