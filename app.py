# --- API PIEZOELÉCTRICO (Soporte 3 Sensores OPTIMIZADO) ---
@app.route('/api/vibrations', methods=['POST'])
def post_vibration():
    try:
        data = request.get_json(force=True)
        id_cap = data.get('id')
        if not id_cap: return jsonify({"status": "error", "message": "No ID"}), 400
        
        # El ESP32 nos dirá a partir de qué posición insertar este bloque
        offset = data.get('offset', 0)
        
        v1_new = data.get('v1') or data.get('ch1') or []
        v2_new = data.get('v2') or data.get('ch2') or []
        v3_new = data.get('v3') or data.get('ch3') or []

        print(f">> Recibido bloque para {id_cap} | Offset: {offset} | Puntos: {len(v1_new)}")

        # En Firebase, los arrays son en realidad objetos con índices numéricos ("0", "1", "2"...)
        # Preparamos un PATCH que inserte cada valor en su posición exacta.
        patch_payload = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "device_id": data.get('device', 'ESP32_Triaxial')
        }

        for idx, val in enumerate(v1_new): patch_payload[f"v1/{offset + idx}"] = val
        for idx, val in enumerate(v2_new): patch_payload[f"v2/{offset + idx}"] = val
        for idx, val in enumerate(v3_new): patch_payload[f"v3/{offset + idx}"] = val

        url = f"{FIREBASE_VIB_URL}/{id_cap}.json"
        # PATCH actualiza solo los campos indicados sin descargar ni borrar lo anterior
        requests.patch(url, json=patch_payload, timeout=20)

        return jsonify({"status": "success"}), 200
    except Exception as e:
        print(f"Error procesando vibración: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500
