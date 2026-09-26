from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    role = Column(String(20), nullable=False)  # 'admin' or 'farmer'
    name = Column(String(100), nullable=False)
    email = Column(String(120), unique=True, nullable=True, index=True)      # Required for admin
    phone = Column(String(20), unique=True, nullable=True, index=True)       # Required for farmer
    hashed_password = Column(String(255), nullable=False)
    language_pref = Column(String(10), default="en")                         # 'en' or 'kn'
    created_at = Column(DateTime, default=datetime.utcnow)

    farms = relationship("Farm", back_populates="owner", cascade="all, delete-orphan")


class Farm(Base):
    __tablename__ = "farms"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String(150), nullable=False)
    location = Column(String(150), nullable=False)
    area_acres = Column(Float, default=5.0)
    tree_count = Column(Integer, default=1200)
    soil_type = Column(String(100), default="Laterite Red Loam")
    irrigation_type = Column(String(100), default="Drip & Sprinkler Micro-irrigation")
    tank_capacity_litres = Column(Float, default=15000.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="farms")
    zones = relationship("IrrigationZone", back_populates="farm", cascade="all, delete-orphan")
    devices = relationship("Device", back_populates="farm", cascade="all, delete-orphan")
    readings = relationship("SensorReading", back_populates="farm", cascade="all, delete-orphan")
    irrigation_events = relationship("IrrigationEvent", back_populates="farm", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="farm", cascade="all, delete-orphan")
    disease_detections = relationship("DiseaseDetection", back_populates="farm", cascade="all, delete-orphan")
    pump_state = relationship("PumpValveState", back_populates="farm", uselist=False, cascade="all, delete-orphan")
    settings = relationship("FarmSettings", back_populates="farm", uselist=False, cascade="all, delete-orphan")


class IrrigationZone(Base):
    __tablename__ = "irrigation_zones"

    id = Column(Integer, primary_key=True, index=True)
    farm_id = Column(Integer, ForeignKey("farms.id"), nullable=False)
    name = Column(String(100), nullable=False)  # e.g. "Zone 1 - Main South Block"
    variety = Column(String(100), default="Mangala / Thirthahalli Local")
    valve_index = Column(Integer, default=1)   # Valve 1, 2, 3
    moisture_threshold_min = Column(Float, default=40.0)
    moisture_target = Column(Float, default=70.0)
    tree_count = Column(Integer, default=400)
    valve_status = Column(String(20), default="CLOSED")  # "OPEN" or "CLOSED"

    farm = relationship("Farm", back_populates="zones")


class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    farm_id = Column(Integer, ForeignKey("farms.id"), nullable=False)
    device_uid = Column(String(64), unique=True, nullable=False)
    name = Column(String(100), nullable=False)
    device_type = Column(String(50), default="ESP32_IoT_Gateway")
    status = Column(String(20), default="ONLINE")  # "ONLINE", "OFFLINE", "STALE"
    battery_pct = Column(Float, default=96.0)
    wifi_rssi = Column(Integer, default=-58)       # in dBm
    firmware_version = Column(String(30), default="v2.4.1-areca")
    last_seen = Column(DateTime, default=datetime.utcnow)

    farm = relationship("Farm", back_populates="devices")


