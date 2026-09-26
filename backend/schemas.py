from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    user_id: int
    name: str
    farm_id: Optional[int] = None
    language_pref: str = "en"

class TokenData(BaseModel):
    user_id: Optional[int] = None
    role: Optional[str] = None

class LoginAdminRequest(BaseModel):
    email: str
    password: str

class LoginFarmerRequest(BaseModel):
    phone: str
    password: str

class FarmerCreateRequest(BaseModel):
    name: str
    phone: str
    password: str
    email: Optional[str] = None
    farm_name: str
    location: str
    area_acres: float = 5.0
    tree_count: int = 1200
    soil_type: str = "Laterite Red Loam"
    irrigation_type: str = "Drip & Sprinkler Micro-irrigation"
    tank_capacity_litres: float = 15000.0

class FarmerUpdateRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    farm_name: Optional[str] = None
    location: Optional[str] = None
    area_acres: Optional[float] = None
    tree_count: Optional[int] = None
    soil_type: Optional[str] = None
    irrigation_type: Optional[str] = None
    tank_capacity_litres: Optional[float] = None
    language_pref: Optional[str] = None

class PumpControlRequest(BaseModel):
    action: str  # "ON" or "OFF"
    reason: Optional[str] = "Manual Farmer Override"

class ValveControlRequest(BaseModel):
    valve_index: int  # 1, 2, 3
    action: str       # "OPEN" or "CLOSED"

class OperatingModeRequest(BaseModel):
    mode: str  # "AUTO" or "MANUAL"

class ThresholdSettingsUpdate(BaseModel):
    moisture_min: Optional[float] = None
    moisture_target: Optional[float] = None
    tank_critical_cutoff_pct: Optional[float] = None
    dry_run_timeout_seconds: Optional[int] = None
    auto_irrigation: Optional[bool] = None

class TelemetryPush(BaseModel):
    soil_moisture: float
    soil_ph: float
    nitrogen: float
    phosphorus: float
    potassium: float
    tank_level_pct: float
    water_flow_lpm: float = 0.0
    temperature_c: float
    humidity_pct: float
    light_lux: float
    rain_detected: bool = False
    device_uid: Optional[str] = "ESP32_DEV_01"

class DiseaseScreenRequest(BaseModel):
    organ: Optional[str] = "Auto"  # Auto-detected or "Leaves", "Stem", "Fruit Bunch"
    sample_id: Optional[str] = None
    custom_image_base64: Optional[str] = None

class ChatRequest(BaseModel):
    message: str
    language: str = "en"  # "en" or "kn"

class ChatResponse(BaseModel):
    reply: str
    language: str
    suggested_actions: List[str] = []
    is_demo: bool = True

class SimulationScenarioRequest(BaseModel):
    scenario: str  # "normal", "low_water", "dry_run", "acidic_soil", "high_temp", "offline"

class ResetDryRunRequest(BaseModel):
    reset: bool = True

class IrrigationEventCreateRequest(BaseModel):
    zone_name: str
    duration_minutes: float = 25.0
    water_used_litres: float = 850.0
    trigger_type: str = "Manual Farmer Override"
    status: str = "COMPLETED"
    reason: Optional[str] = "Manual irrigation event logged by farmer."
    start_time: Optional[str] = None

class IrrigationEventUpdateRequest(BaseModel):
    zone_name: Optional[str] = None
    duration_minutes: Optional[float] = None
    water_used_litres: Optional[float] = None
    trigger_type: Optional[str] = None
    status: Optional[str] = None
    reason: Optional[str] = None
    start_time: Optional[str] = None
