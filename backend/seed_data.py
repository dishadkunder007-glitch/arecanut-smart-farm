from datetime import datetime, timedelta
import random
from database import SessionLocal, engine, Base
import models
from auth import get_password_hash

def seed_database():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # Check if admin already exists
    existing_admin = db.query(models.User).filter(models.User.email == "admin@areca.farm").first()
    if existing_admin:
        print("Database already seeded. Skipping.")
        db.close()
        return

    print("Seeding database with initial Arecanut farms, farmers, and historical telemetry...")

    # 1. Admin
    admin = models.User(
        role="admin",
        name="Dr. K. S. Hegde (Agricultural Officer)",
        email="admin@areca.farm",
        phone="9900011223",
        hashed_password=get_password_hash("admin123"),
        language_pref="en"
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)

    # 2. Farmer 1: Shivaraj Gowda (Thirthahalli, Shivamogga)
    farmer1 = models.User(
        role="farmer",
        name="Shivaraj Gowda",
        email="shivaraj@areca.farm",
        phone="9876543210",
        hashed_password=get_password_hash("farmer123"),
        language_pref="kn"
    )
    db.add(farmer1)
    db.commit()
    db.refresh(farmer1)

    farm1 = models.Farm(
        owner_id=farmer1.id,
        name="Sri Manjunatha Areca Plantation",
        location="Thirthahalli, Shivamogga, Karnataka",
        area_acres=6.5,
        tree_count=1450,
        soil_type="Laterite Red Loam (Acidic clay loam)",
        irrigation_type="Automated Micro-Drip & Jet Sprinklers",
        tank_capacity_litres=20000.0
    )
    db.add(farm1)
    db.commit()
    db.refresh(farm1)

    # Zones for Farm 1
    zone1_1 = models.IrrigationZone(
        farm_id=farm1.id,
        name="Zone 1 - Main Bearing Palm Block",
        variety="Mangala / Thirthahalli Local",
        valve_index=1,
        moisture_threshold_min=42.0,
        moisture_target=70.0,
        tree_count=650,
        valve_status="CLOSED"
    )
    zone1_2 = models.IrrigationZone(
        farm_id=farm1.id,
        name="Zone 2 - Intercropped Area (Areca + Cocoa)",
        variety="Mohitnagar Hybrid + Cocoa",
        valve_index=2,
        moisture_threshold_min=45.0,
        moisture_target=72.0,
        tree_count=500,
        valve_status="CLOSED"
    )
    zone1_3 = models.IrrigationZone(
        farm_id=farm1.id,
        name="Zone 3 - Young Sapling Nursery & Hillside",
        variety="Thirthahalli High-Yielding Dwarf",
        valve_index=3,
        moisture_threshold_min=48.0,
        moisture_target=75.0,
        tree_count=300,
        valve_status="CLOSED"
    )
    db.add_all([zone1_1, zone1_2, zone1_3])

    # Device for Farm 1
    dev1 = models.Device(
        farm_id=farm1.id,
        device_uid="ESP32-ARECA-THIR-01",
        name="Field Master Gateway - Station 1",
        device_type="ESP32_DualCore_Gateway",
        status="ONLINE",
        battery_pct=94.0,
        wifi_rssi=-54,
        firmware_version="v2.5.0-iot-karnataka",
        last_seen=datetime.utcnow()
    )
    db.add(dev1)

    # Pump & Valve state for Farm 1
    pump1 = models.PumpValveState(
        farm_id=farm1.id,
        pump_status="OFF",
        operating_mode="AUTO",
        valve_1="CLOSED",
        valve_2="CLOSED",
        valve_3="CLOSED",
        flow_rate_lpm=0.0,
        dry_run_tripped=False,
        emergency_lockout=False,
        last_action_by="SYSTEM_SCHEDULE_STANDBY"
    )
    db.add(pump1)

    # Settings for Farm 1
    sett1 = models.FarmSettings(
        farm_id=farm1.id,
        auto_irrigation=True,
        tank_critical_cutoff_pct=16.0,
        dry_run_timeout_seconds=15,
        default_moisture_min=42.0,
        default_moisture_target=70.0,
        sms_alerts_enabled=True,
        whatsapp_alerts_enabled=True,
        emergency_contact_phone="9876543210"
    )
    db.add(sett1)

    # 3. Farmer 2: Ramesh Naik (Koppa, Chikkamagaluru)
    farmer2 = models.User(
        role="farmer",
        name="Ramesh Naik",
        email="ramesh@areca.farm",
        phone="9481234567",
        hashed_password=get_password_hash("farmer123"),
        language_pref="kn"
    )
    db.add(farmer2)
    db.commit()
    db.refresh(farmer2)

    farm2 = models.Farm(
        owner_id=farmer2.id,
        name="Sahyadri Valley Supari Estate",
        location="Koppa, Chikkamagaluru, Karnataka",
        area_acres=4.2,
        tree_count=980,
        soil_type="Clay Loam with High Organic Matter",
        irrigation_type="Drip Micro-sprinkler",
        tank_capacity_litres=12000.0
    )
    db.add(farm2)
    db.commit()
    db.refresh(farm2)

    zone2_1 = models.IrrigationZone(
        farm_id=farm2.id,
        name="Zone 1 - Valley Block",
        variety="South Kanara Local",
        valve_index=1,
        moisture_threshold_min=40.0,
        moisture_target=68.0,
        tree_count=580,
        valve_status="CLOSED"
    )
    zone2_2 = models.IrrigationZone(
        farm_id=farm2.id,
        name="Zone 2 - Ridge Terraces",
        variety="Sreemangala",
        valve_index=2,
        moisture_threshold_min=44.0,
        moisture_target=70.0,
        tree_count=400,
        valve_status="CLOSED"
    )
    db.add_all([zone2_1, zone2_2])

    dev2 = models.Device(
        farm_id=farm2.id,
        device_uid="ESP32-ARECA-KOPPA-02",
        name="Koppa Ridge Sensor Node",
        device_type="ESP32_Solar_Node",
        status="ONLINE",
        battery_pct=88.0,
        wifi_rssi=-62,
        firmware_version="v2.5.0-iot-karnataka",
        last_seen=datetime.utcnow()
    )
    db.add(dev2)

    pump2 = models.PumpValveState(
        farm_id=farm2.id,
        pump_status="OFF",
        operating_mode="AUTO",
        valve_1="CLOSED",
        valve_2="CLOSED",
        valve_3="CLOSED",
        flow_rate_lpm=0.0,
        dry_run_tripped=False
    )
    db.add(pump2)

    sett2 = models.FarmSettings(
        farm_id=farm2.id,
        auto_irrigation=True,
        tank_critical_cutoff_pct=15.0,
        emergency_contact_phone="9481234567"
    )
    db.add(sett2)
    db.commit()

    # 4. Generate 7-day Historical Telemetry for Farm 1 (Shivaraj Gowda)
    print("Generating 7 days of realistic time-series readings...")
    now = datetime.utcnow()
    readings = []
    
    for i in range(168, 0, -3):  # every 3 hours for the past 7 days
        t = now - timedelta(hours=i)
        hour = t.hour
        # Diurnal pattern
        if 6 <= hour <= 12:
            temp = 24.0 + (hour - 6) * 1.5 + random.uniform(-0.5, 0.5)
            hum = 85.0 - (hour - 6) * 4.0 + random.uniform(-2, 2)
            lux = (hour - 6) * 12000.0 + random.uniform(500, 2000)
        elif 13 <= hour <= 18:
            temp = 33.0 - (hour - 13) * 1.2 + random.uniform(-0.5, 0.5)
            hum = 60.0 + (hour - 13) * 3.5 + random.uniform(-2, 2)
            lux = max(1000.0, 75000.0 - (hour - 13) * 14000.0)
        else:
            temp = 22.0 + random.uniform(-0.5, 0.5)
            hum = 88.0 + random.uniform(-2, 2)
            lux = 0.0

        # Cycle moisture smoothly between 42% and 72%
        cycle_day = (i // 24) % 3
        if cycle_day == 0:
            moisture = 68.0 - ((i % 24) / 24.0) * 15.0
        elif cycle_day == 1:
            moisture = 53.0 - ((i % 24) / 24.0) * 12.0
        else:
            moisture = 41.0 + ((i % 24) / 24.0) * 28.0 # irrigation day

        moisture = max(35.0, min(80.0, moisture + random.uniform(-1.0, 1.0)))
        tank_pct = max(30.0, 85.0 - ((168 - i) / 168.0) * 35.0 + random.uniform(-1, 1))

        r = models.SensorReading(
            farm_id=farm1.id,
            timestamp=t,
            soil_moisture=round(moisture, 1),
            soil_ph=round(6.1 + random.uniform(-0.15, 0.15), 2),
            nitrogen=round(205.0 + random.uniform(-10, 10), 1),
            phosphorus=round(36.0 + random.uniform(-3, 3), 1),
            potassium=round(180.0 + random.uniform(-8, 8), 1),
            soil_temp=round(temp - 2.5, 1),
            tank_level_pct=round(tank_pct, 1),
            tank_litres=round((tank_pct / 100.0) * 20000.0, 0),
            water_flow_lpm=45.0 if (moisture > 65 and random.random() < 0.2) else 0.0,
            temperature_c=round(temp, 1),
            humidity_pct=round(hum, 1),
            light_lux=round(lux, 0),
            rain_detected=False,
            is_simulated=True
        )
        readings.append(r)

    # Current real-time reading for Farm 1
    readings.append(models.SensorReading(
        farm_id=farm1.id,
        timestamp=now,
        soil_moisture=56.4,
        soil_ph=6.15,
        nitrogen=210.0,
        phosphorus=38.5,
        potassium=182.0,
        soil_temp=26.2,
        tank_level_pct=76.8,
        tank_litres=15360.0,
        water_flow_lpm=0.0,
        temperature_c=29.2,
        humidity_pct=74.5,
        light_lux=42500.0,
        rain_detected=False,
        is_simulated=True
    ))

    # Real-time reading for Farm 2
    readings.append(models.SensorReading(
        farm_id=farm2.id,
        timestamp=now,
        soil_moisture=62.1,
        soil_ph=6.4,
        nitrogen=195.0,
        phosphorus=32.0,
        potassium=165.0,
        soil_temp=25.8,
        tank_level_pct=82.0,
        tank_litres=9840.0,
        water_flow_lpm=0.0,
        temperature_c=27.8,
        humidity_pct=78.0,
        light_lux=38000.0,
        rain_detected=False,
        is_simulated=True
    ))

    db.add_all(readings)

    # 5. Historical Irrigation Events for Farm 1
    events = [
        models.IrrigationEvent(
            farm_id=farm1.id,
            zone_name="Zone 1 - Main Bearing Palm Block",
            start_time=now - timedelta(days=1, hours=3),
            end_time=now - timedelta(days=1, hours=2, minutes=25),
            duration_minutes=35.0,
            water_used_litres=1540.0,
            trigger_type="Smart Irrigation Engine",
            status="COMPLETED",
            reason="Automated cycle: Soil moisture dropped below 42% threshold."
        ),
        models.IrrigationEvent(
            farm_id=farm1.id,
            zone_name="Zone 2 - Intercropped Area",
            start_time=now - timedelta(days=2, hours=4),
            end_time=now - timedelta(days=2, hours=3, minutes=35),
            duration_minutes=25.0,
            water_used_litres=1100.0,
            trigger_type="Smart Irrigation Engine",
            status="COMPLETED",
            reason="Scheduled drip pulse for young cocoa intercrop roots."
        ),
        models.IrrigationEvent(
            farm_id=farm1.id,
            zone_name="Zone 3 - Young Sapling Nursery",
            start_time=now - timedelta(days=3, hours=5),
            end_time=now - timedelta(days=3, hours=4, minutes=40),
            duration_minutes=20.0,
            water_used_litres=880.0,
            trigger_type="Manual Farmer Override",
            status="COMPLETED",
            reason="Farmer initiated supplementary irrigation before bio-fertilizer application."
        ),
        models.IrrigationEvent(
            farm_id=farm1.id,
            zone_name="Zone 1 - Main Bearing Palm Block",
            start_time=now - timedelta(days=5, hours=6),
            end_time=now - timedelta(days=5, hours=5, minutes=15),
            duration_minutes=45.0,
            water_used_litres=1980.0,
            trigger_type="Smart Irrigation Engine",
            status="COMPLETED",
            reason="Deep root-zone wetting cycle prior to fertilizer broadcast."
        ),
        models.IrrigationEvent(
            farm_id=farm1.id,
            zone_name="Zone 2 - Intercropped Area",
            start_time=now - timedelta(days=8, hours=3),
            end_time=now - timedelta(days=8, hours=2, minutes=30),
            duration_minutes=30.0,
            water_used_litres=1320.0,
            trigger_type="Smart Irrigation Engine",
            status="COMPLETED",
            reason="Maintained optimal moisture (65%) during high midday temperature."
        ),
        models.IrrigationEvent(
            farm_id=farm1.id,
            zone_name="Zone 1 - Main Bearing Palm Block",
            start_time=now - timedelta(days=12, hours=4),
            end_time=now - timedelta(days=12, hours=3, minutes=20),
            duration_minutes=40.0,
            water_used_litres=1760.0,
            trigger_type="Smart Irrigation Engine",
            status="COMPLETED",
            reason="Automated cycle: Soil moisture dropped below 42% threshold."
        ),
        models.IrrigationEvent(
            farm_id=farm1.id,
            zone_name="Zone 3 - Young Sapling Nursery",
            start_time=now - timedelta(days=18, hours=7),
            end_time=now - timedelta(days=18, hours=6, minutes=35),
            duration_minutes=25.0,
            water_used_litres=1100.0,
            trigger_type="Smart Irrigation Engine",
            status="COMPLETED",
            reason="Nursery sprinkler hydration pulse."
        )
    ]
    db.add_all(events)

    # 6. Sample Alerts
    alerts = [
        models.Alert(
            farm_id=farm1.id,
            category="ENVIRONMENT",
            severity="WARNING",
            title="High Koleroga (Fruit Rot) Risk Window",
            message="Relative humidity sustained > 80% with ambient warmth. Highly favorable conditions for Phytophthora meadii fungal spores.",
            action_recommendation="Inspect nut bunches for water-soaked spots. Prepare 1% Bordeaux mixture spray with adhesive resin sticker.",
            timestamp=now - timedelta(hours=5),
            is_resolved=False
        ),
        models.Alert(
            farm_id=farm1.id,
            category="SOIL",
            severity="INFO",
            title="Soil pH Slightly Acidic (6.15)",
            message="pH is marginally below optimal 6.5. Typical for Malnad laterite soils.",
            action_recommendation="Apply 300g dolomite powder per tree during post-monsoon weeding.",
            timestamp=now - timedelta(days=2),
            is_resolved=True
        )
    ]
    db.add_all(alerts)

    # 7. Sample Disease Detection Records
    disease_records = [
        models.DiseaseDetection(
            farm_id=farm1.id,
            organ="Fruit Bunch",
            condition="Koleroga / Mahali (Fruit Rot)",
            confidence=0.94,
            severity="HIGH",
            symptoms="Water-soaked dark lesions on tender green arecanuts, white mycelial growth on rachis, premature fruit drop.",
            recommended_action="1) Spray 1% Bordeaux mixture. 2) Tie polythene covers over bunches. 3) Burn fallen rotten nuts.",
            is_simulated=True,
            timestamp=now - timedelta(days=1)
        )
    ]
    db.add_all(disease_records)

    db.commit()
    db.close()
    print("Seeding completed successfully!")

if __name__ == "__main__":
    seed_database()
