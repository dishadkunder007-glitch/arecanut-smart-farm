import asyncio
import random
from datetime import datetime
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
import models
from decision_engine import SmartIrrigationEngine

class FarmSimulationManager:
    """
    Realistic IoT simulation engine for Arecanut farms.
    Simulates diurnal temperature/humidity curves, soil moisture depletion,
    drip irrigation water dynamics, flow meters, and safety faults.
    """
    def __init__(self):
        self.scenario = "normal"
        self.active_physical_devices = set()
        self.is_running = False
        self.subscribers = set()  # WebSocket connections

    def set_scenario(self, scenario_name: str):
        self.scenario = scenario_name

    def tick_simulation(self, db: Session, farm_id: int) -> models.SensorReading:
        farm = db.query(models.Farm).filter(models.Farm.id == farm_id).first()
        if not farm:
            return None

        pump_state = db.query(models.PumpValveState).filter(models.PumpValveState.farm_id == farm_id).first()
        if not pump_state:
            pump_state = models.PumpValveState(farm_id=farm_id, pump_status="OFF", operating_mode="AUTO")
            db.add(pump_state)
            db.commit()

        # Get latest reading or initialize baseline
        latest = (
            db.query(models.SensorReading)
            .filter(models.SensorReading.farm_id == farm_id)
            .order_by(models.SensorReading.timestamp.desc())
            .first()
        )

        now = datetime.utcnow()

        if not latest:
            # Seed initial values
            moisture = 56.0
            ph = 6.2
            n = 210.0
            p = 38.0
            k = 185.0
            tank_pct = 76.0
            tank_litres = 11400.0
            temp_c = 28.5
            humidity = 72.0
            light_lux = 38000.0
            flow_lpm = 0.0
        else:
            moisture = latest.soil_moisture
            ph = latest.soil_ph
            n = latest.nitrogen
            p = latest.phosphorus
            k = latest.potassium
            tank_pct = latest.tank_level_pct
            tank_litres = latest.tank_litres
            temp_c = latest.temperature_c
            humidity = latest.humidity_pct
            light_lux = latest.light_lux
            flow_lpm = latest.water_flow_lpm

        # Apply Scenario Overrides if specified
        if self.scenario == "dry_run":
            pump_state.pump_status = "ON"
            flow_lpm = 0.0  # Zero flow while pump running -> triggers dry-run safety
        elif self.scenario == "low_water":
            tank_pct = max(12.0, tank_pct - 2.0)
            tank_litres = (tank_pct / 100.0) * (farm.tank_capacity_litres or 15000.0)
            flow_lpm = 0.0
        elif self.scenario == "low_moisture":
            moisture = max(28.0, moisture - 2.5)
        elif self.scenario == "acidic_soil":
            ph = 4.85
        elif self.scenario == "high_heat":
            temp_c = 36.5 + random.uniform(-0.5, 0.5)
            humidity = 42.0 + random.uniform(-2.0, 2.0)
            light_lux = 78000.0
        else:  # "normal"
            # Natural micro-variations
            temp_c = round(28.0 + 3.0 * random.uniform(-0.5, 0.5), 1)
            humidity = round(70.0 + 5.0 * random.uniform(-0.5, 0.5), 1)
            light_lux = round(45000.0 + 5000.0 * random.uniform(-0.5, 0.5), 0)
            ph = round(6.2 + random.uniform(-0.05, 0.05), 2)
            n = round(210.0 + random.uniform(-2.0, 2.0), 1)
            p = round(38.0 + random.uniform(-0.8, 0.8), 1)
            k = round(185.0 + random.uniform(-1.5, 1.5), 1)

            # Irrigation Physics
            if pump_state.pump_status == "ON" and not pump_state.dry_run_tripped:
                # Any valve open?
                valves_open = (pump_state.valve_1 == "OPEN" or pump_state.valve_2 == "OPEN" or pump_state.valve_3 == "OPEN")
                if valves_open:
                    flow_lpm = round(44.0 + random.uniform(-2.0, 3.0), 1)
                    # Moisture rises
                    moisture = min(85.0, round(moisture + random.uniform(0.3, 0.7), 1))
                    # Tank depletes
                    water_drawn = flow_lpm * (3.0 / 60.0) # litres drawn in 3-sec step
                    tank_litres = max(0.0, round(tank_litres - water_drawn, 1))
                    tank_pct = round((tank_litres / (farm.tank_capacity_litres or 15000.0)) * 100.0, 1)
                else:
                    # Pump ON but all valves closed -> pressure build up / minimal flow
                    flow_lpm = 0.5
            else:
                flow_lpm = 0.0
                # Evapotranspiration gradual decline
                moisture = max(24.0, round(moisture - random.uniform(0.02, 0.08), 1))
                # Natural slow rainwater or recharge
                if tank_pct < 40.0 and random.random() < 0.15:
                    tank_pct = min(100.0, tank_pct + 1.0)
                    tank_litres = (tank_pct / 100.0) * (farm.tank_capacity_litres or 15000.0)

        # Create new reading record
        new_reading = models.SensorReading(
            farm_id=farm_id,
            timestamp=now,
            soil_moisture=round(moisture, 1),
            soil_ph=round(ph, 2),
            nitrogen=round(n, 1),
            phosphorus=round(p, 1),
            potassium=round(k, 1),
            soil_temp=round(temp_c - 2.0, 1),
            tank_level_pct=round(tank_pct, 1),
            tank_litres=round(tank_litres, 1),
            water_flow_lpm=round(flow_lpm, 1),
            temperature_c=round(temp_c, 1),
            humidity_pct=round(humidity, 1),
            light_lux=round(light_lux, 0),
            rain_detected=False,
            is_simulated=True
        )
        db.add(new_reading)
        db.commit()
        db.refresh(new_reading)

        # Run Safety & Protection Engine
        SmartIrrigationEngine.check_and_enforce_safety(db, farm, new_reading, pump_state)

        # Run Auto Irrigation Decision if mode is AUTO
        if pump_state.operating_mode == "AUTO" and not pump_state.dry_run_tripped:
            decision = SmartIrrigationEngine.evaluate_irrigation_decision(db, farm, new_reading, pump_state)
            if decision["decision"] == "REQUIRED" and pump_state.pump_status == "OFF":
                # Automatically turn on pump and target valve
                pump_state.pump_status = "ON"
                valve_idx = decision.get("valve_index", 1)
                if valve_idx == 1:
                    pump_state.valve_1 = "OPEN"
                elif valve_idx == 2:
                    pump_state.valve_2 = "OPEN"
                elif valve_idx == 3:
                    pump_state.valve_3 = "OPEN"
                pump_state.last_action_by = "DECISION_ENGINE_AUTO"
                pump_state.last_updated = now

                # Record irrigation event start
                event = models.IrrigationEvent(
                    farm_id=farm_id,
                    zone_name=decision.get("recommended_zone", "Zone 1 - Main South Block"),
                    start_time=now,
                    trigger_type="Smart Irrigation Engine",
                    status="RUNNING",
                    reason=decision["reason_en"]
                )
                db.add(event)
                db.commit()

            elif decision["decision"] != "REQUIRED" and pump_state.pump_status == "ON" and pump_state.last_action_by.startswith("DECISION"):
                # Satisfied target moisture, turn off
                if new_reading.soil_moisture >= 68.0:
                    pump_state.pump_status = "OFF"
                    pump_state.valve_1 = "CLOSED"
                    pump_state.valve_2 = "CLOSED"
                    pump_state.valve_3 = "CLOSED"
                    pump_state.last_action_by = "DECISION_ENGINE_AUTO_OFF"
                    pump_state.last_updated = now
                    db.commit()

        return new_reading

simulation_manager = FarmSimulationManager()
