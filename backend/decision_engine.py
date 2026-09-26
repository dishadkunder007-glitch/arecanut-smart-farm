from datetime import datetime
from typing import Dict, Any, Tuple
from sqlalchemy.orm import Session
import models

class SmartIrrigationEngine:
    """
    Evaluates real-time farm sensor readings against agronomic rules for Arecanut palms,
    manages automated pump/valve control decisions, and enforces safety protection.
    """

    @staticmethod
    def evaluate_farm_status(reading: models.SensorReading, pump_state: models.PumpValveState, alerts_count: int) -> Tuple[str, str, str, str]:
        """
        Calculates overall farm status:
        🟢 Healthy
        🟡 Attention Required
        🔴 Critical
        Returns (status_label, color_code, reason_en, reason_kn)
        """
        if not reading:
            return ("Healthy", "🟢", "System initialized and awaiting readings.", "ವ್ಯವಸ್ಥೆ ಸಿದ್ಧವಾಗಿದೆ, ಸಂವೇದಕ ಮಾಹಿತಿಗಾಗಿ ಕಾಯಲಾಗುತ್ತಿದೆ.")

        # Critical triggers
        if pump_state and (pump_state.dry_run_tripped or pump_state.emergency_lockout):
            return (
                "Critical", "🔴",
                "Emergency lockout: Pump dry-run fault detected! Immediate attention required.",
                "ತುರ್ತು ಲಾಕ್‌ಔಟ್: ಪಂಪ್ ಡ್ರೈ-ರನ್ ದೋಷ ಪತ್ತೆಯಾಗಿದೆ! ತಕ್ಷಣ ಗಮನ ಹರಿಸಿ."
            )
        if reading.tank_level_pct < 18.0:
            return (
                "Critical", "🔴",
                f"Water storage critically low ({reading.tank_level_pct:.1f}%). Pumps locked out.",
                f"ನೀರಿನ ಸಂಗ್ರಹ ತೀರಾ ಕಡಿಮೆಯಾಗಿದೆ ({reading.tank_level_pct:.1f}%). ಪಂಪ್ ಲಾಕ್ ಆಗಿದೆ."
            )
        if reading.soil_moisture < 28.0:
            return (
                "Critical", "🔴",
                f"Severe soil drought stress ({reading.soil_moisture:.1f}%). Crop wilting hazard.",
                f"ತೀವ್ರ ಮಣ್ಣಿನ ತೇವಾಂಶ ಕೊರತೆ ({reading.soil_moisture:.1f}%). ಅಡಿಕೆ ಮರಗಳು ಬಾಡುವ ಅಪಾಯವಿದೆ."
            )
        if reading.soil_ph < 4.8 or reading.soil_ph > 8.0:
            return (
                "Critical", "🔴",
                f"Severe soil pH abnormality ({reading.soil_ph:.1f}). Nutrient uptake blocked.",
                f"ಮಣ್ಣಿನ pH ಅಸಹಜವಾಗಿದೆ ({reading.soil_ph:.1f}). ಬೇರುಗಳು ಪೋಷಕಾಂಶ ಹೀರಿಕೊಳ್ಳಲು ಸಾಧ್ಯವಾಗುತ್ತಿಲ್ಲ."
            )

        # Warning triggers
        warnings_en = []
        warnings_kn = []
        if reading.soil_moisture < 40.0:
            warnings_en.append(f"Low soil moisture ({reading.soil_moisture:.1f}%)")
            warnings_kn.append(f"ಕಡಿಮೆ ಮಣ್ಣಿನ ತೇವಾಂಶ ({reading.soil_moisture:.1f}%)")
        if reading.tank_level_pct < 35.0:
            warnings_en.append(f"Low tank water ({reading.tank_level_pct:.1f}%)")
            warnings_kn.append(f"ಟ್ಯಾಂಕ್‌ನಲ್ಲಿ ಕಡಿಮೆ ನೀರು ({reading.tank_level_pct:.1f}%)")
        if reading.soil_ph < 5.5 or reading.soil_ph > 7.5:
            warnings_en.append(f"Suboptimal pH ({reading.soil_ph:.1f})")
            warnings_kn.append(f"ಸೂಕ್ತವಲ್ಲದ pH ({reading.soil_ph:.1f})")
        if reading.nitrogen < 180.0 or reading.potassium < 140.0:
            warnings_en.append("Nutrient deficiency detected")
            warnings_kn.append("ಪೋಷಕಾಂಶಗಳ ಕೊರತೆ ಪತ್ತೆಯಾಗಿದೆ")
        if reading.temperature_c > 35.5:
            warnings_en.append(f"Heat stress condition ({reading.temperature_c:.1f}°C)")
            warnings_kn.append(f"ಹೆಚ್ಚು ಶಾಖ / ತಾಪಮಾನ ({reading.temperature_c:.1f}°C)")
        if alerts_count > 0:
            warnings_en.append(f"{alerts_count} active alert(s)")
            warnings_kn.append(f"{alerts_count} ಸಕ್ರಿಯ ಎಚ್ಚರಿಕೆಗಳು")

        if warnings_en:
            return ("Attention Required", "🟡", "; ".join(warnings_en[:2]) + ".", "; ".join(warnings_kn[:2]) + ".")

        return ("Healthy", "🟢", "Optimal soil moisture, water reserves, and micro-climate parameters.", "ಮಣ್ಣಿನ ತೇವಾಂಶ, ನೀರಿನ ಸಂಗ್ರಹ ಮತ್ತು ಹವಾಮಾನ ಪರಿಸ್ಥಿತಿಗಳು ಅತ್ಯುತ್ತಮವಾಗಿವೆ.")

    @staticmethod
    def evaluate_irrigation_decision(
        db: Session,
        farm: models.Farm,
        reading: models.SensorReading,
        pump_state: models.PumpValveState
    ) -> Dict[str, Any]:
        """
        Decides whether irrigation is:
        - "REQUIRED"
        - "NOT_REQUIRED"
        - "DELAYED_RESTRICTED"
        Provides clear, farmer-friendly rationale.
        """
        settings = farm.settings
        tank_critical_pct = settings.tank_critical_cutoff_pct if settings else 15.0
        
        # Check Safety / Lockout constraints first
        if pump_state and pump_state.dry_run_tripped:
            return {
                "decision": "DELAYED_RESTRICTED",
                "badge": "🔴 Restricted",
                "badge_en": "🔴 Restricted",
                "badge_kn": "🔴 ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ",
                "recommended_zone": None,
                "reason_en": "Irrigation is RESTRICTED: Pump dry-run sensor tripped! Flow was absent while pump was energized.",
                "reason_kn": "ನೀರಾವರಿ ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ: ಪಂಪ್ ಡ್ರೈ-ರನ್ ದೋಷ! ನೀರಿನ ಹರಿವು ಇಲ್ಲದೆ ಪಂಪ್ ಚಾಲನೆಯಲ್ಲಿದೆ.",
                "action": "Inspect inlet pipe, prime the pump, and reset dry-run lockout.",
                "action_en": "Inspect inlet pipe, prime the pump, and reset dry-run lockout.",
                "action_kn": "ಇನ್‌ಲೆಟ್ ಪೈಪ್ ಪರಿಶೀಲಿಸಿ, ನೀರು ತುಂಬಿಸಿ ಡ್ರೈ-ರನ್ ಲಾಕ್ ತೆರವುಗೊಳಿಸಿ."
            }

        if reading.tank_level_pct <= tank_critical_pct:
            return {
                "decision": "DELAYED_RESTRICTED",
                "badge": "🔴 Restricted",
                "badge_en": "🔴 Restricted",
                "badge_kn": "🔴 ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ",
                "recommended_zone": None,
                "reason_en": f"Irrigation RESTRICTED: Storage tank level ({reading.tank_level_pct:.1f}%) is below critical threshold ({tank_critical_pct}%).",
                "reason_kn": f"ನೀರಾವರಿ ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ: ನೀರಿನ ಟ್ಯಾಂಕ್ ಮಟ್ಟ ({reading.tank_level_pct:.1f}%) ತೀರಾ ಕಡಿಮೆಯಾಗಿದೆ.",
                "action": "Wait for recharge or switch to auxiliary groundwater borewell.",
                "action_en": "Wait for recharge or switch to auxiliary groundwater borewell.",
                "action_kn": "ಟ್ಯಾಂಕ್ ತುಂಬುವವರೆಗೆ ಕಾಯಿರಿ ಅಥವಾ ಬೋರ್‌ವೆಲ್ ನೀರನ್ನು ಬಳಸಿ."
            }

        # Check Manual Override Mode
        if pump_state and pump_state.operating_mode == "MANUAL":
            if pump_state.pump_status == "ON":
                return {
                    "decision": "MANUAL_ACTIVE",
                    "badge": "⚡ Manual Override Active",
                    "badge_en": "⚡ Manual Override Active",
                    "badge_kn": "⚡ ಮ್ಯಾನುಯಲ್ ನಿಯಂತ್ರಣ ಸಕ್ರಿಯ (ಚಾಲು)",
                    "recommended_zone": None,
                    "reason_en": f"MANUAL OVERRIDE IS ACTIVE: Pump is actively irrigating at {reading.water_flow_lpm:.1f} L/min under direct farmer control. Automated AI schedules are bypassed.",
                    "reason_kn": f"ಮ್ಯಾನುಯಲ್ ನಿಯಂತ್ರಣ ಸಕ್ರಿಯವಾಗಿದೆ: ರೈತರ ನೇರ ನಿಯಂತ್ರಣದಲ್ಲಿ ನೀರು ಹರಿಯುತ್ತಿದೆ ({reading.water_flow_lpm:.1f} L/min). ಸ್ವಯಂಚಾಲಿತ AI ವೇಳಾಪಟ್ಟಿಯನ್ನು ಸ್ಥಗಿತಗೊಳಿಸಲಾಗಿದೆ.",
                    "action": "Tap 'STOP PUMP' when finished, or toggle solenoid valves for individual blocks.",
                    "action_en": "Tap 'STOP PUMP' when finished, or toggle solenoid valves for individual blocks.",
                    "action_kn": "ನೀರಾವರಿ ಪೂರ್ಣಗೊಂಡಾಗ 'ಮೋಟಾರ್ ಆಫ್ ಮಾಡಿ' ಒತ್ತಿ, ಅಥವಾ ವಾಲ್ವ್‌ಗಳನ್ನು ನಿಯಂತ್ರಿಸಿ."
                }
            else:
                return {
                    "decision": "MANUAL_STANDBY",
                    "badge": "⚙️ Manual Mode (Standby)",
                    "badge_en": "⚙️ Manual Mode (Standby)",
                    "badge_kn": "⚙️ ಮ್ಯಾನುಯಲ್ ಮೋಡ್ (ಸ್ಟ್ಯಾಂಡ್‌ಬೈ)",
                    "recommended_zone": None,
                    "reason_en": "MANUAL OVERRIDE ENGAGED: Automatic AI pump cycles are suspended. You have direct manual control over the pump and individual solenoid valves.",
                    "reason_kn": "ಮ್ಯಾನುಯಲ್ ನಿಯಂತ್ರಣ ಸಕ್ರಿಯವಾಗಿದೆ: ಸ್ವಯಂಚಾಲಿತ AI ಚಕ್ರಗಳನ್ನು ತಾತ್ಕಾಲಿಕವಾಗಿ ಸ್ಥಗಿತಗೊಳಿಸಲಾಗಿದೆ. ಮೋಟಾರ್ ಮತ್ತು ವಾಲ್ವ್‌ಗಳು ನಿಮ್ಮ ನೇರ ನಿಯಂತ್ರಣದಲ್ಲಿವೆ.",
                    "action": "Tap 'START PUMP' to begin watering, or switch back to AUTO mode for AI control.",
                    "action_en": "Tap 'START PUMP' to begin watering, or switch back to AUTO mode for AI control.",
                    "action_kn": "ನೀರಾವರಿ ಪ್ರಾರಂಭಿಸಲು 'ಮೋಟಾರ್ ಚಾಲು ಮಾಡಿ' ಒತ್ತಿ, ಅಥವಾ AI ನಿಯಂತ್ರಣಕ್ಕೆ AUTO ಗೆ ಬದಲಾಯಿಸಿ."
                }

        # Check rain or extreme environmental factors
        if reading.rain_detected:
            return {
                "decision": "NOT_REQUIRED",
                "badge": "🟢 Not Required",
                "badge_en": "🟢 Not Required",
                "badge_kn": "🟢 ಅಗತ್ಯವಿಲ್ಲ",
                "recommended_zone": None,
                "reason_en": "Irrigation NOT REQUIRED: Rainfall detected on farm sensors. Conserving water.",
                "reason_kn": "ನೀರಾವರಿ ಅಗತ್ಯವಿಲ್ಲ: ತೋಟದಲ್ಲಿ ಮಳೆ ಪತ್ತೆಯಾಗಿದೆ. ನೀರನ್ನು ಸಂರಕ್ಷಿಸಲಾಗುತ್ತಿದೆ.",
                "action": "Allow natural rainwater infiltration; verify drainage trenches.",
                "action_en": "Allow natural rainwater infiltration; verify drainage trenches.",
                "action_kn": "ನೈಸರ್ಗಿಕ ಮಳೆನೀರು ಇಂಗಲು ಬಿಡಿ; ಚರಂಡಿಗಳನ್ನು ಪರಿಶೀಲಿಸಿ."
            }

        # Check Zone needs
        zones = farm.zones
        needy_zones = []
        for z in zones:
            min_thresh = z.moisture_threshold_min or 40.0
            if reading.soil_moisture < min_thresh:
                needy_zones.append(z)

        if needy_zones:
            target_zone = needy_zones[0]
            heat_note_en = " High evapotranspiration detected." if reading.temperature_c > 32.0 else ""
            heat_note_kn = " ಹೆಚ್ಚಿನ ತಾಪಮಾನದಿಂದ ಆವಿಯಾಗುವಿಕೆ ಹೆಚ್ಚಿದೆ." if reading.temperature_c > 32.0 else ""
            return {
                "decision": "REQUIRED",
                "badge": "💧 Irrigation Required",
                "badge_en": "💧 Irrigation Required",
                "badge_kn": "💧 ನೀರಾವರಿ ಅಗತ್ಯವಿದೆ",
                "recommended_zone": target_zone.name,
                "valve_index": target_zone.valve_index,
                "reason_en": f"{target_zone.name} needs irrigation because soil moisture ({reading.soil_moisture:.1f}%) is below configured minimum ({target_zone.moisture_threshold_min}%). Sufficient water is available ({reading.tank_level_pct:.1f}%).{heat_note_en}",
                "reason_kn": f"{target_zone.name}ಗೆ ನೀರಾವರಿ ಅಗತ್ಯವಿದೆ ಏಕೆಂದರೆ ಮಣ್ಣಿನ ತೇವಾಂಶವು ({reading.soil_moisture:.1f}%) ಕನಿಷ್ಠ ಮಿತಿಗಿಂತ ಕಡಿಮೆಯಾಗಿದೆ. ಸಾಕಷ್ಟು ನೀರು ಲಭ್ಯವಿದೆ ({reading.tank_level_pct:.1f}%).{heat_note_kn}",
                "action": f"Activate automated drip cycle for {target_zone.name} (suggested 30 mins).",
                "action_en": f"Activate automated drip cycle for {target_zone.name} (suggested 30 mins).",
                "action_kn": f"{target_zone.name}ಗೆ 30 ನಿಮಿಷಗಳ ಹನಿ ನೀರಾವರಿ ಚಾಲನೆ ಮಾಡಿ."
            }

        if reading.soil_moisture >= 65.0:
            return {
                "decision": "NOT_REQUIRED",
                "badge": "🟢 Not Required",
                "badge_en": "🟢 Not Required",
                "badge_kn": "🟢 ಅಗತ್ಯವಿಲ್ಲ",
                "recommended_zone": None,
                "reason_en": f"Irrigation NOT REQUIRED: Soil moisture is optimal ({reading.soil_moisture:.1f}%). Arecanut root zone has adequate hydration.",
                "reason_kn": f"ನೀರಾವರಿ ಅಗತ್ಯವಿಲ್ಲ: ಮಣ್ಣಿನ ತೇವಾಂಶ ಅತ್ಯುತ್ತಮವಾಗಿದೆ ({reading.soil_moisture:.1f}%). ಅಡಿಕೆ ಬೇರುಗಳಿಗೆ ಸಾಕಷ್ಟು ತೇವಾಂಶವಿದೆ.",
                "action": "No immediate watering needed. Maintain regular canopy inspection.",
                "action_en": "No immediate watering needed. Maintain regular canopy inspection.",
                "action_kn": "ತಕ್ಷಣ ನೀರುಣಿಸುವ ಅಗತ್ಯವಿಲ್ಲ. ತೋಟದ ನಿಯಮಿತ ಪರಿಶೀಲನೆ ಮುಂದುವರಿಸಿ."
            }

        return {
            "decision": "NOT_REQUIRED",
            "badge": "🟢 Normal Range",
            "badge_en": "🟢 Normal Range",
            "badge_kn": "🟢 ಸಾಮಾನ್ಯ ಮಟ್ಟ",
            "recommended_zone": None,
            "reason_en": f"Soil moisture ({reading.soil_moisture:.1f}%) is within the safe holding range. Next scheduled cycle will be evaluated as temperature changes.",
            "reason_kn": f"ಮಣ್ಣಿನ ತೇವಾಂಶ ({reading.soil_moisture:.1f}%) ಸಾಮಾನ್ಯ ಮಟ್ಟದಲ್ಲಿದೆ.",
            "action": "System monitoring in standby.",
            "action_en": "System monitoring in standby.",
            "action_kn": "ವ್ಯವಸ್ಥೆಯು ಕಾಯುವಿಕೆಯಲ್ಲಿದೆ (Standby)."
        }

    @staticmethod
    def check_and_enforce_safety(
        db: Session,
        farm: models.Farm,
        reading: models.SensorReading,
        pump_state: models.PumpValveState
    ) -> bool:
        """
        Enforces safety rules:
        - If pump is ON and water_flow_lpm < 1.0 (after grace) or tank_level_pct < critical,
          immediately shuts off pump, closes valves, sets dry_run_tripped = True, and records alert.
        Returns True if an emergency trip occurred.
        """
        emergency_tripped = False
        now = datetime.utcnow()

        # Check critical tank level while pump running
        if pump_state.pump_status == "ON" and reading.tank_level_pct < 15.0:
            pump_state.pump_status = "OFF"
            pump_state.valve_1 = "CLOSED"
            pump_state.valve_2 = "CLOSED"
            pump_state.valve_3 = "CLOSED"
            pump_state.dry_run_tripped = True
            pump_state.last_action_by = "SAFETY_CUTOFF_LOW_TANK"
            pump_state.last_updated = now

            # Log alert
            alert = models.Alert(
                farm_id=farm.id,
                category="SAFETY",
                severity="CRITICAL",
                title="EMERGENCY SHUTOFF: Low Tank Level",
                message=f"Water tank level reached {reading.tank_level_pct:.1f}%. Pump was halted to prevent dry-run damage.",
                action_recommendation="Replenish water storage or enable secondary source before restarting.",
                timestamp=now
            )
            db.add(alert)
            emergency_tripped = True

        # Check dry-run flow trip
        elif pump_state.pump_status == "ON" and reading.water_flow_lpm < 1.0:
            # Flow absent while pump energized
            pump_state.pump_status = "OFF"
            pump_state.valve_1 = "CLOSED"
            pump_state.valve_2 = "CLOSED"
            pump_state.valve_3 = "CLOSED"
            pump_state.dry_run_tripped = True
            pump_state.last_action_by = "SAFETY_DRY_RUN_PROTECTION"
            pump_state.last_updated = now

            # Record critical alert
            alert = models.Alert(
                farm_id=farm.id,
                category="PUMP",
                severity="CRITICAL",
                title="PUMP DRY-RUN PROTECTION TRIPPED",
                message="Pump was running but flow meter detected 0.0 L/min. Pump immediately stopped and all valves closed to prevent impeller burnout.",
                action_recommendation="Check pump inlet, foot-valve priming, air lock, or pipe blockage, then tap 'Reset Dry-Run Lockout'.",
                timestamp=now
            )
            db.add(alert)

            # Record system fault
            emergency_tripped = True

        if emergency_tripped:
            db.commit()

        return emergency_tripped
