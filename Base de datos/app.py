# Archivo: app.py
from flask import Flask, request, jsonify, render_template
import sqlite3
from datetime import datetime
import json
import os 
from pathlib import Path

# Obtener la ruta del directorio donde se encuentra app.py
BASE_DIR = Path(__file__).parent.absolute()

# CONFIGURACIÓN CRÍTICA DE RUTAS 
DATABASE = BASE_DIR / 'sensor_data.db' 

# Asume que 'static' y 'templates' están en la misma carpeta que app.py
app = Flask(__name__, 
            static_folder=BASE_DIR / 'static',
            template_folder=BASE_DIR / 'templates') 

# --- FUNCIONES DE BASE DE DATOS ---

def init_db():
    """
    Inicializa la base de datos y crea/actualiza la tabla 'readings'.
    NOTA: Si ya tenías datos antiguos, esta función NO los borrará,
    pero es crítica para que la nueva estructura funcione.
    """
    conn = sqlite3.connect(str(DATABASE)) 
    cursor = conn.cursor()
    
    # ⭐ CAMBIO CRÍTICO: Nueva estructura de la tabla para T1, T2, Voltaje y Porcentaje ⭐
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS readings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            temp1 REAL,               -- T1
            temp2 REAL,               -- T2
            batt REAL,               -- Voltaje (B)
            pct INTEGER,             -- Porcentaje (P)
            rssi INTEGER,            -- RSSI
            -- La columna 'humedad' anterior se ignora en el código nuevo.
            -- Si deseas eliminar la antigua columna 'humedad', deberás hacerlo manualmente
            -- o crear una nueva tabla.
            humedad REAL
        )
    ''')
    conn.commit()
    conn.close()

# Inicializar la DB al arrancar la aplicación
init_db()

# --- ENDPOINT 1: RECIBIR DATOS DEL ESP32 (POST) ---
@app.route('/api/data', methods=['POST'])
def receive_data():
    try:
        # Usa request.get_json() para parsear el JSON
        data = request.get_json()
        
        print(f"\n--- POST DATA RECEIVED ---")
        print(f"PAYLOAD: {data}")
        
        if not data:
            return jsonify({"status": "error", "message": "No data received"}), 400

        # ⭐ CAMBIO CRÍTICO: FORZAR CONVERSIÓN A FLOAT Y MANEJAR ERRORES ⭐
        
        def safe_float(key):
            """Intenta convertir el valor a float, si falla, devuelve None."""
            val = data.get(key)
            if val is None:
                return None
            try:
                # El valor puede ser int, float o string. Convertimos a float.
                return float(val) 
            except (ValueError, TypeError):
                # Si el valor es una cadena no numérica (ej: "Error" o algo raro), devuelve None
                return None

        temp1_val = safe_float('temp1')
        temp2_val = safe_float('temp2')
        batt_val = safe_float('batt')
        
        # RSSI y PCT suelen ser enteros y se manejan directamente
        rssi_val = data.get('rssi')
        pct_val = data.get('pct')
        
        # Si temp1 es None después de la conversión (valor no válido), no guardamos
        if temp1_val is None or batt_val is None:
             print("ADVERTENCIA: Datos críticos (temp1 o batt) no son números válidos. Inserción omitida.")
             return jsonify({"status": "warning", "message": "Invalid numeric data received"}), 200

        # ... (Resto del código de timestamp y conexión DB se mantiene)

        timestamp = datetime.now().isoformat()
        humedad_val = None # Mantener como None o 0.0 para compatibilidad con la tabla
        
        conn = sqlite3.connect(str(DATABASE))
        cursor = conn.cursor()
        
        # INSERCIÓN EN LA NUEVA ESTRUCTURA DE COLUMNAS 
        cursor.execute(
            "INSERT INTO readings (timestamp, temp1, temp2, batt, pct, rssi, humedad) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (timestamp, temp1_val, temp2_val, batt_val, pct_val, rssi_val, humedad_val)
        ) 
        
        conn.commit()
        conn.close()

        print(f"DEBUG: Datos guardados T1={temp1_val}, T2={temp2_val}, Batt={pct_val}% (RSSI={rssi_val}). COMMIT OK.")
        print("--------------------------\n")
        return jsonify({"status": "success", "timestamp": timestamp}), 200
        
    except Exception as e:
        print(f"CRÍTICO: Error al guardar datos: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500
# --- ENDPOINT 2: DEVOLVER DATOS AL JAVASCRIPT (GET) ---
@app.route('/api/history')
def get_history():
    try:
        conn = sqlite3.connect(str(DATABASE))
        cursor = conn.cursor()
        
        # ⭐ SELECCIONAR LOS 5 NUEVOS CAMPOS ⭐
        cursor.execute("SELECT timestamp, temp1, temp2, batt, pct, rssi, humedad FROM readings ORDER BY timestamp DESC LIMIT 200")
        rows = cursor.fetchall()
        conn.close()
        
        # Mapeo de resultados a JSON
        history_data = [
            {
                "timestamp": row[0], 
                "temp1": row[1], 
                "temp2": row[2], 
                "batt": row[3], 
                "pct": row[4], 
                "rssi": row[5]
            }
            for row in reversed(rows) 
        ]
        return jsonify(history_data)
    except Exception as e:
        print(f"Error fetching history: {e}")
        return jsonify([]), 500

# --- SERVIR LA PÁGINA WEB ---
@app.route('/')
def index():
    # ⭐ Usa render_template para buscar en la carpeta 'templates'
    return render_template('index.html')
    

if __name__ == '__main__':
    # ⭐ CRÍTICO: Borrar la base de datos antigua (Opcional, solo si quieres empezar de cero)
    # try:
    #     os.remove(str(DATABASE))
    #     print("Base de datos antigua eliminada. Creando nueva estructura.")
    # except FileNotFoundError:
    #     pass

    # Inicializa la DB con la nueva estructura
    init_db() 
    
    app.run(host='0.0.0.0', port=5000, debug=True)