import os
import re
import json
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv
import models

# Load environment configurations
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

def get_groq_api_key() -> Optional[str]:
    """Retrieve Groq API key from environment or .env files."""
    key = os.environ.get("GROQ_API_KEY", "").strip()
    if key and key != "your_groq_api_key_here":
        return key
    
    # Check .env files directly
    for env_path in [
        os.path.join(os.path.dirname(__file__), ".env"),
        os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"),
        ".env"
    ]:
        if os.path.exists(env_path):
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("GROQ_API_KEY="):
                            val = line.split("=", 1)[1].strip().strip('"').strip("'")
                            if val and val != "your_groq_api_key_here":
                                return val
            except Exception:
                pass
    return None

def set_groq_api_key(new_key: str) -> bool:
    """Save Groq API key into runtime environment and .env files."""
    cleaned_key = new_key.strip()
    os.environ["GROQ_API_KEY"] = cleaned_key
    
    # Save to root and backend .env
    for env_path in [
        os.path.join(os.path.dirname(__file__), ".env"),
        os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    ]:
        try:
            lines = []
            found = False
            if os.path.exists(env_path):
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        if line.strip().startswith("GROQ_API_KEY="):
                            lines.append(f"GROQ_API_KEY={cleaned_key}\n")
                            found = True
                        else:
                            lines.append(line)
            if not found:
                lines.append(f"GROQ_API_KEY={cleaned_key}\n")
            with open(env_path, "w", encoding="utf-8") as f:
                f.writelines(lines)
        except Exception as e:
            print(f"Error writing to {env_path}:", e)
    return True

