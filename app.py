from flask import Flask, request, jsonify, render_template
from datetime import datetime
import os 
from pathlib import Path
import psycopg2 
from psycopg2.extras import RealDictCursor 

# --- CONFIGURACIÓN DE FLASK ---
BASE_DIR = Path(__file__).parent.absolute()
app = Flask(__name__, static_folder=BASE_DIR / 'static', template_folder=BASE_DIR / 'templates')

DATABASE_URL = os.environ.get("DATABASE_URL")

def get_db_connection():
    if not DATABASE_URL:
        raise Exception("Falta DATABASE_URL")
    return psycopg2.connect(DATABASE_URL, sslmode='require')

def safe_float(value):
    if value is None: return None
    try: return float(value)
    except: return None

# ==============================================================================
# GESTIÓN DE BASE DE DATOS
# ==============================================================================

def init_db():
    """Limpia y crea la tabla con la estructura de 6 sensores"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        # Borramos rastro de versiones antiguas para evitar el error de "timestamp"
        cur.execute('DROP TABLE IF EXISTS readings CASCADE;')
        cur.execute('''
            CREATE TABLE readings (
                id SERIAL PRIMARY KEY,
                timestamp TIMESTAMP NOT NULL,
                device_id TEXT,
                t_aht REAL,
                h_aht REAL,
                t1 REAL,
                t2 REAL,
                t3 REAL,
                t4 REAL,
                rssi REAL
            );
        ''')
        conn.commit()
        cur.close()
        conn.close()
        return True, "Base de datos reconstruida con éxito."
    except Exception as e:
        return False, str(e)

@app.route('/api/init-db', methods=['GET'])
def manual_init_route(): # Nombre único para evitar el AssertionError
    success, message = init_db()
    return jsonify({"status": "success" if success else "error", "message": message})

# ==============================================================================
# ENDPOINTS API
# ==============================================================================

@app.route('/api/data', methods=['POST'])
def receive_data():
    try:
        data = request.get_json()
        device_id = data.get('id', 'Estacion_Remota')
        
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute(
            '''INSERT INTO readings 
               (timestamp, device_id, t_aht, h_aht, t1, t2, t3, t4, rssi) 
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)''',
            (datetime.now(), device_id, 
             safe_float(data.get('t_aht')), safe_float(data.get('h_aht')),
             safe_float(data.get('t1')), safe_float(data.get('t2')),
             safe_float(data.get('t3')), safe_float(data.get('t4')),
             safe_float(data.get('rssi')))
        )
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"status": "success"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

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
        return jsonify([]), 500

@app.route('/api/cleanup', methods=['POST'])
def cleanup_data():
    success, message = init_db()
    return jsonify({"status": "success" if success else "error", "message": message})

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port)
