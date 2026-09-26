import requests
import json

BASE_URL = "http://127.0.0.1:8000"

def test_api():
    print("=== RUNNING SYSTEM AUTOMATED TESTS ===")

    # 1. Test Farmer Login
    res = requests.post(f"{BASE_URL}/api/auth/farmer/login", json={"phone": "9876543210", "password": "farmer123"})
    assert res.status_code == 200, f"Farmer login failed: {res.text}"
    farmer_token = res.json()["access_token"]
    print("[OK] Farmer login successful")

    farmer_headers = {"Authorization": f"Bearer {farmer_token}"}

    # 2. Test Admin Login
    res = requests.post(f"{BASE_URL}/api/auth/admin/login", json={"email": "admin@areca.farm", "password": "admin123"})
    assert res.status_code == 200, f"Admin login failed: {res.text}"
    admin_token = res.json()["access_token"]
    print("[OK] Admin login successful")

    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 3. Test Farmer Overview
    res = requests.get(f"{BASE_URL}/api/farm/current", headers=farmer_headers)
    assert res.status_code == 200, f"Farm current failed: {res.text}"
    data = res.json()
    assert data["farm"]["name"] == "Sri Manjunatha Areca Plantation"
    assert "overall_status" in data
    assert "daily_summary" in data
    print(f"[OK] Farm current overview retrieved. Status: {data['overall_status']['label']}")

    # 4. Test Irrigation Decision Engine
    # Set simulation scenario to normal to ensure pump can be tested
    requests.post(f"{BASE_URL}/api/simulation/scenario", json={"scenario": "normal"})
    requests.post(f"{BASE_URL}/api/irrigation/reset-dry-run", headers=farmer_headers, json={"reset": True})

    # Restore tank to 75% for testing
    requests.post(f"{BASE_URL}/api/telemetry/push", json={
        "soil_moisture": 56.0,
        "soil_ph": 6.2,
        "nitrogen": 210.0,
        "phosphorus": 38.0,
        "potassium": 185.0,
        "tank_level_pct": 78.0,
        "water_flow_lpm": 0.0,
        "temperature_c": 28.5,
        "humidity_pct": 72.0,
        "light_lux": 42000.0,
        "device_uid": "ESP32-ARECA-THIR-01"
    })

    res = requests.get(f"{BASE_URL}/api/irrigation/decision", headers=farmer_headers)
    assert res.status_code == 200, f"Decision engine failed: {res.text}"
    dec = res.json()
    print(f"[OK] Smart Decision Engine: {dec['decision']}")

    # 5. Test Pump Manual Toggle ON
    res = requests.post(f"{BASE_URL}/api/irrigation/pump", headers=farmer_headers, json={"action": "ON"})
    assert res.status_code == 200
    assert res.json()["pump_status"] == "ON"
    print("[OK] Pump turned ON successfully")

    # 6. Test Pump Manual Toggle OFF
    res = requests.post(f"{BASE_URL}/api/irrigation/pump", headers=farmer_headers, json={"action": "OFF"})
    assert res.status_code == 200
    assert res.json()["pump_status"] == "OFF"
    print("[OK] Pump turned OFF successfully")

    # 7. Test AI Disease Classifier
    res = requests.post(f"{BASE_URL}/api/disease/detect", headers=farmer_headers, json={"organ": "Fruit Bunch", "sample_id": "sample_koleroga"})
    assert res.status_code == 200
    disease_res = res.json()
    assert "Koleroga" in disease_res["condition_en"]
    print(f"[OK] AI Disease Screening: {disease_res['condition_en']} (Confidence: {disease_res['confidence_pct']}%)")

    # 8. Test AI Farmer Chatbot
    res = requests.post(f"{BASE_URL}/api/advisor/chat", headers=farmer_headers, json={"message": "Does my farm need water?", "language": "en"})
    assert res.status_code == 200
    print("[OK] AI Chatbot (EN) responded successfully")

    res_kn = requests.post(f"{BASE_URL}/api/advisor/chat", headers=farmer_headers, json={"message": "Does my farm need water?", "language": "kn"})
    assert res_kn.status_code == 200
    print("[OK] AI Chatbot (KN) responded successfully")

    # 9. Test OLED Display Telemetry
    res = requests.get(f"{BASE_URL}/api/oled/data?farm_id=1")
    assert res.status_code == 200
    oled_data = res.json()
    assert "line1_header" in oled_data
    print(f"[OK] OLED Telemetry: {oled_data['line2_soil']} | {oled_data['line4_tank']}")

    # 10. Test History Logs
    res = requests.get(f"{BASE_URL}/api/irrigation/events?range_filter=7days", headers=farmer_headers)
    assert res.status_code == 200
    events_data = res.json()
    assert "events" in events_data
    assert len(events_data["events"]) > 0
    print(f"[OK] Irrigation History Logs: Loaded {len(events_data['events'])} events, Total water: {events_data['total_water_litres']} L")

    res_telemetry = requests.get(f"{BASE_URL}/api/farm/readings/history?range_filter=7days", headers=farmer_headers)
    assert res_telemetry.status_code == 200
    hist = res_telemetry.json()
    assert len(hist["timestamps"]) > 0
    assert "records" in hist
    print(f"[OK] Historical Telemetry: Loaded {len(hist['timestamps'])} points and {len(hist['records'])} tabular log records")

    # 11. Test Admin Overview & Farmers CRUD
    res = requests.get(f"{BASE_URL}/api/admin/overview", headers=admin_headers)
    assert res.status_code == 200
    overview = res.json()
    assert overview["total_farmers"] >= 2
    print(f"[OK] Admin Overview: {overview['total_farmers']} farmers, {overview['total_farms']} farms monitored")

    print("\nALL 11 BACKEND AUTOMATED TESTS PASSED WITH 100% SUCCESS!")

if __name__ == "__main__":
    test_api()