def query_groq_llm(
    user_message: str,
    farm: models.Farm,
    reading: models.SensorReading,
    pump_state: models.PumpValveState,
    alerts: List[models.Alert],
    lang: str = "en"
) -> Optional[Dict[str, Any]]:
    """
    Calls Groq Llama 3.3 70B with real-time farm telemetry grounding.
    """
    api_key = get_groq_api_key()
    if not api_key:
        return None

    is_kn = (lang == "kn") or any(ord(c) >= 0x0C80 and ord(c) <= 0x0CFF for c in user_message)

    farm_name = farm.name if farm else "Sri Manjunatha Areca Plantation"
    farm_loc = farm.location if farm else "Thirthahalli, Shivamogga, Karnataka"
    moisture = f"{reading.soil_moisture:.1f}%" if reading else "56.0%"
    ph = f"{reading.soil_ph:.2f}" if reading else "6.20"
    n_val = f"{reading.nitrogen:.0f} mg/kg" if reading else "210 mg/kg"
    p_val = f"{reading.phosphorus:.0f} mg/kg" if reading else "38 mg/kg"
    k_val = f"{reading.potassium:.0f} mg/kg" if reading else "185 mg/kg"
    temp = f"{reading.temperature_c:.1f}°C" if reading else "28.5°C"
    humidity = f"{reading.humidity_pct:.0f}%" if reading else "72%"
    light = f"{reading.light_lux:.0f} Lux" if reading else "38,000 Lux"
    tank = f"{reading.tank_level_pct:.0f}% ({reading.tank_litres:.0f} L)" if reading else "76% (11,400 L)"
    pump = pump_state.pump_status if pump_state else "OFF"
    mode = pump_state.operating_mode if pump_state else "AUTO"
    dry_run = "ACTIVE LOCKOUT (NO FLOW DETECTED)" if (pump_state and pump_state.dry_run_tripped) else "NORMAL (SAFE)"
    valve1 = pump_state.valve_1 if pump_state else "CLOSED"
    flow_lpm = f"{reading.water_flow_lpm:.1f} L/min" if reading else "0.0 L/min"
    active_alerts = ", ".join([getattr(a, "title", str(a)) for a in alerts if not getattr(a, "is_resolved", False)]) if alerts else "None (All systems nominal)"

    system_prompt = f"""You are an elite Agricultural Scientist & Agronomy Advisor specialized in Arecanut (Areca catechu / Supari / ಅಡಿಕೆ) plantation management in Karnataka, India (specifically the Malnad, Shivamogga, Thirthahalli, Chikkamagaluru, and Coastal belts).

You are giving advice to the farmer/manager of "{farm_name}" located in {farm_loc}.

LIVE FIELD SENSOR TELEMETRY:
- Soil Moisture: {moisture} (Baseline target: 50.0% - 70.0% for Areca root zone; <40% requires irrigation)
- Soil pH: {ph} (Ideal for Laterite red soil: 5.50 - 6.50; <5.5 indicates acidic lockout)
- Soil Macronutrients (NPK):
  * Nitrogen (N): {n_val} (Target: 140 - 250 mg/kg)
  * Phosphorus (P): {p_val} (Target: 25 - 50 mg/kg)
  * Potassium (K): {k_val} (Target: 150 - 250 mg/kg)
- Ambient Air Temperature: {temp}
- Ambient Relative Humidity: {humidity} (High >80% with heat accelerates Phytophthora / Koleroga fruit rot)
- Solar Irradiance: {light}
- Water Storage Tank: {tank}
- Irrigation Pump: {pump} (Operating Mode: {mode}, Flow: {flow_lpm})
- 12V Solenoid Valve 1: {valve1}
- Dry-Run Safety Guard: {dry_run}
- Active System Alerts: {active_alerts}

CULTIVATION GUIDELINES:
- Irrigation requirement: 15–25 Litres/bearing palm/day during dry periods via precision drip.
- Disease management: Koleroga/Mahali fruit rot (Phytophthora meadii) requires 1% Bordeaux mixture spray or poly-bagging before monsoon. Yellow leaf disease requires organic mulching, micronutrient boosters, and balanced drainage.
- Fertilizer management: Muriate of Potash (MOP) for nut filling, rock phosphate/DAP for root anchoring, agricultural lime/dolomite for acidic laterite soil.

INSTRUCTIONS:
1. Always ground your explanation directly in the live sensor numbers above (mention actual soil moisture %, tank %, pH, NPK, etc.).
2. Language: {'Answer in natural, respectful, and fluent KANNADA (ಕನ್ನಡ).' if is_kn else 'Answer in clear, professional, practical ENGLISH.'}
3. Keep the response concise, punchy, and actionable (2 to 4 paragraphs maximum).
4. At the very end of your response, output exactly three short follow-up questions for the farmer on a single line starting with "SUGGESTIONS:", formatted as a JSON array of strings, e.g.:
SUGGESTIONS: ["Question 1", "Question 2", "Question 3"]
"""

    models_to_try = [
        "openai/gpt-oss-120b",
        "qwen/qwen3.8-27b",
        "groq/compound",
        "openai/gpt-oss-20b",
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant"
    ]

    for model_name in models_to_try:
        try:
            from groq import Groq
            client = Groq(api_key=api_key)
            completion = client.chat.completions.create(
                model=model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message}
                ],
                temperature=0.25,
                max_tokens=600,
                top_p=0.9
            )
            raw_text = completion.choices[0].message.content.strip()

            # Parse suggestions from raw_text if present
            suggestions = []
            if "SUGGESTIONS:" in raw_text:
                parts = raw_text.split("SUGGESTIONS:", 1)
                clean_reply = parts[0].strip()
                sugg_part = parts[1].strip()
                try:
                    sugg_match = re.search(r'\[.*\]', sugg_part, re.DOTALL)
                    if sugg_match:
                        suggestions = json.loads(sugg_match.group(0))
                except Exception:
                    pass
            else:
                clean_reply = raw_text

            if not suggestions:
                suggestions = [
                    "ನನ್ನ ತೋಟಕ್ಕೆ ನೀರು ಬೇಕೆ?",
                    "NPK ರಸಗೊಬ್ಬರ ಪ್ರಮಾಣ ತಿಳಿಸಿ",
                    "ಕೊಳೆರೋಗ ತಡೆಗಟ್ಟುವುದು ಹೇಗೆ?"
                ] if is_kn else [
                    "Does my farm need water?",
                    "What fertilizer dose to apply?",
                    "How to prevent Koleroga rot?"
                ]

            return {
                "reply": clean_reply,
                "language": "kn" if is_kn else "en",
                "suggested_actions": suggestions[:4],
                "is_demo": False,
                "model": model_name
            }
        except Exception as e:
            print(f"Groq API call with {model_name} failed: {e}")
            continue

    return None


