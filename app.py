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
    """Crea la tabla adaptada a los 6 sensores (AHT + 4 Dallas)."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Nueva estructura de tabla
        cur.execute('''
            CREATE TABLE IF NOT EXISTS readings (
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
        print("BASE DE DATOS INICIADA (Estructura de 6 sensores).")
        return True, "DB OK"
    except Exception as e:
        print(f"Error iniciando PostgreSQL: {e}")
        return False, str(e)

# ==============================================================================
# 3. ENDPOINTS DE LA API
# ==============================================================================

@app.route('/api/init-db', methods=['GET'])
def manual_init_db():
    success, message = init_db()
    return jsonify({"status": "success" if success else "error", "message": message})

# --- RECIBIR DATOS (POST) ---
@app.route('/api/data', methods=['POST'])
def receive_data():
    try:
        data = request.get_json()
        print(f"DEBUG: Datos recibidos: {data}")

        # Mapeo de variables enviadas por el Receptor LoRa
        device_id = data.get('id', 'Estacion_Remota')
        t_aht = safe_float(data.get('t_aht'))
        h_aht = safe_float(data.get('h_aht'))
        t1    = safe_float(data.get('t1'))
        t2    = safe_float(data.get('t2'))
        t3    = safe_float(data.get('t3'))
        t4    = safe_float(data.get('t4'))
        rssi  = safe_float(data.get('rssi'))

        # Guardar en PostgreSQL
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute(
            '''INSERT INTO readings 
               (timestamp, device_id, t_aht, h_aht, t1, t2, t3, t4, rssi) 
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)''',
            (datetime.now(), device_id, t_aht, h_aht, t1, t2, t3, t4, rssi)
        )
        
        conn.commit()
        cur.close()
        conn.close()
        
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
        
        # Consultamos las nuevas columnas
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

# --- EXPORTAR CSV ---
@app.route('/api/export')
def export_data():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('SELECT timestamp, t_aht, h_aht, t1, t2, t3, t4, rssi FROM readings ORDER BY timestamp DESC')
        rows = cur.fetchall()
        
        csv_data = "Fecha,Temp_Ambiente,Hum_Ambiente,Sonda1,Sonda2,Sonda3,Sonda4,RSSI\n"
        for row in rows:
            csv_data += f"{row[0]},{row[1]},{row[2]},{row[3]},{row[4]},{row[5]},{row[6]},{row[7]}\n"
        
        cur.close()
        conn.close()
        
        return csv_data, 200, {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename=lecturas_lora.csv'
        }
    except Exception as e:
        return str(e), 500

# --- LIMPIEZA DE DATOS ---
@app.route('/api/cleanup', methods=['POST'])
def cleanup_data():
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('DROP TABLE IF EXISTS readings') # Forzamos borrado para re-estructurar
        conn.commit()
        init_db() # Re-creamos la tabla limpia
        cur.close()
        conn.close()
        return jsonify({"status": "success", "message": "Tabla reseteada correctamente"}), 200
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
