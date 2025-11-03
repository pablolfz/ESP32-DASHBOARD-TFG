#app.py---Pablo López Fernández

#Importamos librerias necesarias
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
    Devuelve None si el valor es None o si la conversión falla (no es numérico).
    
    Esta función aegura que solo almacenemos números válidos o el valor None si el campo no existe o 
    es inválido
    """
    if value is None:
        return None
    try:
        # Intenta convertir el valor a flotante
        return float(value)
    except (TypeError, ValueError):
        # Captura errores si el valor es una cadena no numérica o de tipo incorrecto.
        return None


# --- CONFIGURACIÓN DE FLASK ---

# Obtiene la ruta base del directorio del script (app.py) de forma absoluta.
# 'Pathlib' se usa para construir rutas compatibles con diferentes sistemas operativos.
BASE_DIR = Path(__file__).parent.absolute()

# Inicialización de la aplicación Flask.
app = Flask(
    __name__, 
    # Define la carpeta donde Flask buscará archivos CSS y JS.
    static_folder=BASE_DIR / 'static',
    # Define la carpeta donde Flask buscará los archivos HTML.
    template_folder=BASE_DIR / 'templates'
)

# ==============================================================================
# 2. CONFIGURACIÓN DE MONGODB
# ==============================================================================

# Se obtiene la cadena de conexión desde las variables de entorno (como 'MONGO_URI').
# Esto permite que Render inyecte la URL de la base de datos.
# Si la variable de entorno no existe, usa la URL local por defecto (para desarrollo).
MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017/") 
DB_NAME = "lora_dashboard_db" 
COLLECTION_NAME = "readings"  

# Por ello, la conexión se encapsula en una función y se llama en cada petición para evitar fallos de conexión.

def get_mongo_collection():
    """
    Inicializa la conexión de MongoDB y devuelve el objeto 'collection'.
    """
    try:
        # Crea un cliente de MongoDB. Esto puede lanzar una excepción si la URI es incorrecta o el servidor no responde.
        client = MongoClient(MONGO_URI) 
        # Accede a la base de datos específica.
        db = client[DB_NAME]
        # Devuelve el objeto de la colección 'readings'.
        return db[COLLECTION_NAME]
    except Exception as e:
        # Manejo de errores de conexión. Si falla, se registra en la consola.
        print(f"CRÍTICO: Fallo al conectar a MongoDB Atlas en worker: {e}")
        # Relanzar la excepción provoca un fallo en el worker, lo que resulta en un error 500
        # para el cliente, indicando un error grave de infraestructura.
        raise

# ==============================================================================
# 3. ENDPOINTS DE LA API (Rutas de Servicio)
# ==============================================================================

# --- ENDPOINT 1: RECIBIR DATOS DEL ESP32 (POST) ---
@app.route('/api/data', methods=['POST'])
def receive_data():
    """
    Maneja las peticiones POST enviadas por el nodo LoRaWAN/ESP32 con las lecturas de sensores.
    """
    try:
        # 1. Establece la conexión a la base de datos.
        readings_collection = get_mongo_collection()
        
        # 2. Obtiene el cuerpo de la petición como un diccionario JSON.
        data = request.get_json()
        print(f"DEBUG: Datos recibidos del dispositivo: {data}")

        # 3. Validación y conversión de datos
        # Se utiliza safe_float() para extraer los valores y asegurar que son flotantes válidos.
        temp1_val = safe_float(data.get('temp1'))
        temp2_val = safe_float(data.get('temp2'))
        batt_val = safe_float(data.get('batt'))
        pct_val = safe_float(data.get('pct'))
        rssi_val = safe_float(data.get('rssi'))

        # 4. Verificación de datos mínimos
        if temp1_val is None or batt_val is None:
            # Si la lectura principal o la batería fallan, se devuelve una advertencia,
            # indicando que el paquete de datos estaba incompleto o corrupto.
            return jsonify({"status": "warning", "message": "Invalid data"}), 200

        # 5. Construcción del documento (diccionario) a insertar en MongoDB
        reading = {
            # Registra la hora del servidor como marca de tiempo, usando formato ISO para consistencia.
            "timestamp": datetime.now().isoformat(),
            "temp1": temp1_val,
            "temp2": temp2_val,
            "batt": batt_val,
            "pct": pct_val,
            "rssi": rssi_val
        }
        
        # 6. Inserción de la lectura en la colección.
        readings_collection.insert_one(reading)
        
        print(f"DEBUG: Datos guardados en MongoDB. OK.")
        # 7. Retorno de éxito
        return jsonify({"status": "success", "message": "Data logged successfully"}), 200
        
    except Exception as e:
        # Manejo genérico de errores (fallos de DB, JSON malformado, etc.)
        print(f"CRÍTICO: Error al guardar datos o conectar: {e}")
        # Retorna error 500 (Internal Server Error) para problemas irrecuperables.
        return jsonify({"status": "error", "message": "Server failed to log data"}), 500


# --- ENDPOINT 2: DEVOLVER DATOS AL JAVASCRIPT (GET) ---
@app.route('/api/history')
def get_history():
    """
    Recupera las últimas 200 lecturas de la base de datos para alimentar los gráficos del frontend.
    """
    try:
        # 1. Establece la conexión a la base de datos.
        readings_collection = get_mongo_collection()

        # 2. Ejecución de la consulta de MongoDB
        cursor = readings_collection.find(
            {}, # Primer argumento: Filtro vacío (trae todos los documentos).
            {"_id": 0} # Segundo argumento: Proyección. No incluir el campo '_id' interno de MongoDB.
        ).sort("timestamp", -1).limit(200) # Ordena por 'timestamp' DESCENDENTE (-1) y limita la lista a las 200 más recientes.
        
        # 3. Conversión de cursor a lista de diccionarios.
        history_data = list(cursor) 
            
        # 4. Retorno de datos
        # Se invierte la lista, ya que el frontend de gráficos (Chart.js) espera un orden cronológico ASCENDENTE.
        return jsonify(list(reversed(history_data))) 
    
    except Exception as e:
        print(f"Error fetching history from MongoDB: {e}")
        # En caso de error, devuelve una lista vacía para que el frontend no falle, y un error 500.
        return jsonify([]), 500

# --- ENDPOINT 3: SERVIR LA PÁGINA WEB PRINCIPAL (RAÍZ) ---
@app.route('/')
def index():
    """
    Ruta raíz ('/'). Renderiza y sirve el archivo HTML principal, 
    que contiene el dashboard y el código JavaScript.
    """
    # Busca el archivo 'index.html' en la carpeta 'templates'.
    return render_template('index.html')


# ==============================================================================
# 4. ARRANQUE DEL SERVIDOR
# ==============================================================================

if __name__ == '__main__':
    # Este bloque de código solo se ejecuta si el script se corre directamente
    # (es decir, en el entorno de desarrollo local).
    
    # Obtiene el puerto desde la variable de entorno 'PORT' (usada por Render) o usa 5000 por defecto.
    port = int(os.environ.get('PORT', 5000))
    
    # Inicia el servidor de desarrollo de Flask.
    app.run(host='0.0.0.0', port=port, debug=True)
