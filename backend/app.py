import os
import asyncio
import re
import urllib.parse
import hashlib
import requests
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import FastAPI, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Query, UploadFile, File, Form, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from database import get_db, Base, engine, SessionLocal
import models
import schemas
from auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    get_current_user,
    get_current_admin,
    get_current_farmer
)
from decision_engine import SmartIrrigationEngine
from simulation import simulation_manager
from disease_service import DiseaseClassifierService
from ai_advisor import AIFarmAdvisor
from seed_data import seed_database

# Create DB tables and run seeder if fresh
Base.metadata.create_all(bind=engine)
seed_database()

app = FastAPI(
    title="Arecanut Smart Irrigation & AI Farm Management API",
    version="2.0.0",
    description="Mobile-First IoT & AI Agriculture Platform for Arecanut Palms"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(connection)

ws_manager = ConnectionManager()

# Background task for continuous real-time IoT simulation
async def simulation_loop():
    while True:
        try:
            db = SessionLocal()
            # Simulate for all active farms (or primary farm 1)
            farms = db.query(models.Farm).all()
            broadcast_payload = {}
            for f in farms:
                reading = simulation_manager.tick_simulation(db, f.id)
                if reading and f.id == 1:
                    pump = db.query(models.PumpValveState).filter(models.PumpValveState.farm_id == f.id).first()
                    alerts_cnt = db.query(models.Alert).filter(models.Alert.farm_id == f.id, models.Alert.is_resolved == False).count()
                    status_lbl, badge, reason_en, reason_kn = SmartIrrigationEngine.evaluate_farm_status(reading, pump, alerts_cnt)
                    decision = SmartIrrigationEngine.evaluate_irrigation_decision(db, f, reading, pump)
                    broadcast_payload = {
                        "type": "telemetry_update",
                        "farm_id": f.id,
                        "timestamp": reading.timestamp.isoformat(),
                        "soil_moisture": reading.soil_moisture,
                        "soil_ph": reading.soil_ph,
                        "nitrogen": reading.nitrogen,
                        "phosphorus": reading.phosphorus,
                        "potassium": reading.potassium,
                        "soil_temp": reading.soil_temp,
                        "tank_level_pct": reading.tank_level_pct,
                        "tank_litres": reading.tank_litres,
                        "water_flow_lpm": reading.water_flow_lpm,
                        "temperature_c": reading.temperature_c,
                        "humidity_pct": reading.humidity_pct,
                        "light_lux": reading.light_lux,
                        "pump_status": pump.pump_status if pump else "OFF",
                        "operating_mode": pump.operating_mode if pump else "AUTO",
                        "valve_1": pump.valve_1 if pump else "CLOSED",
                        "valve_2": pump.valve_2 if pump else "CLOSED",
                        "valve_3": pump.valve_3 if pump else "CLOSED",
                        "dry_run_tripped": pump.dry_run_tripped if pump else False,
                        "overall_status": status_lbl,
                        "overall_badge": badge,
                        "overall_reason": reason_en,
                        "overall_reason_en": reason_en,
                        "overall_reason_kn": reason_kn,
                        "irrigation_decision": decision,
                        "scenario": simulation_manager.scenario,
                        "is_simulated": reading.is_simulated
                    }
            db.close()
            if broadcast_payload:
                await ws_manager.broadcast(broadcast_payload)
        except Exception as e:
            print("Error in simulation loop:", e)
        await asyncio.sleep(3.0)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(simulation_loop())


# ==========================================
# 1. AUTHENTICATION & ROLES
# ==========================================

@app.post("/api/auth/admin/login", response_model=schemas.Token)
def admin_login(creds: schemas.LoginAdminRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == creds.email, models.User.role == "admin").first()
    if not user or not verify_password(creds.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin email or password")
    
    token = create_access_token(data={"user_id": user.id, "role": user.role})
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role,
        "user_id": user.id,
        "name": user.name,
        "farm_id": None,
        "language_pref": user.language_pref or "en"
    }

@app.post("/api/auth/farmer/login", response_model=schemas.Token)
def farmer_login(creds: schemas.LoginFarmerRequest, db: Session = Depends(get_db)):
    # Clean phone input
    clean_phone = creds.phone.replace(" ", "").replace("+91", "").strip()
    user = db.query(models.User).filter(
        (models.User.phone == clean_phone) | (models.User.phone == creds.phone),
        models.User.role == "farmer"
    ).first()
    
    if not user or not verify_password(creds.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid phone number or password")

    farm = db.query(models.Farm).filter(models.Farm.owner_id == user.id).first()
    farm_id = farm.id if farm else 1

    token = create_access_token(data={"user_id": user.id, "role": user.role, "farm_id": farm_id})
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role,
        "user_id": user.id,
        "name": user.name,
        "farm_id": farm_id,
        "language_pref": user.language_pref or "kn"
    }

@app.get("/api/auth/me")
def get_me(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    farm = db.query(models.Farm).filter(models.Farm.owner_id == current_user.id).first()
    return {
        "id": current_user.id,
        "name": current_user.name,
        "role": current_user.role,
        "email": current_user.email,
        "phone": current_user.phone,
        "language_pref": current_user.language_pref,
        "farm": {
            "id": farm.id,
            "name": farm.name,
            "location": farm.location,
            "area_acres": farm.area_acres,
            "tree_count": farm.tree_count,
            "soil_type": farm.soil_type,
            "irrigation_type": farm.irrigation_type,
            "tank_capacity_litres": farm.tank_capacity_litres
        } if farm else None
    }


# ==========================================
# 2. FARMER OVERVIEW & REAL-TIME MONITORING
# ==========================================

@app.get("/api/farm/current")
def get_farm_current_overview(
    farm_id: Optional[int] = Query(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # If farmer, force their own farm
    if current_user.role == "farmer":
        farm = db.query(models.Farm).filter(models.Farm.owner_id == current_user.id).first()
    else:
        target_id = farm_id or 1
        farm = db.query(models.Farm).filter(models.Farm.id == target_id).first()

    if not farm:
        raise HTTPException(status_code=404, detail="Farm not found")

    reading = db.query(models.SensorReading).filter(models.SensorReading.farm_id == farm.id).order_by(models.SensorReading.timestamp.desc()).first()
    pump_state = db.query(models.PumpValveState).filter(models.PumpValveState.farm_id == farm.id).first()
    alerts = db.query(models.Alert).filter(models.Alert.farm_id == farm.id, models.Alert.is_resolved == False).all()
    zones = db.query(models.IrrigationZone).filter(models.IrrigationZone.farm_id == farm.id).all()
    devices = db.query(models.Device).filter(models.Device.farm_id == farm.id).all()

    # Calculate status & decisions
    status_lbl, badge, reason_en, reason_kn = SmartIrrigationEngine.evaluate_farm_status(reading, pump_state, len(alerts))
    irrigation_decision = SmartIrrigationEngine.evaluate_irrigation_decision(db, farm, reading, pump_state)
    recommendations = AIFarmAdvisor.generate_recommendations(farm, reading, pump_state, alerts)

    # Calculate daily summary stats
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_events = db.query(models.IrrigationEvent).filter(
        models.IrrigationEvent.farm_id == farm.id,
        models.IrrigationEvent.start_time >= today_start
    ).all()
    water_used_today = sum(e.water_used_litres or 0.0 for e in today_events)
    irrigation_minutes_today = sum(e.duration_minutes or 0.0 for e in today_events)

    return {
        "farm": {
            "id": farm.id,
            "name": farm.name,
            "owner_name": farm.owner.name,
            "location": farm.location,
            "area_acres": farm.area_acres,
            "tree_count": farm.tree_count,
            "soil_type": farm.soil_type,
            "irrigation_type": farm.irrigation_type,
            "tank_capacity_litres": farm.tank_capacity_litres
        },
        "overall_status": {
            "label": status_lbl,
            "badge": badge,
            "reason": reason_en,
            "reason_en": reason_en,
            "reason_kn": reason_kn
        },
        "reading": {
            "timestamp": reading.timestamp.isoformat() if reading else None,
            "soil_moisture": reading.soil_moisture if reading else 50.0,
            "soil_ph": reading.soil_ph if reading else 6.5,
            "nitrogen": reading.nitrogen if reading else 200.0,
            "phosphorus": reading.phosphorus if reading else 35.0,
            "potassium": reading.potassium if reading else 180.0,
            "soil_temp": reading.soil_temp if reading else 26.0,
            "tank_level_pct": reading.tank_level_pct if reading else 75.0,
            "tank_litres": reading.tank_litres if reading else 11250.0,
            "water_flow_lpm": reading.water_flow_lpm if reading else 0.0,
            "temperature_c": reading.temperature_c if reading else 28.0,
            "humidity_pct": reading.humidity_pct if reading else 70.0,
            "light_lux": reading.light_lux if reading else 45000.0,
            "is_simulated": reading.is_simulated if reading else True
        },
        "pump_state": {
            "pump_status": pump_state.pump_status,
            "operating_mode": pump_state.operating_mode,
            "valve_1": pump_state.valve_1,
            "valve_2": pump_state.valve_2,
            "valve_3": pump_state.valve_3,
            "flow_rate_lpm": pump_state.flow_rate_lpm,
            "dry_run_tripped": pump_state.dry_run_tripped,
            "emergency_lockout": pump_state.emergency_lockout,
            "last_action_by": pump_state.last_action_by,
            "last_updated": pump_state.last_updated.isoformat()
        },
        "daily_summary": {
            "condition": status_lbl,
            "irrigation_events_count": len(today_events),
            "irrigation_time_minutes": irrigation_minutes_today,
            "water_used_litres": water_used_today,
            "average_soil_moisture": reading.soil_moisture if reading else 52.0,
            "avg_temp_c": reading.temperature_c if reading else 28.0,
            "avg_humidity_pct": reading.humidity_pct if reading else 72.0,
            "tank_level_pct": reading.tank_level_pct if reading else 75.0,
            "nutrient_status": "Adequate" if (reading and reading.nitrogen > 180 and reading.potassium > 140) else "Attention Needed",
            "active_alerts_count": len(alerts),
            "disease_risk": "Moderate (Check bunches for Koleroga)" if (reading and reading.humidity_pct > 75) else "Low"
        },
        "irrigation_decision": irrigation_decision,
        "recommendations": recommendations,
        "zones": [
            {
                "id": z.id,
                "name": z.name,
                "variety": z.variety,
                "valve_index": z.valve_index,
                "moisture_threshold_min": z.moisture_threshold_min,
                "moisture_target": z.moisture_target,
                "tree_count": z.tree_count,
                "valve_status": z.valve_status
            } for z in zones
        ],
        "devices": [
            {
                "id": d.id,
                "uid": d.device_uid,
                "name": d.name,
                "type": d.device_type,
                "status": d.status,
                "battery_pct": d.battery_pct,
                "wifi_rssi": d.wifi_rssi,
                "last_seen": d.last_seen.isoformat()
            } for d in devices
        ],
        "alerts_count": len(alerts),
        "scenario": simulation_manager.scenario
    }


# ==========================================
# 3. SMART IRRIGATION CONTROLS
# ==========================================

@app.post("/api/irrigation/pump")
def control_pump(
    req: schemas.PumpControlRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    farm_id = 1 if current_user.role == "admin" else (current_user.farms[0].id if current_user.farms else 1)
    pump_state = db.query(models.PumpValveState).filter(models.PumpValveState.farm_id == farm_id).first()
    reading = db.query(models.SensorReading).filter(models.SensorReading.farm_id == farm_id).order_by(models.SensorReading.timestamp.desc()).first()

    if not pump_state:
        raise HTTPException(status_code=404, detail="Pump controller not found")

    if req.action == "ON":
        # Check safety before turning ON
        if pump_state.dry_run_tripped:
            raise HTTPException(status_code=400, detail="Pump is locked out by Dry-Run Protection! Reset lockout first.")
        if reading and reading.tank_level_pct < 15.0:
            raise HTTPException(status_code=400, detail="Cannot start pump: Water storage level is critically low (< 15%).")

        pump_state.pump_status = "ON"
        pump_state.operating_mode = "MANUAL"  # Explicitly switch to MANUAL mode on manual start
        # Auto open Valve 1 if all closed
        if pump_state.valve_1 == "CLOSED" and pump_state.valve_2 == "CLOSED" and pump_state.valve_3 == "CLOSED":
            pump_state.valve_1 = "OPEN"
        pump_state.flow_rate_lpm = 45.0
        pump_state.last_action_by = f"Manual ({current_user.name})"
        pump_state.last_updated = datetime.utcnow()

        # Log irrigation event
        event = models.IrrigationEvent(
            farm_id=farm_id,
            zone_name="Zone 1 - Main Bearing Palm Block",
            start_time=datetime.utcnow(),
            trigger_type=f"Manual Override by {current_user.name}",
            status="RUNNING",
            reason=req.reason or "Farmer initiated manual irrigation cycle."
        )
        db.add(event)

    else:
        pump_state.pump_status = "OFF"
        pump_state.valve_1 = "CLOSED"
        pump_state.valve_2 = "CLOSED"
        pump_state.valve_3 = "CLOSED"
        pump_state.flow_rate_lpm = 0.0
        pump_state.last_action_by = f"Manual OFF ({current_user.name})"
        pump_state.last_updated = datetime.utcnow()

        # Close running irrigation event
        running_event = db.query(models.IrrigationEvent).filter(
            models.IrrigationEvent.farm_id == farm_id,
            models.IrrigationEvent.status == "RUNNING"
        ).order_by(models.IrrigationEvent.start_time.desc()).first()
        if running_event:
            running_event.end_time = datetime.utcnow()
            running_event.status = "COMPLETED"
            duration = (running_event.end_time - running_event.start_time).total_seconds() / 60.0
            running_event.duration_minutes = round(max(1.0, duration), 1)
            running_event.water_used_litres = round(running_event.duration_minutes * 45.0, 1)

    db.commit()
    return {
        "success": True,
        "pump_status": pump_state.pump_status,
        "flow_rate_lpm": pump_state.flow_rate_lpm,
        "message": f"Pump turned {req.action} successfully"
    }

@app.post("/api/irrigation/valve")
def control_valve(
    req: schemas.ValveControlRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    farm_id = 1 if current_user.role == "admin" else (current_user.farms[0].id if current_user.farms else 1)
    pump_state = db.query(models.PumpValveState).filter(models.PumpValveState.farm_id == farm_id).first()

    if not pump_state:
        raise HTTPException(status_code=404, detail="Pump state not found")

    if req.valve_index == 1:
        pump_state.valve_1 = req.action
    elif req.valve_index == 2:
        pump_state.valve_2 = req.action
    elif req.valve_index == 3:
        pump_state.valve_3 = req.action
    else:
        raise HTTPException(status_code=400, detail="Invalid valve index")

    pump_state.last_action_by = f"Manual Valve {req.valve_index} {req.action} ({current_user.name})"
    pump_state.last_updated = datetime.utcnow()
    db.commit()

    return {
        "success": True,
        "valve_index": req.valve_index,
        "action": req.action,
        "valve_1": pump_state.valve_1,
        "valve_2": pump_state.valve_2,
        "valve_3": pump_state.valve_3
    }

@app.post("/api/irrigation/mode")
def toggle_operating_mode(
    req: schemas.OperatingModeRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    farm_id = 1 if current_user.role == "admin" else (current_user.farms[0].id if current_user.farms else 1)
    pump_state = db.query(models.PumpValveState).filter(models.PumpValveState.farm_id == farm_id).first()

    if not pump_state:
        raise HTTPException(status_code=404, detail="Pump controller not found")

    if req.mode not in ["AUTO", "MANUAL"]:
        raise HTTPException(status_code=400, detail="Mode must be AUTO or MANUAL")

    pump_state.operating_mode = req.mode
    pump_state.last_action_by = f"Mode switched to {req.mode} by {current_user.name}"
    pump_state.last_updated = datetime.utcnow()
    db.commit()

    return {
        "success": True,
        "mode": pump_state.operating_mode,
        "pump_status": pump_state.pump_status,
        "flow_rate_lpm": pump_state.flow_rate_lpm
    }

@app.post("/api/irrigation/reset-dry-run")
def reset_dry_run_lockout(
    req: schemas.ResetDryRunRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    farm_id = 1 if current_user.role == "admin" else (current_user.farms[0].id if current_user.farms else 1)
    pump_state = db.query(models.PumpValveState).filter(models.PumpValveState.farm_id == farm_id).first()

    pump_state.dry_run_tripped = False
    pump_state.emergency_lockout = False
    pump_state.pump_status = "OFF"
    pump_state.last_action_by = f"Dry-run lockout cleared by {current_user.name}"
    pump_state.last_updated = datetime.utcnow()

    # Resolve any open dry-run alert
    alerts = db.query(models.Alert).filter(
        models.Alert.farm_id == farm_id,
        models.Alert.category == "PUMP",
        models.Alert.is_resolved == False
    ).all()
    for a in alerts:
        a.is_resolved = True

    # If simulation was in dry_run scenario, reset to normal
    if simulation_manager.scenario == "dry_run":
        simulation_manager.set_scenario("normal")

    db.commit()
    return {"success": True, "message": "Dry-run protection reset. System returned to ready standby."}

@app.get("/api/irrigation/decision")
def get_irrigation_decision(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    farm_id = 1 if current_user.role == "admin" else current_user.farms[0].id
    farm = db.query(models.Farm).filter(models.Farm.id == farm_id).first()
    reading = db.query(models.SensorReading).filter(models.SensorReading.farm_id == farm_id).order_by(models.SensorReading.timestamp.desc()).first()
    pump_state = db.query(models.PumpValveState).filter(models.PumpValveState.farm_id == farm_id).first()

    return SmartIrrigationEngine.evaluate_irrigation_decision(db, farm, reading, pump_state)

@app.get("/api/irrigation/events")
def get_irrigation_events(
    limit: int = 6,
    range_filter: str = Query("7days", pattern="^(today|yesterday|7days|30days)$"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    farm_id = 1 if current_user.role == "admin" else current_user.farms[0].id
    now = datetime.utcnow()

    if range_filter == "today":
        since = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif range_filter == "yesterday":
        since = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    elif range_filter == "30days":
        since = now - timedelta(days=30)
    else:  # "7days"
        since = now - timedelta(days=7)

    events = (
        db.query(models.IrrigationEvent)
        .filter(models.IrrigationEvent.farm_id == farm_id, models.IrrigationEvent.start_time >= since)
        .order_by(models.IrrigationEvent.start_time.desc())
        .limit(limit)
        .all()
    )

    # Fallback to recent events if none in strict range
    if not events:
        events = (
            db.query(models.IrrigationEvent)
            .filter(models.IrrigationEvent.farm_id == farm_id)
            .order_by(models.IrrigationEvent.start_time.desc())
            .limit(6)
            .all()
        )

    total_water = sum(e.water_used_litres or 0.0 for e in events)
    total_minutes = sum(e.duration_minutes or 0.0 for e in events)

    return {
        "range_filter": range_filter,
        "total_water_litres": round(total_water, 1),
        "total_minutes": round(total_minutes, 1),
        "total_events": len(events),
        "events": [
            {
                "id": e.id,
                "zone_name": e.zone_name,
                "start_time": e.start_time.strftime("%d %b %Y, %I:%M %p"),
                "end_time": e.end_time.strftime("%d %b %Y, %I:%M %p") if e.end_time else "In Progress",
                "duration_minutes": e.duration_minutes,
                "water_used_litres": e.water_used_litres,
                "trigger_type": e.trigger_type,
                "status": e.status,
                "reason": e.reason
            } for e in events
        ]
    }

@app.post("/api/irrigation/events")
def create_irrigation_event(
    req: schemas.IrrigationEventCreateRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    farm_id = 1 if current_user.role == "admin" else (current_user.farms[0].id if current_user.farms else 1)
    start_dt = datetime.utcnow()
    if req.start_time:
        try:
            start_dt = datetime.fromisoformat(req.start_time.replace("Z", "+00:00"))
        except Exception:
            pass

    end_dt = start_dt + timedelta(minutes=req.duration_minutes)

    event = models.IrrigationEvent(
        farm_id=farm_id,
        zone_name=req.zone_name,
        start_time=start_dt,
        end_time=end_dt,
        duration_minutes=round(req.duration_minutes, 1),
        water_used_litres=round(req.water_used_litres, 1),
        trigger_type=req.trigger_type,
        status=req.status,
        reason=req.reason or "Manually recorded past irrigation event."
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return {
        "success": True,
        "event": {
            "id": event.id,
            "zone_name": event.zone_name,
            "start_time": event.start_time.strftime("%d %b %Y, %I:%M %p"),
            "end_time": event.end_time.strftime("%d %b %Y, %I:%M %p"),
            "duration_minutes": event.duration_minutes,
            "water_used_litres": event.water_used_litres,
            "trigger_type": event.trigger_type,
            "status": event.status,
            "reason": event.reason
        }
    }

@app.put("/api/irrigation/events/{event_id}")
def update_irrigation_event(
    event_id: int,
    req: schemas.IrrigationEventUpdateRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    farm_id = 1 if current_user.role == "admin" else (current_user.farms[0].id if current_user.farms else 1)
    event = db.query(models.IrrigationEvent).filter(models.IrrigationEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Irrigation event not found")
    if current_user.role != "admin" and event.farm_id != farm_id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this event")

    if req.zone_name is not None:
        event.zone_name = req.zone_name
    if req.duration_minutes is not None:
        event.duration_minutes = round(req.duration_minutes, 1)
    if req.water_used_litres is not None:
        event.water_used_litres = round(req.water_used_litres, 1)
    if req.trigger_type is not None:
        event.trigger_type = req.trigger_type
    if req.status is not None:
        event.status = req.status
    if req.reason is not None:
        event.reason = req.reason
    if req.start_time is not None:
        try:
            event.start_time = datetime.fromisoformat(req.start_time.replace("Z", "+00:00"))
        except Exception:
            pass

    db.commit()
    db.refresh(event)
    return {
        "success": True,
        "event": {
            "id": event.id,
            "zone_name": event.zone_name,
            "start_time": event.start_time.strftime("%d %b %Y, %I:%M %p"),
            "end_time": event.end_time.strftime("%d %b %Y, %I:%M %p") if event.end_time else "In Progress",
            "duration_minutes": event.duration_minutes,
            "water_used_litres": event.water_used_litres,
            "trigger_type": event.trigger_type,
            "status": event.status,
            "reason": event.reason
        }
    }

@app.delete("/api/irrigation/events/{event_id}")
def delete_irrigation_event(
    event_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    farm_id = 1 if current_user.role == "admin" else (current_user.farms[0].id if current_user.farms else 1)
    event = db.query(models.IrrigationEvent).filter(models.IrrigationEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Irrigation event not found")
    if current_user.role != "admin" and event.farm_id != farm_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this event")

    db.delete(event)
    db.commit()
    return {"success": True, "message": "Irrigation event deleted successfully", "event_id": event_id}


# ==========================================
# 4. HISTORY & ANALYTICS
# ==========================================

@app.get("/api/farm/readings/history")
def get_readings_history(
    range_filter: str = Query("7days", pattern="^(today|yesterday|7days|30days)$"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    farm_id = 1 if current_user.role == "admin" else current_user.farms[0].id
    now = datetime.utcnow()

    if range_filter == "today":
        since = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif range_filter == "yesterday":
        since = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    elif range_filter == "30days":
        since = now - timedelta(days=30)
    else:  # "7days"
        since = now - timedelta(days=7)

    readings = (
        db.query(models.SensorReading)
        .filter(models.SensorReading.farm_id == farm_id, models.SensorReading.timestamp >= since)
        .order_by(models.SensorReading.timestamp.asc())
        .all()
    )

    if not readings:
        return {"timestamps": [], "moisture": [], "ph": [], "npk": {}, "water": {}, "env": {}, "summary": {}}

    timestamps = [r.timestamp.strftime("%d %b %H:%M") for r in readings]
    moistures = [r.soil_moisture for r in readings]
    phs = [r.soil_ph for r in readings]
    temps = [r.temperature_c for r in readings]
    humidities = [r.humidity_pct for r in readings]
    lights = [r.light_lux for r in readings]
    tank_pcts = [r.tank_level_pct for r in readings]
    flows = [r.water_flow_lpm for r in readings]

    return {
        "filter": range_filter,
        "timestamps": timestamps,
        "soil_moisture": moistures,
        "soil_ph": phs,
        "nitrogen": [r.nitrogen for r in readings],
        "phosphorus": [r.phosphorus for r in readings],
        "potassium": [r.potassium for r in readings],
        "temperature_c": temps,
        "humidity_pct": humidities,
        "light_lux": lights,
        "tank_level_pct": tank_pcts,
        "water_flow_lpm": flows,
        "records": [
            {
                "timestamp": r.timestamp.strftime("%d %b %Y, %I:%M %p"),
                "soil_moisture": r.soil_moisture,
                "soil_ph": r.soil_ph,
                "nitrogen": r.nitrogen,
                "phosphorus": r.phosphorus,
                "potassium": r.potassium,
                "temperature_c": r.temperature_c,
                "humidity_pct": r.humidity_pct,
                "tank_level_pct": r.tank_level_pct
            } for r in reversed(readings[-6:])
        ],
        "stats": {
            "moisture": {
                "current": moistures[-1] if moistures else 0,
                "min": min(moistures) if moistures else 0,
                "max": max(moistures) if moistures else 0,
                "avg": round(sum(moistures) / len(moistures), 1) if moistures else 0,
                "trend": "rising" if len(moistures) > 2 and moistures[-1] > moistures[-2] else "falling"
            },
            "temperature": {
                "current": temps[-1] if temps else 0,
                "min": min(temps) if temps else 0,
                "max": max(temps) if temps else 0,
                "avg": round(sum(temps) / len(temps), 1) if temps else 0
            },
            "tank": {
                "current": tank_pcts[-1] if tank_pcts else 0,
                "min": min(tank_pcts) if tank_pcts else 0,
                "max": max(tank_pcts) if tank_pcts else 0,
                "avg": round(sum(tank_pcts) / len(tank_pcts), 1) if tank_pcts else 0
            }
        }
    }


# ==========================================
# 5. ALERTS & NOTIFICATIONS
# ==========================================

def translate_alert_to_kn(a):
    t_lower = (a.title or "").lower()
    m_lower = (a.message or "").lower()
    
    if "dry-run" in t_lower or "dry run" in t_lower or "flow meter" in m_lower:
        return {
            "title_kn": "ಡ್ರೈ-ರನ್ ರಕ್ಷಣಾ ಲಾಕ್ ಸಕ್ರಿಯಗೊಂಡಿದೆ (TRIPPED)",
            "message_kn": "ಮೋಟಾರ್ ಚಾಲನೆಯಲ್ಲಿದ್ದರೂ ನೀರಿನ ಹರಿವು 0.0 L/min ಎಂದು ಸಂವೇದಕ ಪತ್ತೆಮಾಡಿದೆ. ಇಂಪೆಲ್ಲರ್ ಸುಟ್ಟುಹೋಗುವುದನ್ನು ತಪ್ಪಿಸಲು ಮೋಟಾರ್ ತಕ್ಷಣ ಸ್ಥಗಿತಗೊಳಿಸಿ ಎಲ್ಲಾ ವಾಲ್ವ್‌ಗಳನ್ನು ಮುಚ್ಚಲಾಗಿದೆ.",
            "action_kn": "ಪಂಪ್ ಇನ್‌ಲೆಟ್, ಫುಟ್-ವಾಲ್ವ್ ಪ್ರೈಮಿಂಗ್, ಏರ್ ಲಾಕ್ ಅಥವಾ ಪೈಪ್ ಬ್ಲಾಕ್ ಆಗಿದೆಯೇ ಪರೀಕ್ಷಿಸಿ, ನಂತರ 'ಡ್ರೈ-ರನ್ ಲಾಕ್ ತೆರವುಗೊಳಿಸಿ' ಬಟನ್ ಒತ್ತಿರಿ."
        }
    elif "low tank" in t_lower or "tank level" in m_lower:
        return {
            "title_kn": "ತುರ್ತು ಸ್ಥಗಿತ: ನೀರಿನ ಟ್ಯಾಂಕ್ ಮಟ್ಟ ತೀರಾ ಕಡಿಮೆ",
            "message_kn": "ನೀರಿನ ಟ್ಯಾಂಕ್ ಮಟ್ಟ 15% ಕ್ಕಿಂತ ಕಡಿಮೆಯಾಗಿದೆ. ಮೋಟಾರ್ ರಕ್ಷಣೆಗಾಗಿ ಮತ್ತು ಡ್ರೈ-ರನ್ ಹಾನಿ ತಪ್ಪಿಸಲು ಪಂಪ್ ನಿಲ್ಲಿಸಲಾಗಿದೆ.",
            "action_kn": "ಮೋಟಾರ್ ಮರುಪ್ರಾರಂಭಿಸುವ ಮುನ್ನ ಟ್ಯಾಂಕ್‌ಗೆ ನೀರು ತುಂಬಿಸಿ ಅಥವಾ ಬದಲಿ ನೀರಿನ ಮೂಲವನ್ನು ಸಂಪರ್ಕಿಸಿ."
        }
    elif "koleroga" in t_lower or "fruit rot" in m_lower or "koleroga" in m_lower:
        return {
            "title_kn": "ಕೊಳೆರೋಗ (ಮಹಾಲಿ) ಹರಡುವ ಹೆಚ್ಚಿನ ಅಪಾಯದ ಮುನ್ಸೂಚನೆ",
            "message_kn": "ವಾತಾವರಣದಲ್ಲಿ ತೇವಾಂಶ 80% ಕ್ಕಿಂತ ಹೆಚ್ಚಿದೆ. ಫೈಟೋಫ್ತೋರಾ ಶಿಲೀಂಧ್ರ ರೋಗಾಣುಗಳು ಹರಡಲು ಇದು ಪೂರಕ ವಾತಾವರಣವಾಗಿದೆ.",
            "action_kn": "ಅಡಿಕೆ ಗೊನೆಗಳನ್ನು ಪರಿಶೀಲಿಸಿ. ಅಂಟು ಸಹಿತ 1% ಬೋರ್ಡೋ ದ್ರಾವಣವನ್ನು ತಕ್ಷಣ ಸಿಂಪಡಿಸಿ."
        }
    elif "ph" in t_lower or "acidic" in t_lower or "dolomite" in m_lower:
        return {
            "title_kn": "ಮಣ್ಣಿನ pH ಸ್ವಲ್ಪ ಆಮ್ಲೀಯವಾಗಿದೆ (6.15)",
            "message_kn": "pH ಮಟ್ಟವು ಸೂಕ್ತ 6.5 ಕ್ಕಿಂತ ಸ್ವಲ್ಪ ಕಡಿಮೆಯಾಗಿದೆ. ಮಲೆನಾಡಿನ ಕೆಂಪು ಲ್ಯಾಟರೈಟ್ ಮಣ್ಣಿಗೆ ಇದು ಸಾಮಾನ್ಯ ಲಕ್ಷಣ.",
            "action_kn": "ಮಳೆಗಾಲದ ನಂತರ ಕಳೆ ತೆಗೆದು ಪ್ರತಿ ಮರಕ್ಕೆ 300 ಗ್ರಾಂ ಡಾಲಮೈಟ್ ಪುಡಿ ಹಾಕಿ."
        }
    elif "heat" in t_lower or "temperature" in t_lower:
        return {
            "title_kn": "ಅಧಿಕ ತಾಪಮಾನದ ಮುನ್ಸೂಚನೆ",
            "message_kn": "ತಾಪಮಾನ 35°C ಮೀರಿದೆ. ಅಡಿಕೆ ಮರಗಳಿಗೆ ಶಾಖದ ಒತ್ತಡ ಉಂಟಾಗಬಹುದು.",
            "action_kn": "ಬಿಸಿಲಿನ ತಾಪ ಕಡಿಮೆ ಮಾಡಲು ಮಧ್ಯಾಹ್ನ ಮಣ್ಣಿಗೆ ಲಘು ಹನಿ ನೀರಾವರಿ ನೀಡಿ."
        }
    return {
        "title_kn": a.title,
        "message_kn": a.message,
        "action_kn": a.action_recommendation or "--"
    }

@app.get("/api/alerts")
def get_alerts(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    farm_id = 1 if current_user.role == "admin" else current_user.farms[0].id
    alerts = (
        db.query(models.Alert)
        .filter(models.Alert.farm_id == farm_id)
        .order_by(models.Alert.timestamp.desc())
        .limit(30)
        .all()
    )
    result = []
    for a in alerts:
        kn_data = translate_alert_to_kn(a)
        result.append({
            "id": a.id,
            "category": a.category,
            "severity": a.severity,
            "title": a.title,
            "title_kn": kn_data["title_kn"],
            "message": a.message,
            "message_kn": kn_data["message_kn"],
            "action_recommendation": a.action_recommendation,
            "action_recommendation_kn": kn_data["action_kn"],
            "is_resolved": a.is_resolved,
            "timestamp": a.timestamp.isoformat()
        })
    return result

@app.post("/api/alerts/{alert_id}/resolve")
def resolve_alert(
    alert_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    farm_id = 1 if current_user.role == "admin" else (current_user.farms[0].id if current_user.farms else 1)
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if current_user.role != "admin" and alert.farm_id != farm_id:
        raise HTTPException(status_code=403, detail="Not authorized to resolve this alert")

    alert.is_resolved = True
    db.commit()
    return {"success": True, "alert_id": alert_id}

@app.delete("/api/alerts/{alert_id}")
def delete_alert(
    alert_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    farm_id = 1 if current_user.role == "admin" else (current_user.farms[0].id if current_user.farms else 1)
    alert = db.query(models.Alert).filter(models.Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if current_user.role != "admin" and alert.farm_id != farm_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this alert")

    db.delete(alert)
    db.commit()
    return {"success": True, "message": "Alert deleted successfully", "alert_id": alert_id}


# ==========================================
# 6. ARECANUT DISEASE DETECTION
# ==========================================

@app.get("/api/disease/samples")
def get_disease_samples():
    return DiseaseClassifierService.get_sample_presets()

@app.post("/api/disease/detect")
def detect_disease(
    req: schemas.DiseaseScreenRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    farm_id = 1 if current_user.role == "admin" else current_user.farms[0].id
    result = DiseaseClassifierService.analyze_crop_image(
        organ=req.organ,
        sample_id=req.sample_id,
        custom_image_base64=req.custom_image_base64
    )

    # Save to history
    record = models.DiseaseDetection(
        farm_id=farm_id,
        organ=result["organ"],
        condition=result["condition_en"],
        confidence=result["confidence"],
        severity=result["severity"],
        symptoms=result["symptoms_en"],
        recommended_action=result["recommendation_en"],
        is_simulated=True,
        timestamp=datetime.utcnow()
    )
    db.add(record)
    db.commit()

    return result

@app.get("/api/disease/history")
def get_disease_history(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    farm_id = 1 if current_user.role == "admin" else current_user.farms[0].id
    history = (
        db.query(models.DiseaseDetection)
        .filter(models.DiseaseDetection.farm_id == farm_id)
        .order_by(models.DiseaseDetection.timestamp.desc())
        .limit(10)
        .all()
    )
    return [
        {
            "id": h.id,
            "organ": h.organ,
            "condition": h.condition,
            "confidence": h.confidence,
            "severity": h.severity,
            "symptoms": h.symptoms,
            "recommended_action": h.recommended_action,
            "timestamp": h.timestamp.isoformat()
        } for h in history
    ]


# ==========================================
# 7. AI FARM ADVISOR & CHATBOT
# ==========================================

@app.get("/api/advisor/recommendations")
def get_farm_recommendations(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    farm_id = 1 if current_user.role == "admin" else current_user.farms[0].id
    farm = db.query(models.Farm).filter(models.Farm.id == farm_id).first()
    reading = db.query(models.SensorReading).filter(models.SensorReading.farm_id == farm_id).order_by(models.SensorReading.timestamp.desc()).first()
    pump_state = db.query(models.PumpValveState).filter(models.PumpValveState.farm_id == farm_id).first()
    alerts = db.query(models.Alert).filter(models.Alert.farm_id == farm_id, models.Alert.is_resolved == False).all()

    return AIFarmAdvisor.generate_recommendations(farm, reading, pump_state, alerts)

@app.post("/api/advisor/chat", response_model=schemas.ChatResponse)
def chat_with_advisor(
    req: schemas.ChatRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    farm_id = 1 if current_user.role == "admin" else current_user.farms[0].id
    farm = db.query(models.Farm).filter(models.Farm.id == farm_id).first()
    reading = db.query(models.SensorReading).filter(models.SensorReading.farm_id == farm_id).order_by(models.SensorReading.timestamp.desc()).first()
    pump_state = db.query(models.PumpValveState).filter(models.PumpValveState.farm_id == farm_id).first()
    alerts = db.query(models.Alert).filter(models.Alert.farm_id == farm_id, models.Alert.is_resolved == False).all()

    res = AIFarmAdvisor.process_chatbot_query(
        user_message=req.message,
        farm=farm,
        reading=reading,
        pump_state=pump_state,
        alerts=alerts,
        lang=req.language
    )
    return res

@app.get("/api/advisor/groq-status")
def get_groq_status():
    from ai_advisor import get_groq_api_key
    key = get_groq_api_key()
    return {
        "is_configured": bool(key),
        "key_preview": (key[:6] + "..." + key[-4:]) if (key and len(key) > 10) else None,
        "model": "llama-3.3-70b-versatile",
        "provider": "Groq Cloud"
    }

@app.post("/api/advisor/groq-key")
def update_groq_key(data: dict):
    from ai_advisor import set_groq_api_key
    new_key = data.get("api_key", "").strip()
    success = set_groq_api_key(new_key)
    return {
        "success": success,
        "is_configured": bool(new_key),
        "message": "Groq API Key saved successfully and activated for Areca Farm AI Advisor!" if new_key else "Groq API key cleared.",
        "key_preview": (new_key[:6] + "..." + new_key[-4:]) if len(new_key) > 10 else None
    }

@app.post("/api/advisor/voice-transcribe")
async def transcribe_voice(
    audio: UploadFile = File(...),
    lang: str = Form("en")
):
    """
    Transcribe spoken voice using Groq Whisper API (whisper-large-v3-turbo).
    Works with audio recorded from any browser or device.
    """
    from ai_advisor import get_groq_api_key
    from groq import Groq

    key = get_groq_api_key()
    if not key:
        return {"transcript": "", "error": "Groq API key not configured", "success": False}

    try:
        content = await audio.read()
        if not content or len(content) < 100:
            return {"transcript": "", "error": "Audio stream too short", "success": False}

        client = Groq(api_key=key)
        filename = audio.filename or "recording.webm"
        if not filename.endswith((".webm", ".wav", ".mp3", ".m4a", ".ogg")):
            filename = "recording.webm"

        whisper_lang = "kn" if lang == "kn" else "en"

        try:
            transcription = client.audio.transcriptions.create(
                file=(filename, content),
                model="whisper-large-v3-turbo",
                language=whisper_lang,
                response_format="json"
            )
            transcript = transcription.text.strip() if hasattr(transcription, "text") else str(transcription).strip()
        except Exception:
            # Fallback without explicit language constraint or with whisper-large-v3
            transcription = client.audio.transcriptions.create(
                file=(filename, content),
                model="whisper-large-v3",
                response_format="json"
            )
            transcript = transcription.text.strip() if hasattr(transcription, "text") else str(transcription).strip()

        return {
            "transcript": transcript,
            "language": whisper_lang,
            "success": bool(transcript)
        }
    except Exception as e:
        print("Groq Whisper transcription exception:", e)
        return {"transcript": "", "error": str(e), "success": False}

# 8. OLED DISPLAY SIMULATOR & HARDWARE BRIDGE
# ==========================================

@app.get("/api/oled/data")
def get_oled_display_data(
    farm_id: int = 1,
    db: Session = Depends(get_db)
):
    """
    Formatted specifically for 128x64 monochrome OLED hardware rendering
    Line 1: Status & Mode
    Line 2: Moisture & Temp
    Line 3: Tank & Pump Status
    Line 4: Wi-Fi Signal & Alerts
    """
    reading = db.query(models.SensorReading).filter(models.SensorReading.farm_id == farm_id).order_by(models.SensorReading.timestamp.desc()).first()
    pump = db.query(models.PumpValveState).filter(models.PumpValveState.farm_id == farm_id).first()
    device = db.query(models.Device).filter(models.Device.farm_id == farm_id).first()

    return {
        "line1_header": "ARECA IOT GATEWAY v2.5",
        "line2_soil": f"SOIL:{reading.soil_moisture:.1f}% pH:{reading.soil_ph:.1f}" if reading else "SOIL: --",
        "line3_env": f"T:{reading.temperature_c:.1f}C H:{reading.humidity_pct:.0f}%" if reading else "ENV: --",
        "line4_tank": f"TANK:{reading.tank_level_pct:.0f}% PUMP:{pump.pump_status}" if (reading and pump) else "TANK: --",
        "line5_status": "TRIP: DRY RUN!" if (pump and pump.dry_run_tripped) else f"MODE:{pump.operating_mode} FLOW:{reading.water_flow_lpm:.0f}L" if (pump and reading) else "READY",
        "wifi_rssi": device.wifi_rssi if device else -55,
        "battery_pct": device.battery_pct if device else 94.0,
        "device_status": device.status if device else "ONLINE",
        "soil_moisture": reading.soil_moisture if reading else 56.4,
        "soil_ph": reading.soil_ph if reading else 6.2,
        "temperature_c": reading.temperature_c if reading else 28.5,
        "humidity_pct": reading.humidity_pct if reading else 72.0,
        "light_lux": reading.light_lux if reading else 38000.0,
        "nitrogen": reading.nitrogen if reading else 210.0,
        "phosphorus": reading.phosphorus if reading else 38.0,
        "potassium": reading.potassium if reading else 185.0,
        "tank_level_pct": reading.tank_level_pct if reading else 76.0,
        "water_flow_lpm": reading.water_flow_lpm if reading else 0.0,
        "pump_status": pump.pump_status if pump else "OFF",
        "operating_mode": pump.operating_mode if pump else "AUTO",
        "valve_1": pump.valve_1 if pump else "CLOSED",
        "valve_2": pump.valve_2 if pump else "CLOSED",
        "valve_3": pump.valve_3 if pump else "CLOSED",
        "dry_run_tripped": pump.dry_run_tripped if pump else False,
        "is_simulated": True
    }

@app.post("/api/telemetry/push")
def push_physical_telemetry(
    data: schemas.TelemetryPush,
    db: Session = Depends(get_db)
):
    """
    REST Endpoint for physical ESP32 gateway to push live telemetry.
    Switches system from simulated to actual sensor data!
    """
    # Find device
    device = db.query(models.Device).filter(models.Device.device_uid == data.device_uid).first()
    farm_id = device.farm_id if device else 1

    reading = models.SensorReading(
        farm_id=farm_id,
        timestamp=datetime.utcnow(),
        soil_moisture=data.soil_moisture,
        soil_ph=data.soil_ph,
        nitrogen=data.nitrogen,
        phosphorus=data.phosphorus,
        potassium=data.potassium,
        tank_level_pct=data.tank_level_pct,
        tank_litres=(data.tank_level_pct / 100.0) * 15000.0,
        water_flow_lpm=data.water_flow_lpm,
        temperature_c=data.temperature_c,
        humidity_pct=data.humidity_pct,
        light_lux=data.light_lux,
        rain_detected=data.rain_detected,
        is_simulated=False
    )
    db.add(reading)
    if device:
        device.last_seen = datetime.utcnow()
        device.status = "ONLINE"
    db.commit()

    return {"status": "success", "source": "PHYSICAL_ESP32_SENSOR"}


# ==========================================
# 9. SIMULATION SCENARIO CONTROLLER
# ==========================================

@app.post("/api/simulation/scenario")
def set_simulation_scenario(req: schemas.SimulationScenarioRequest):
    simulation_manager.set_scenario(req.scenario)
    return {"success": True, "active_scenario": req.scenario}


# ==========================================
# 10. ADMIN DASHBOARD & FARMER MANAGEMENT
# ==========================================

@app.get("/api/admin/overview")
def get_admin_overview(
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    total_farmers = db.query(models.User).filter(models.User.role == "farmer").count()
    farms = db.query(models.Farm).all()
    devices = db.query(models.Device).all()
    online_devices = sum(1 for d in devices if d.status == "ONLINE")
    
    pumps = db.query(models.PumpValveState).all()
    pumps_running = sum(1 for p in pumps if p.pump_status == "ON")
    dry_runs = sum(1 for p in pumps if p.dry_run_tripped)

    # Low water farms (< 25%)
    low_water_count = 0
    for f in farms:
        r = db.query(models.SensorReading).filter(models.SensorReading.farm_id == f.id).order_by(models.SensorReading.timestamp.desc()).first()
        if r and r.tank_level_pct < 25.0:
            low_water_count += 1

    active_alerts = db.query(models.Alert).filter(models.Alert.is_resolved == False).all()

    return {
        "total_farmers": total_farmers,
        "total_farms": len(farms),
        "total_devices": len(devices),
        "online_devices": online_devices,
        "offline_devices": len(devices) - online_devices,
        "pumps_running": pumps_running,
        "pumps_dry_run_fault": dry_runs,
        "low_water_farms": low_water_count,
        "active_alerts_count": len(active_alerts),
        "farms_summary": [
            {
                "id": f.id,
                "name": f.name,
                "farmer_name": f.owner.name,
                "phone": f.owner.phone,
                "location": f.location,
                "area_acres": f.area_acres,
                "tree_count": f.tree_count,
                "zones_count": len(f.zones),
                "created_at": f.created_at.strftime("%Y-%m-%d")
            } for f in farms
        ]
    }

@app.get("/api/admin/farmers")
def list_farmers(
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    farmers = db.query(models.User).filter(models.User.role == "farmer").all()
    res = []
    for u in farmers:
        farm = u.farms[0] if u.farms else None
        reading = db.query(models.SensorReading).filter(models.SensorReading.farm_id == farm.id).order_by(models.SensorReading.timestamp.desc()).first() if farm else None
        pump = db.query(models.PumpValveState).filter(models.PumpValveState.farm_id == farm.id).first() if farm else None
        res.append({
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "phone": u.phone,
            "created_at": u.created_at.strftime("%Y-%m-%d"),
            "farm": {
                "id": farm.id if farm else None,
                "name": farm.name if farm else "",
                "location": farm.location if farm else "",
                "area_acres": farm.area_acres if farm else 0,
                "tree_count": farm.tree_count if farm else 0,
                "soil_type": farm.soil_type if farm else "",
                "irrigation_type": farm.irrigation_type if farm else "",
                "tank_capacity_litres": farm.tank_capacity_litres if farm else 0,
                "soil_moisture": reading.soil_moisture if reading else None,
                "tank_level_pct": reading.tank_level_pct if reading else None,
                "pump_status": pump.pump_status if pump else "OFF"
            } if farm else None
        })
    return res

@app.post("/api/admin/farmers")
def create_farmer(
    req: schemas.FarmerCreateRequest,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    # Check phone uniqueness
    existing = db.query(models.User).filter(models.User.phone == req.phone).first()
    if existing:
        raise HTTPException(status_code=400, detail="Farmer with this phone number already exists")

    # Create User
    new_farmer = models.User(
        role="farmer",
        name=req.name,
        email=req.email or f"{req.phone}@areca.farm",
        phone=req.phone,
        hashed_password=get_password_hash(req.password),
        language_pref="kn"
    )
    db.add(new_farmer)
    db.commit()
    db.refresh(new_farmer)

    # Create Farm
    new_farm = models.Farm(
        owner_id=new_farmer.id,
        name=req.farm_name,
        location=req.location,
        area_acres=req.area_acres,
        tree_count=req.tree_count,
        soil_type=req.soil_type,
        irrigation_type=req.irrigation_type,
        tank_capacity_litres=req.tank_capacity_litres
    )
    db.add(new_farm)
    db.commit()
    db.refresh(new_farm)

    # Add Default Zones
    z1 = models.IrrigationZone(farm_id=new_farm.id, name="Zone 1 - Main South Block", valve_index=1, moisture_threshold_min=42.0)
    z2 = models.IrrigationZone(farm_id=new_farm.id, name="Zone 2 - North Ridge", valve_index=2, moisture_threshold_min=45.0)
    db.add_all([z1, z2])

    # Add Pump State
    pump = models.PumpValveState(farm_id=new_farm.id, pump_status="OFF", operating_mode="AUTO")
    db.add(pump)

    # Add Device
    dev = models.Device(
        farm_id=new_farm.id,
        device_uid=f"ESP32-ARECA-{new_farm.id:03d}",
        name="Field IoT Station",
        status="ONLINE"
    )
    db.add(dev)

    # Add Settings
    sett = models.FarmSettings(farm_id=new_farm.id, auto_irrigation=True)
    db.add(sett)

    # Add initial sensor reading
    r = models.SensorReading(
        farm_id=new_farm.id,
        timestamp=datetime.utcnow(),
        soil_moisture=55.0,
        soil_ph=6.2,
        nitrogen=200.0,
        phosphorus=35.0,
        potassium=175.0,
        soil_temp=26.0,
        tank_level_pct=80.0,
        tank_litres=req.tank_capacity_litres * 0.8,
        water_flow_lpm=0.0,
        temperature_c=28.0,
        humidity_pct=72.0,
        light_lux=40000.0,
        is_simulated=True
    )
    db.add(r)
    db.commit()

    return {"success": True, "farmer_id": new_farmer.id, "farm_id": new_farm.id}

@app.put("/api/admin/farmers/{farmer_id}")
def update_farmer(
    farmer_id: int,
    req: schemas.FarmerUpdateRequest,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    farmer = db.query(models.User).filter(models.User.id == farmer_id, models.User.role == "farmer").first()
    if not farmer:
        raise HTTPException(status_code=404, detail="Farmer not found")

    if req.name: farmer.name = req.name
    if req.phone: farmer.phone = req.phone
    if req.email: farmer.email = req.email
    if req.language_pref: farmer.language_pref = req.language_pref

    farm = farmer.farms[0] if farmer.farms else None
    if farm:
        if req.farm_name: farm.name = req.farm_name
        if req.location: farm.location = req.location
        if req.area_acres is not None: farm.area_acres = req.area_acres
        if req.tree_count is not None: farm.tree_count = req.tree_count
        if req.soil_type: farm.soil_type = req.soil_type
        if req.irrigation_type: farm.irrigation_type = req.irrigation_type
        if req.tank_capacity_litres is not None: farm.tank_capacity_litres = req.tank_capacity_litres

    db.commit()
    return {"success": True, "message": "Farmer and farm details updated successfully"}

@app.delete("/api/admin/farmers/{farmer_id}")
def delete_farmer(
    farmer_id: int,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    farmer = db.query(models.User).filter(models.User.id == farmer_id, models.User.role == "farmer").first()
    if not farmer:
        raise HTTPException(status_code=404, detail="Farmer not found")

    db.delete(farmer)
    db.commit()
    return {"success": True, "message": "Farmer and associated farm data deleted"}

@app.put("/api/admin/farms/{farm_id}/thresholds")
def update_thresholds(
    farm_id: int,
    req: schemas.ThresholdSettingsUpdate,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    sett = db.query(models.FarmSettings).filter(models.FarmSettings.farm_id == farm_id).first()
    if not sett:
        sett = models.FarmSettings(farm_id=farm_id)
        db.add(sett)

    if req.moisture_min is not None: sett.default_moisture_min = req.moisture_min
    if req.moisture_target is not None: sett.default_moisture_target = req.moisture_target
    if req.tank_critical_cutoff_pct is not None: sett.tank_critical_cutoff_pct = req.tank_critical_cutoff_pct
    if req.dry_run_timeout_seconds is not None: sett.dry_run_timeout_seconds = req.dry_run_timeout_seconds
    if req.auto_irrigation is not None: sett.auto_irrigation = req.auto_irrigation

    db.commit()
    return {"success": True, "message": "Thresholds updated successfully"}


# ==========================================
# 11. WEBSOCKET REAL-TIME STREAM
# ==========================================

@app.websocket("/ws/telemetry")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive; can accept client control pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)


# ==========================================
# 12. TEXT-TO-SPEECH (TTS) FOR KANNADA & ENGLISH
# ==========================================

# Persistent disk and memory cache for ultra-fast TTS
TTS_CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".tts_cache")
os.makedirs(TTS_CACHE_DIR, exist_ok=True)
_tts_cache = {}

# Dedicated HTTP Session with connection pooling to eliminate TCP/SSL handshake latency
_tts_session = requests.Session()
_tts_adapter = requests.adapters.HTTPAdapter(pool_connections=20, pool_maxsize=20, max_retries=2)
_tts_session.mount("https://", _tts_adapter)
_tts_session.mount("http://", _tts_adapter)

@app.get("/api/tts")
@app.post("/api/tts")
def stream_tts(
    text: str = Query(..., description="Text to speak in Kannada or English"),
    lang: str = Query("kn", description="Target language code (kn or en)")
):
    """
    High-fidelity Text-To-Speech streaming authentic Google female voice audio.
    Guarantees 100% identical, natural Kannada voice playback across localhost and installed Desktop PWA.
    Optimized for high-speed response with persistent connection pooling and multi-tier caching.
    """
    target_lang = "kn" if lang.lower().startswith("kn") else "en"
    cache_key = hashlib.md5(f"{target_lang}:{text.strip()}".encode("utf-8")).hexdigest()
    cache_file = os.path.join(TTS_CACHE_DIR, f"{cache_key}.mp3")

    # 1. Check in-memory RAM cache
    if cache_key in _tts_cache:
        audio_bytes = _tts_cache[cache_key]
        return Response(
            content=audio_bytes,
            media_type="audio/mpeg",
            headers={
                "Cache-Control": "public, max-age=86400",
                "Content-Length": str(len(audio_bytes)),
                "Accept-Ranges": "bytes"
            }
        )

    # 2. Check disk cache
    if os.path.exists(cache_file):
        try:
            with open(cache_file, "rb") as f:
                audio_bytes = f.read()
            if audio_bytes:
                _tts_cache[cache_key] = audio_bytes
                return Response(
                    content=audio_bytes,
                    media_type="audio/mpeg",
                    headers={
                        "Cache-Control": "public, max-age=86400",
                        "Content-Length": str(len(audio_bytes)),
                        "Accept-Ranges": "bytes"
                    }
                )
        except Exception:
            pass

    # Clean text: strip HTML tags, Markdown formatting, emojis, special characters
    clean = re.sub(r'<[^>]+>', ' ', text)
    clean = re.sub(r'[*_#`~]', '', clean)
    clean = re.sub(r'[^\w\s.,?!;:।%\-–—\u0C80-\u0CFF]', ' ', clean)
    clean = ' '.join(clean.split())
    if not clean:
        clean = "ನಮಸ್ಕಾರ" if target_lang == "kn" else "Hello"

    # Split into sentence-aware chunks up to 160 chars
    parts = re.split(r'([.?!;\n।]+|\s*,\s*)', clean)
    chunks = []
    curr = ""
    for p in parts:
        if not p:
            continue
        if len(curr) + len(p) <= 160:
            curr += p
        else:
            if curr.strip():
                chunks.append(curr.strip())
            curr = p
    if curr.strip():
        chunks.append(curr.strip())

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://translate.google.com/"
    }

    valid_chunks = [c.strip() for c in chunks if c.strip()]
    if not valid_chunks:
        valid_chunks = ["ನಮಸ್ಕಾರ" if target_lang == "kn" else "Hello"]

    def _fetch_single_chunk(item):
        idx, chunk_text = item
        try:
            q = urllib.parse.quote(chunk_text)
            url = f"https://translate.google.com/translate_tts?ie=UTF-8&tl={target_lang}&client=tw-ob&q={q}"
            resp = _tts_session.get(url, headers=headers, timeout=6)
            if resp.status_code == 200:
                return idx, resp.content
        except Exception as e:
            print(f"[TTS] Warning fetching chunk: {e}")
        return idx, b""

    from concurrent.futures import ThreadPoolExecutor
    workers = min(len(valid_chunks), 6)
    with ThreadPoolExecutor(max_workers=workers) as executor:
        chunk_results = list(executor.map(_fetch_single_chunk, enumerate(valid_chunks)))

    chunk_results.sort(key=lambda x: x[0])
    audio_bytes = b"".join(r[1] for r in chunk_results)

    if not audio_bytes:
        raise HTTPException(status_code=502, detail="TTS service temporarily unavailable")

    _tts_cache[cache_key] = audio_bytes
    try:
        with open(cache_file, "wb") as f:
            f.write(audio_bytes)
    except Exception:
        pass

    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "public, max-age=86400",
            "Content-Length": str(len(audio_bytes)),
            "Accept-Ranges": "bytes"
        }
    )


# Mount Static Frontend
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