class SensorReading(Base):
    __tablename__ = "sensor_readings"

    id = Column(Integer, primary_key=True, index=True)
    farm_id = Column(Integer, ForeignKey("farms.id"), nullable=False)
    zone_id = Column(Integer, ForeignKey("irrigation_zones.id"), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Soil metrics
    soil_moisture = Column(Float, nullable=False)      # %
    soil_ph = Column(Float, nullable=False)            # pH 0-14
    nitrogen = Column(Float, nullable=False)           # mg/kg or kg/ha
    phosphorus = Column(Float, nullable=False)         # mg/kg
    potassium = Column(Float, nullable=False)          # mg/kg
    soil_temp = Column(Float, default=26.5)            # °C
    
    # Water metrics
    tank_level_pct = Column(Float, nullable=False)     # %
    tank_litres = Column(Float, default=11200.0)       # Litres
    water_flow_lpm = Column(Float, default=0.0)        # Litres per minute
    
    # Environmental metrics
    temperature_c = Column(Float, nullable=False)      # °C
    humidity_pct = Column(Float, nullable=False)       # %
    light_lux = Column(Float, nullable=False)          # Lux
    rain_detected = Column(Boolean, default=False)
    
    is_simulated = Column(Boolean, default=True)

    farm = relationship("Farm", back_populates="readings")


class PumpValveState(Base):
    __tablename__ = "pump_valve_states"

    id = Column(Integer, primary_key=True, index=True)
    farm_id = Column(Integer, ForeignKey("farms.id"), unique=True, nullable=False)
    pump_status = Column(String(10), default="OFF")         # "ON" or "OFF"
    operating_mode = Column(String(15), default="AUTO")     # "AUTO" or "MANUAL"
    valve_1 = Column(String(10), default="CLOSED")
    valve_2 = Column(String(10), default="CLOSED")
    valve_3 = Column(String(10), default="CLOSED")
    flow_rate_lpm = Column(Float, default=0.0)
    dry_run_tripped = Column(Boolean, default=False)
    emergency_lockout = Column(Boolean, default=False)
    last_action_by = Column(String(50), default="SYSTEM_AUTO")
    last_updated = Column(DateTime, default=datetime.utcnow)

    farm = relationship("Farm", back_populates="pump_state")


class IrrigationEvent(Base):
    __tablename__ = "irrigation_events"

    id = Column(Integer, primary_key=True, index=True)
    farm_id = Column(Integer, ForeignKey("farms.id"), nullable=False)
    zone_name = Column(String(100), default="Zone 1 - Main South Block")
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    duration_minutes = Column(Float, default=25.0)
    water_used_litres = Column(Float, default=850.0)
    trigger_type = Column(String(30), default="Smart Irrigation Engine")  # "Smart Irrigation Engine", "Manual Farmer Override", "Schedule"
    status = Column(String(30), default="COMPLETED")  # "COMPLETED", "INTERRUPTED_DRY_RUN", "RUNNING"
    reason = Column(Text, default="Soil moisture dropped below 40% with high diurnal evapotranspiration.")

    farm = relationship("Farm", back_populates="irrigation_events")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    farm_id = Column(Integer, ForeignKey("farms.id"), nullable=False)
    category = Column(String(40), default="SYSTEM")  # WATER, SOIL, NUTRIENT, PUMP, SAFETY, DISEASE, DEVICE
    severity = Column(String(20), default="INFO")    # CRITICAL, WARNING, INFO
    title = Column(String(150), nullable=False)
    message = Column(Text, nullable=False)
    action_recommendation = Column(Text, nullable=True)
    is_resolved = Column(Boolean, default=False)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    farm = relationship("Farm", back_populates="alerts")


class DiseaseDetection(Base):
    __tablename__ = "disease_detections"

    id = Column(Integer, primary_key=True, index=True)
    farm_id = Column(Integer, ForeignKey("farms.id"), nullable=False)
    organ = Column(String(50), default="Fruit Bunch")  # Leaves, Stem, Fruit Bunch
    condition = Column(String(120), nullable=False)    # e.g. "Koleroga / Mahali (Fruit Rot)"
    confidence = Column(Float, default=0.92)
    severity = Column(String(30), default="HIGH")      # LOW, MEDIUM, HIGH, CRITICAL, HEALTHY
    symptoms = Column(Text, nullable=False)
    recommended_action = Column(Text, nullable=False)
    image_filename = Column(String(255), nullable=True)
    is_simulated = Column(Boolean, default=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

    farm = relationship("Farm", back_populates="disease_detections")


class FarmSettings(Base):
    __tablename__ = "farm_settings"

    id = Column(Integer, primary_key=True, index=True)
    farm_id = Column(Integer, ForeignKey("farms.id"), unique=True, nullable=False)
    auto_irrigation = Column(Boolean, default=True)
    tank_critical_cutoff_pct = Column(Float, default=15.0)
    dry_run_timeout_seconds = Column(Integer, default=15)
    default_moisture_min = Column(Float, default=40.0)
    default_moisture_target = Column(Float, default=70.0)
    sms_alerts_enabled = Column(Boolean, default=True)
    whatsapp_alerts_enabled = Column(Boolean, default=False)
    emergency_contact_phone = Column(String(20), default="+919876543210")

    farm = relationship("Farm", back_populates="settings")
