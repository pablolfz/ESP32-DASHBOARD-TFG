@app.route('/api/vibrations', methods=['POST'])
def post_vibration():
    try:
        data = request.get_json(force=True)
        id_cap = data.get('id')
        url = f"{FIREBASE_VIB_URL}/{id_cap}.json"
        
        # Obtenemos lo que ya hay en esa captura
        curr = requests.get(url).json()
        
        # Preparamos los nuevos bloques de los 3 sensores
        new_v1 = data.get('v1', [])
        new_v2 = data.get('v2', [])
        new_v3 = data.get('v3', [])

        if curr and "v1" in curr:
            # Unimos los bloques a lo que ya existía
            curr["v1"].extend(new_v1)
            curr["v2"].extend(new_v2)
            curr["v3"].extend(new_v3)
            requests.patch(url, json={
                "v1": curr["v1"], 
                "v2": curr["v2"], 
                "v3": curr["v3"]
            }, timeout=30)
        else:
            # Nueva captura
            payload = {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "device_id": data.get('device'),
                "v1": new_v1, "v2": new_v2, "v3": new_v3
            }
            requests.put(url, json=payload, timeout=30)

        return jsonify({"status": "success"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
