@app.route('/api/vibrations', methods=['POST'])
def post_vibration():
    try:
        data = request.get_json(force=True, silent=True)
        if not data: return jsonify({"status": "error"}), 400

        capture_id = data.get('id')      # Ej: "Cap_171500"
        values = data.get('values', [])  # Los 5,000 puntos de este bloque
        is_last = data.get('last', False) # ¿Es el último paquete?

        # 1. Obtener datos actuales de Firebase para esa captura específica
        path = f"https://tfg2026-511e7-default-rtdb.europe-west1.firebasedatabase.app/vibrations/{capture_id}.json"
        current_res = requests.get(path).json()

        if current_res and "values" in current_res:
            # Si ya existe, extendemos la lista de puntos
            current_values = current_res["values"]
            current_values.extend(values)
            payload = {"values": current_values}
            # Usamos PATCH para actualizar solo los valores
            requests.patch(path, json=payload, timeout=30)
        else:
            # Si es el primer bloque, creamos el registro
            payload = {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "device_id": data.get('device', 'ESP32_4G'),
                "values": values
            }
            requests.put(path, json=payload, timeout=30)

        return jsonify({"status": "success", "message": "Bloque procesado"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