class AIFarmAdvisor:
    @staticmethod
    def generate_recommendations(
        farm: models.Farm,
        reading: models.SensorReading,
        pump_state: models.PumpValveState,
        alerts: List[models.Alert]
    ) -> List[Dict[str, Any]]:
        """
        Synthesizes prioritized actionable advice based on current telemetry.
        """
        recs = []

        # 1. Irrigation & Water safety (High Priority)
        if pump_state.dry_run_tripped:
            recs.append({
                "id": "rec_dryrun",
                "priority": "HIGH",
                "priority_label_en": "Critical Emergency",
                "priority_label_kn": "ತುರ್ತು ಎಚ್ಚರಿಕೆ",
                "badge_color": "critical",
                "title_en": "Clear Pump Lockout & Check Foot Valve",
                "title_kn": "ಪಂಪ್ ಲಾಕ್ ತೆರವುಗೊಳಿಸಿ ಮತ್ತು ಫುಟ್ ವಾಲ್ವ್ ಪರೀಕ್ಷಿಸಿ",
                "reason_en": "Pump shut down automatically due to 0.0 L/min flow. Running dry damages motor impellers.",
                "reason_kn": "ನೀರಿನ ಹರಿವಿಲ್ಲದೆ ಪಂಪ್ ಚಾಲನೆಯಲ್ಲಿದ್ದ ಕಾರಣ ಮೋಟಾರ್ ರಕ್ಷಣೆಗೆ ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಸ್ಥಗಿತಗೊಂಡಿದೆ.",
                "action_en": "Inspect pipe suction for air leaks or debris. Tap 'Reset Lockout' in Irrigation tab when primed.",
                "action_kn": "ಪೈಪ್‌ನಲ್ಲಿ ಗಾಳಿ ತುಂಬಿದೆಯೇ ಪರೀಕ್ಷಿಸಿ, ನಂತರ 'Reset Lockout' ಬಟನ್ ಒತ್ತಿ."
            })
        elif reading.soil_moisture < 42.0:
            recs.append({
                "id": "rec_irrigate",
                "priority": "HIGH",
                "priority_label_en": "Irrigation Needed",
                "priority_label_kn": "ನೀರಾವರಿ ಅಗತ್ಯವಿದೆ",
                "badge_color": "warning",
                "title_en": f"Irrigate Zone 1 (Current Moisture: {reading.soil_moisture:.1f}%)",
                "title_kn": f"ವಲಯ 1ಕ್ಕೆ ನೀರು ಹರಿಸಿ (ಪ್ರಸ್ತುತ ತೇವಾಂಶ: {reading.soil_moisture:.1f}%)",
                "reason_en": f"Moisture is {reading.soil_moisture:.1f}%, below the ideal 50-70% zone for Arecanut kernel filling.",
                "reason_kn": f"ಮಣ್ಣಿನ ತೇವಾಂಶ {reading.soil_moisture:.1f}% ಇದೆ, ಅಡಿಕೆ ಕಾಳು ಕಟ್ಟಲು ಇದು ಕಡಿಮೆಯಾಗಿದೆ.",
                "action_en": "Enable Auto-Irrigation or run a 35-minute drip cycle during cooler morning/evening hours.",
                "action_kn": "ಬೆಳಿಗ್ಗೆ ಅಥವಾ ಸಂಜೆ 35 ನಿಮಿಷಗಳ ಕಾಲ ಹನಿ ನೀರಾವರಿ ಚಾಲನೆ ಮಾಡಿ."
            })

        # 2. Nutrient & Soil Health (Medium Priority)
        if reading.soil_ph < 5.5:
            recs.append({
                "id": "rec_ph",
                "priority": "MEDIUM",
                "priority_label_en": "Soil Health",
                "priority_label_kn": "ಮಣ್ಣಿನ ಆರೋಗ್ಯ",
                "badge_color": "info",
                "title_en": f"Apply Agricultural Lime / Dolomite (pH {reading.soil_ph:.1f})",
                "title_kn": f"ಸುಣ್ಣ / ಡಾಲೊಮೈಟ್ ಹಾಕಿ (pH {reading.soil_ph:.1f})",
                "reason_en": f"Soil pH is acidic ({reading.soil_ph:.1f}). Laterite soil acidity restricts Phosphorus and Micronutrient absorption.",
                "reason_kn": f"ಮಣ್ಣು ಆಮ್ಲೀಯವಾಗಿದೆ (pH {reading.soil_ph:.1f}). ಇದು ರಂಜಕ ಮತ್ತು ಲಘು ಪೋಷಕಾಂಶಗಳ ಹೀರಿಕೆಯನ್ನು ತಡೆಯುತ್ತದೆ.",
                "action_en": "Broadcast 500g of agricultural lime or dolomite powder per palm in the root drip circle.",
                "action_kn": "ಪ್ರತಿ ಅಡಿಕೆ ಮರದ ಬುಡಕ್ಕೆ 500 ಗ್ರಾಂ ಕೃಷಿ ಸುಣ್ಣ ಅಥವಾ ಡಾಲೊಮೈಟ್ ಪುಡಿ ಹಾಕಿ."
            })
        elif reading.potassium < 150.0:
            recs.append({
                "id": "rec_npk_k",
                "priority": "MEDIUM",
                "priority_label_en": "Nutrient Booster",
                "priority_label_kn": "ಪೋಷಕಾಂಶ ಹೆಚ್ಚಳ",
                "badge_color": "info",
                "title_en": f"Boost Muriate of Potash (K: {reading.potassium:.0f} mg/kg)",
                "title_kn": f"ಪೊಟ್ಯಾಷ್ ಗೊಬ್ಬರ ನೀಡಿ (K: {reading.potassium:.0f} mg/kg)",
                "reason_en": "Potassium is essential for Arecanut bunch weight, nut husk thickness, and drought resistance.",
                "reason_kn": "ಅಡಿಕೆ ಕಾಯಿ ತೂಕ ಮತ್ತು ಸಿಪ್ಪೆಯ ಗುಣಮಟ್ಟಕ್ಕೆ ಪೊಟ್ಯಾಷ್ ಅತ್ಯಂತ ಅಗತ್ಯ.",
                "action_en": "Apply 150g MOP (Muriate of Potash) per bearing palm along with organic compost.",
                "action_kn": "ಪ್ರತಿ ಫಸಲು ನೀಡುವ ಮರಕ್ಕೆ 150 ಗ್ರಾಂ ಪೊಟ್ಯಾಷ್ ಗೊಬ್ಬರವನ್ನು ತಿಪ್ಪೆಗೊಬ್ಬರದೊಂದಿಗೆ ನೀಡಿ."
            })

        # 3. Preventive / Weather Recommendation
        if reading.humidity_pct > 80.0 and reading.temperature_c > 27.0:
            recs.append({
                "id": "rec_koleroga_prevention",
                "priority": "MEDIUM",
                "priority_label_en": "Disease Warning",
                "priority_label_kn": "ರೋಗ ಮುನ್ನೆಚ್ಚರಿಕೆ",
                "badge_color": "warning",
                "title_en": "High Koleroga (Fruit Rot) Risk Window",
                "title_kn": "ಕೊಳೆರೋಗದ ಹೆಚ್ಚಿನ ಅಪಾಯ",
                "reason_en": f"High humidity ({reading.humidity_pct:.0f}%) and ambient heat accelerate Phytophthora meadii spore germination.",
                "reason_kn": f"ಹೆಚ್ಚಿನ ಆರ್ದ್ರತೆ ({reading.humidity_pct:.0f}%) ಕೊಳೆರೋಗದ ಶಿಲೀಂಧ್ರ ಹರಡಲು ಅನುಕೂಲಕರವಾಗಿದೆ.",
                "action_en": "Inspect fruit bunches. Apply prophylactic 1% Bordeaux mixture spray or tie polythene covers.",
                "action_kn": "ಗೊನೆಗಳನ್ನು ಪರಿಶೀಲಿಸಿ. 1% ಬೋರ್ಡೋ ದ್ರಾವಣ ಸಿಂಪಡಿಸಿ ಅಥವಾ ಪ್ಲಾಸ್ಟಿಕ್ ಚೀಲ ಕಟ್ಟಿ."
            })
        else:
            recs.append({
                "id": "rec_mulch",
                "priority": "LOW",
                "priority_label_en": "Farm Maintenance",
                "priority_label_kn": "ತೋಟದ ನಿರ್ವಹಣೆ",
                "badge_color": "healthy",
                "title_en": "Mulch Arecanut Basins with Areca Leaves",
                "title_kn": "ಅಡಿಕೆ ಗರಿಗಳಿಂದ ಬುಡ ಮುಚ್ಚಿ (ಹಸಿರೆಲೆ ಹೊದಿಕೆ)",
                "reason_en": "Organic mulching keeps root zone 3-4°C cooler and conserves up to 35% soil moisture.",
                "reason_kn": "ಬುಡಕ್ಕೆ ಹೊದಿಕೆ ಹಾಕುವುದರಿಂದ ತೇವಾಂಶ ಉಳಿಯುತ್ತದೆ ಮತ್ತು ಬೇರುಗಳು ತಂಪಾಗಿರುತ್ತವೆ.",
                "action_en": "Shred fallen arecanut leaves and fronds, layer around palm base at 15cm distance from trunk.",
                "action_kn": "ಬಿದ್ದ ಅಡಿಕೆ ಗರಿಗಳನ್ನು ಕತ್ತರಿಸಿ ಮರದ ಬುಡದಿಂದ 15 ಸೆಂ.ಮೀ ಅಂತರದಲ್ಲಿ ಹರಡಿ."
            })

        return recs

    @staticmethod
    def process_chatbot_query(
        user_message: str,
        farm: models.Farm,
        reading: models.SensorReading,
        pump_state: models.PumpValveState,
        alerts: List[models.Alert],
        lang: str = "en"
    ) -> Dict[str, Any]:
        """
        Answers questions using Groq Llama 3.3 LLM when API key is provided,
        otherwise falls back seamlessly to deterministic rule-based telemetry answers.
        """
        # 1. Attempt Groq LLM Generation
        groq_result = query_groq_llm(user_message, farm, reading, pump_state, alerts, lang)
        if groq_result:
            return groq_result

        # 2. Fallback: Deterministic Agronomy Rules
        msg = user_message.lower().strip()
        is_kn = (lang == "kn") or any(ord(c) >= 0x0C80 and ord(c) <= 0x0CFF for c in user_message)

        # "Does my farm need water?" / "ನೀರಾವರಿ ಬೇಕೆ?"
        if any(w in msg for w in ["water", "irrigate", "need water", "thirsty", "dry", "ನೀರು", "ನೀರಾವರಿ", "ತೇವಾಂಶ"]):
            if reading.soil_moisture < 42.0:
                reply = (
                    f"ಹೌದು, ನಿಮ್ಮ ತೋಟಕ್ಕೆ ಈಗ ನೀರು ಅಗತ್ಯವಿದೆ! ಪ್ರಸ್ತುತ ಮಣ್ಣಿನ ತೇವಾಂಶ {reading.soil_moisture:.1f}% ಇದೆ (ಕನಿಷ್ಠ ಮಿತಿ: 40%). "
                    f"ಟ್ಯಾಂಕ್‌ನಲ್ಲಿ {reading.tank_level_pct:.1f}% ನೀರಿದೆ. ವಲಯ 1ಕ್ಕೆ 30 ನಿಮಿಷಗಳ ಕಾಲ ಹನಿ ನೀರಾವರಿ ಚಾಲನೆ ಮಾಡಲು ಶಿಫಾರಸು ಮಾಡಲಾಗಿದೆ."
                    if is_kn else
                    f"Yes, your farm needs water right now. Soil moisture is at {reading.soil_moisture:.1f}% (target is 65-70%). "
                    f"Your storage tank has {reading.tank_level_pct:.1f}% water ({reading.tank_litres:.0f} Litres). "
                    f"Zone 1 is ready for an automated 30-minute drip cycle."
                )
                suggestions = ["ಈಗಲೇ ನೀರಾವರಿ ಚಾಲು ಮಾಡಿ", "ಟ್ಯಾಂಕ್ ಮಟ್ಟ ಪರಿಶೀಲಿಸಿ", "ವಲಯ 1 ವಿವರ ನೋಡಿ"] if is_kn else ["Start Irrigation Now", "Check Tank Level", "Show Zone 1 Details"]
            else:
                reply = (
                    f"ಇಲ್ಲ, ಈಗ ನೀರು ಅಗತ್ಯವಿಲ್ಲ. ಮಣ್ಣಿನ ತೇವಾಂಶ {reading.soil_moisture:.1f}% ನೊಂದಿಗೆ ಉತ್ತಮ ಮಟ್ಟದಲ್ಲಿದೆ (ಸಾಮಾನ್ಯ ಮಿತಿ 50-75%). "
                    f"ಟ್ಯಾಂಕ್‌ನಲ್ಲಿ {reading.tank_level_pct:.1f}% ನೀರು ಉಳಿದಿದೆ."
                    if is_kn else
                    f"No, irrigation is NOT needed currently. Soil moisture is comfortable at {reading.soil_moisture:.1f}%, "
                    f"well above the 40% threshold. Storage tank is at {reading.tank_level_pct:.1f}%."
                )
                suggestions = ["ಮುಂದಿನ ನೀರುಣಿಸುವಿಕೆ ಯಾವಾಗ?", "ಮಣ್ಣಿನ ಆರೋಗ್ಯ ಪರಿಶೀಲಿಸಿ", "ಹವಾಮಾನ ನೋಡಿ"] if is_kn else ["When is next watering?", "Check Soil Health", "Show Weather"]

        # "Why is the pump running?" / "Why did it stop?" / "ಪಂಪ್"
        elif any(w in msg for w in ["pump", "running", "motor", "flow", "stopped", "off", "ಮೋಟಾರ್", "ಪಂಪ್"]):
            if pump_state.dry_run_tripped:
                reply = (
                    "ಎಚ್ಚರಿಕೆ: ನೀರಿನ ಹರಿವು ಇಲ್ಲದ ಕಾರಣ (0.0 L/min) ಪಂಪ್ ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಸ್ಥಗಿತಗೊಂಡಿದೆ (Dry-Run Protection). "
                    "ಮೋಟಾರ್ ಹಾನಿಯಾಗದಂತೆ ತಡೆಯಲು ಈ ಸುರಕ್ಷತಾ ಕ್ರಮ ಕೈಗೊಳ್ಳಲಾಗಿದೆ. ದಯವಿಟ್ಟು ಪೈಪ್ ಪರೀಕ್ಷಿಸಿ."
                    if is_kn else
                    "⚠️ Notice: The pump was halted by the Dry-Run Protection system because flow rate was 0.0 L/min. "
                    "This prevents the pump motor and impellers from overheating. Please inspect suction line priming."
                )
                suggestions = ["ಡ್ರೈ-ರನ್ ಲಾಕ್ ತೆರವುಗೊಳಿಸಿ", "ಟ್ಯಾಂಕ್ ನೀರು ಪರಿಶೀಲಿಸಿ", "ಸಂಪರ್ಕಿಸಿ"] if is_kn else ["Reset Dry-Run Lockout", "Check Water Tank", "Contact Support"]
            elif pump_state.pump_status == "ON":
                reply = (
                    f"ಪಂಪ್ ಪ್ರಸ್ತುತ ಚಾಲನೆಯಲ್ಲಿದೆ (ಹರಿವು: {reading.water_flow_lpm:.1f} L/min). "
                    f"ಕಾರ್ಯನಿರ್ವಹಣಾ ವಿಧಾನ: {pump_state.operating_mode}. ವಲಯ 1 ವಾಲ್ವ್ ತೆರೆದಿದೆ."
                    if is_kn else
                    f"The irrigation pump is currently RUNNING with a healthy flow rate of {reading.water_flow_lpm:.1f} L/min. "
                    f"Operating mode is {pump_state.operating_mode}. Solenoid Valve 1 is OPEN."
                )
                suggestions = ["ಪಂಪ್ ಆಫ್ ಮಾಡಿ", "ನೀರಿನ ಹರಿವು ನೋಡಿ", "ಸ್ವಯಂಚಾಲಿತ ಮೋಡ್"] if is_kn else ["Turn Pump OFF", "Check Flow Rate", "Switch to Auto Mode"]
            else:
                reply = (
                    f"ಪಂಪ್ ಪ್ರಸ್ತುತ ಆಫ್ ಆಗಿದೆ (OFF). ಕೊನೆಯ ಕ್ರಿಯೆ: {pump_state.last_action_by}. "
                    f"ಮಣ್ಣಿನ ತೇವಾಂಶವು ಸಾಮಾನ್ಯ ಮಟ್ಟದಲ್ಲಿರುವುದರಿಂದ ಪಂಪ್ ವಿಶ್ರಾಂತಿಯಲ್ಲಿದೆ."
                    if is_kn else
                    f"The pump is currently OFF (Standby). Last updated by {pump_state.last_action_by}. "
                    f"Soil moisture ({reading.soil_moisture:.1f}%) does not demand active pumping."
                )
                suggestions = ["ಪಂಪ್ ಚಾಲು ಮಾಡಿ", "ವೇಳಾಪಟ್ಟಿ ನೋಡಿ", "ನೀರಾವರಿ ಮಿತಿಗಳು"] if is_kn else ["Turn Pump ON", "Check Schedule", "Irrigation Settings"]

        # "Is my NPK okay?" / "ರಸಗೊಬ್ಬರ" / "NPK"
        elif any(w in msg for w in ["npk", "nitrogen", "phosphorus", "potassium", "nutrient", "fertilizer", "ಗೊಬ್ಬರ", "ಪೋಷಕಾಂಶ"]):
            n_stat = "Adequate" if reading.nitrogen >= 180 else "Low"
            p_stat = "Adequate" if reading.phosphorus >= 30 else "Low"
            k_stat = "Adequate" if reading.potassium >= 140 else "Low"
            reply = (
                f"ನಿಮ್ಮ ಮಣ್ಣಿನ ಪೋಷಕಾಂಶ ಮಟ್ಟಗಳು (NPK):\n"
                f"• ನೈಟ್ರೋಜನ್ (N): {reading.nitrogen:.0f} mg/kg ({'ಸಾಕಷ್ಟು' if n_stat == 'Adequate' else 'ಕಡಿಮೆ'})\n"
                f"• ರಂಜಕ (P): {reading.phosphorus:.0f} mg/kg ({'ಸಾಕಷ್ಟು' if p_stat == 'Adequate' else 'ಕಡಿಮೆ'})\n"
                f"• ಪೊಟ್ಯಾಷ್ (K): {reading.potassium:.0f} mg/kg ({'ಸಾಕಷ್ಟು' if k_stat == 'Adequate' else 'ಕಡಿಮೆ'})\n"
                f"ಮಣ್ಣಿನ pH: {reading.soil_ph:.1f}."
                if is_kn else
                f"Current Soil NPK & pH Profile:\n"
                f"• Nitrogen (N): {reading.nitrogen:.0f} mg/kg ({n_stat})\n"
                f"• Phosphorus (P): {reading.phosphorus:.0f} mg/kg ({p_stat})\n"
                f"• Potassium (K): {reading.potassium:.0f} mg/kg ({k_stat})\n"
                f"• Soil pH: {reading.soil_ph:.1f} (Ideal: 5.8 - 6.8)."
            )
            suggestions = ["ರಸಗೊಬ್ಬರ ಸಲಹೆಗಳು", "ಮಣ್ಣಿನ pH ಸರಿಪಡಿಸುವುದು ಹೇಗೆ?", "ಪೋಷಕಾಂಶ ವಿವರ"] if is_kn else ["Fertilizer Recommendation", "How to fix Soil pH", "Soil Health Trends"]

        # "What should I do today?" / "ಇಂದಿನ ಕೆಲಸ"
        elif any(w in msg for w in ["today", "do today", "action", "recommend", "ಕೆಲಸ", "ಇಂದು"]):
            recs = AIFarmAdvisor.generate_recommendations(farm, reading, pump_state, alerts)
            top_rec = recs[0] if recs else None
            if is_kn:
                reply = f"ಇಂದಿನ ಪ್ರಮುಖ ಕೃಷಿ ಸಲಹೆ: {top_rec['title_kn'] if top_rec else 'ತೋಟದಲ್ಲಿ ಎಲ್ಲವೂ ಸಾಮಾನ್ಯವಾಗಿದೆ'}. ಕಾರಣ: {top_rec['reason_kn'] if top_rec else ''}"
            else:
                reply = f"Today's #1 Priority: {top_rec['title_en'] if top_rec else 'All farm metrics optimal'}. Action: {top_rec['action_en'] if top_rec else 'Regular field observation.'}"
            suggestions = ["ಎಲ್ಲಾ ಶಿಫಾರಸುಗಳನ್ನು ನೋಡಿ", "ಇಂದಿನ ಹವಾಮಾನ", "ರೋಗ ತಪಾಸಣೆ ಮಾಡಿ"] if is_kn else ["Show all recommendations", "Check Weather Today", "Inspect Crop Disease"]

        # "Disease" / "Koleroga" / "ರೋಗ"
        elif any(w in msg for w in ["disease", "koleroga", "mahali", "leaf", "rot", "fungus", "ರೋಗ", "ಕೊಳೆರೋಗ"]):
            reply = (
                f"ಪ್ರಸ್ತುತ ಹವಾಮಾನ: ಉಷ್ಣಾಂಶ {reading.temperature_c:.1f}°C, ಆರ್ದ್ರತೆ {reading.humidity_pct:.0f}%. "
                f"{'ಆರ್ದ್ರತೆ ಹೆಚ್ಚಿರುವುದರಿಂದ ಕೊಳೆರೋಗದ ಅಪಾಯವಿದೆ. ಗೊನೆಗಳಿಗೆ 1% ಬೋರ್ಡೋ ಸಿಂಪಡಿಸಿ.' if reading.humidity_pct > 75 else 'ಪ್ರಸ್ತುತ ರೋಗದ ಅಪಾಯ ಸಾಧಾರಣವಾಗಿದೆ.'} "
                f"ಖಚಿತಪಡಿಸಿಕೊಳ್ಳಲು 'ರೋಗ ಪತ್ತೆ' (Disease Detection) ಟ್ಯಾಬ್‌ನಲ್ಲಿ ಫೋಟೋ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ."
                if is_kn else
                f"Environmental condition: Temp {reading.temperature_c:.1f}°C, Humidity {reading.humidity_pct:.0f}%. "
                f"{'High relative humidity creates a favorable environment for Koleroga (Phytophthora) fruit rot. Prophylactic 1% Bordeaux spray is advised.' if reading.humidity_pct > 75 else 'Current fungal spore risk is moderate.'} "
                f"Use the 'Crop Health & Disease' tool to upload a photo for instant screening."
            )
            suggestions = ["ರೋಗ ಪತ್ತೆ ತೆರೆಯಿರಿ", "ಕೊಳೆರೋಗ ಸಿಂಪಡಣೆ ಮಾಹಿತಿ", "ಹಳದಿ ಎಲೆ ರೋಗ"] if is_kn else ["Open Disease Detection", "Koleroga Spray Guide", "Yellow Leaf Symptoms"]

        # "How much water did I use?" / "ನೀರು ಎಷ್ಟು ಖರ್ಚಾಗಿದೆ?"
        elif any(w in msg for w in ["water used", "consumption", "litres", "ಖರ್ಚು", "ಬಳಕೆ"]):
            reply = (
                f"ಇಂದು ಅಂದಾಜು 850 ಲೀಟರ್ ನೀರನ್ನು ನೀರಾವರಿಗೆ ಬಳಸಲಾಗಿದೆ. ಟ್ಯಾಂಕ್ ಮಟ್ಟ {reading.tank_level_pct:.1f}% ಉಳಿದಿದೆ ({reading.tank_litres:.0f} L)."
                if is_kn else
                f"Today's total water consumption is approximately 850 Litres across all drip zones. Current tank balance is {reading.tank_litres:.0f} L ({reading.tank_level_pct:.1f}% capacity)."
            )
            suggestions = ["7 ದಿನಗಳ ನೀರಿನ ಇತಿಹಾಸ", "ಟ್ಯಾಂಕ್ ವಿವರ", "ನೀರಾವರಿ ಮಿತಿ ಬದಲಿಸಿ"] if is_kn else ["Show 7-day water history", "Tank Refill Status", "Change Irrigation Limits"]

        # Default fallback
        else:
            reply = (
                f"ನಮಸ್ಕಾರ! ನಾನು ನಿಮ್ಮ ಅಡಿಕೆ ತೋಟದ AI ಸಹಾಯಕ. "
                f"ಪ್ರಸ್ತುತ ತೋಟದ ಸ್ಥಿತಿ: ತೇವಾಂಶ {reading.soil_moisture:.1f}%, ಟ್ಯಾಂಕ್ {reading.tank_level_pct:.1f}%, ಉಷ್ಣಾಂಶ {reading.temperature_c:.1f}°C. "
                f"ನೀವು ನೀರಾವರಿ, ಪಂಪ್ ಸ್ಥಿತಿ, NPK ಗೊಬ್ಬರ ಅಥವಾ ಕೊಳೆರೋಗದ ಬಗ್ಗೆ ಕೇಳಬಹುದು."
                if is_kn else
                f"Namaskara! I am your Arecanut Farm AI Assistant. "
                f"Live farm snapshot: Soil Moisture {reading.soil_moisture:.1f}%, Tank {reading.tank_level_pct:.1f}%, Temp {reading.temperature_c:.1f}°C. "
                f"You can ask me about watering needs, pump status, NPK fertilizer balances, or crop disease risks."
            )
            suggestions = ["ನನ್ನ ತೋಟಕ್ಕೆ ನೀರು ಬೇಕೆ?", "ಗೊಬ್ಬರದ ಮಟ್ಟ ಸರಿಯಿದೆಯೇ?", "ಪಂಪ್ ಏಕೆ ಓಡುತ್ತಿದೆ?", "ಇಂದು ಏನು ಮಾಡಬೇಕು?"] if is_kn else ["Does my farm need water?", "Is my NPK okay?", "Why is the pump running?", "What should I do today?"]

        return {
            "reply": reply,
            "language": "kn" if is_kn else "en",
            "suggested_actions": suggestions,
            "is_demo": True
        }
