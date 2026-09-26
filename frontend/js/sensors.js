/**
 * Real-Time Sensor Telemetry Cards (Soil, Water, Environment, NPK)
 * Displays value, unit, status badge, normal/target range, and updated time.
 * Designed with in-place smooth updates to prevent DOM flicker and value fluctuation.
 */

class SensorsManager {
  constructor() {
    this.container = document.getElementById("sensorsGrid");
    this.soilHealthSummary = document.getElementById("soilHealthSummary");
    this.lastData = null;
    this.rendered = !!(this.container && this.container.children.length > 0);

    document.addEventListener("languageChanged", () => {
      if (this.lastData) {
        this.renderSensors(this.lastData);
      }
    });

    if (api.isAuthenticated()) {
      this.initAutoLoad();
    }
  }

  async initAutoLoad() {
    try {
      const data = await api.getFarmCurrent();
      if (data && data.reading) {
        this.renderSensors(data);
      }
    } catch (e) {
      // Handled silently
    }
  }

  renderSensors(data) {
    if (!data) return;
    this.lastData = data;
    if (!this.container) return;

    const r = data.reading;
    const isKn = i18n.currentLang === "kn";

    // Soil Moisture Status
    const moistureStatus = r.soil_moisture < 40 ? (isKn ? "ಕಡಿಮೆ" : "Low") : r.soil_moisture > 75 ? (isKn ? "ಹೆಚ್ಚು" : "High") : (isKn ? "ಸೂಕ್ತ" : "Optimal");
    const moistureClass = r.soil_moisture < 40 ? "sensor-badge sensor-badge-offline" : "sensor-badge sensor-badge-online";

    // pH Status
    const phStatus = r.soil_ph < 5.5 ? (isKn ? "ಆಮ್ಲೀಯ" : "Acidic") : r.soil_ph > 7.5 ? (isKn ? "ಕ್ಷಾರೀಯ" : "Alkaline") : (isKn ? "ಸಾಮಾನ್ಯ" : "Ideal");
    const phClass = (r.soil_ph >= 5.8 && r.soil_ph <= 7.0) ? "sensor-badge sensor-badge-online" : "sensor-badge sensor-badge-offline";

    // Tank Level Status
    const tankStatus = r.tank_level_pct < 20 ? (isKn ? "ತುರ್ತು ಕಡಿಮೆ" : "Critical Low") : r.tank_level_pct < 40 ? (isKn ? "ಸಾಧಾರಣ" : "Low") : (isKn ? "ಸಾಕಷ್ಟು" : "Adequate");
    const tankClass = r.tank_level_pct < 20 ? "sensor-badge sensor-badge-offline" : "sensor-badge sensor-badge-online";

    // Water Flow Status
    const flowStatus = r.water_flow_lpm > 5 ? (isKn ? "ಹರಿಯುತ್ತಿದೆ" : "Flowing") : (isKn ? "ಸ್ಥಗಿತ" : "Idle");

    // Environment Status
    const tempStatus = r.temperature_c > 35 ? (isKn ? "ಹೆಚ್ಚು ಬಿಸಿ" : "High Heat") : (isKn ? "ಸಾಧಾರಣ" : "Comfort");
    const humStatus = r.humidity_pct > 80 ? (isKn ? "ಅಧಿಕ ಆರ್ದ್ರತೆ" : "High Humidity") : (isKn ? "ಸಾಮಾನ್ಯ" : "Normal");

    // If DOM already created, perform smooth IN-PLACE text and class updates without destroying DOM
    if (this.rendered && this.container.children.length > 0) {
      this.updateTextInPlace({
        isKn,
        r,
        moistureStatus, moistureClass,
        phStatus, phClass,
        tankStatus, tankClass,
        flowStatus,
        tempStatus
      });
      return;
    }

    // First render: create stable DOM structure
    this.container.innerHTML = `
      <!-- 1. Soil Moisture -->
      <div class="sensor-card">
        <div class="sensor-card-top">
          <span class="sensor-name" id="cardMoistureTitle">💧 ${i18n.t("soil_moisture")}</span>
          <span class="${moistureClass}" id="cardMoistureBadge">${moistureStatus}</span>
        </div>
        <div class="sensor-value-large">
          <span id="cardMoistureVal">${r.soil_moisture.toFixed(1)}</span>
          <span class="sensor-unit">%</span>
        </div>
        <div class="sensor-progress-bar">
          <div class="sensor-progress-fill" id="cardMoistureFill" style="width: ${Math.min(100, r.soil_moisture)}%"></div>
        </div>
        <div class="sensor-meta-row">
          <span id="cardMoistureTarget">${i18n.t("target_range")}: 50 - 72%</span>
          <span id="cardMoistureTime">● ${i18n.t("online")}</span>
        </div>
      </div>

      <!-- 3. Soil pH -->
      <div class="sensor-card">
        <div class="sensor-card-top">
          <span class="sensor-name" id="cardPhTitle">🧪 ${i18n.t("soil_ph")}</span>
          <span class="${phClass}" id="cardPhBadge">${phStatus}</span>
        </div>
        <div class="sensor-value-large">
          <span id="cardPhVal">${r.soil_ph.toFixed(2)}</span>
          <span class="sensor-unit">pH</span>
        </div>
        <div class="sensor-progress-bar">
          <div class="sensor-progress-fill" id="cardPhFill" style="width: ${(r.soil_ph / 14.0) * 100}%; background: #d97706;"></div>
        </div>
        <div class="sensor-meta-row">
          <span id="cardPhTarget">${i18n.t("target_range")}: 5.8 - 6.8 pH</span>
          <span id="cardPhOnline">● ${i18n.t("online")}</span>
        </div>
      </div>

      <!-- 4. Soil NPK -->
      <div class="sensor-card">
        <div class="sensor-card-top">
          <span class="sensor-name" id="cardNpkTitle">🌱 N-P-K ${isKn ? "ಪೋಷಕಾಂಶಗಳು" : "Nutrients"}</span>
          <span class="sensor-badge sensor-badge-online" id="cardNpkBadge">${isKn ? "ಪರಿಶೀಲಿಸಲಾಗಿದೆ" : "Analyzed"}</span>
        </div>
        <div class="npk-grid">
          <div class="npk-column">
            <div class="npk-letter">N</div>
            <div class="npk-val" id="cardValN">${r.nitrogen.toFixed(0)}</div>
            <div class="npk-status-tag npk-adequate" id="cardTagN">${r.nitrogen > 180 ? (isKn ? "ಸಾಕಷ್ಟು" : "Good") : (isKn ? "ಕಡಿಮೆ" : "Low")}</div>
          </div>
          <div class="npk-column">
            <div class="npk-letter">P</div>
            <div class="npk-val" id="cardValP">${r.phosphorus.toFixed(0)}</div>
            <div class="npk-status-tag npk-adequate" id="cardTagP">${r.phosphorus > 30 ? (isKn ? "ಸಾಕಷ್ಟು" : "Good") : (isKn ? "ಕಡಿಮೆ" : "Low")}</div>
          </div>
          <div class="npk-column">
            <div class="npk-letter">K</div>
            <div class="npk-val" id="cardValK">${r.potassium.toFixed(0)}</div>
            <div class="npk-status-tag npk-adequate" id="cardTagK">${r.potassium > 140 ? (isKn ? "ಸಾಕಷ್ಟು" : "Good") : (isKn ? "ಕಡಿಮೆ" : "Low")}</div>
          </div>
        </div>
        <div class="sensor-meta-row">
          <span id="cardNpkUnit">${isKn ? "ಘಟಕ: mg/kg ಮಣ್ಣು" : "Unit: mg/kg dry soil"}</span>
          <span id="cardNpkOnline">● ${i18n.t("online")}</span>
        </div>
      </div>
    `;

    this.rendered = true;
  }

  updateTextInPlace(ctx) {
    const { isKn, r, moistureStatus, moistureClass, phStatus, phClass, tankStatus, tankClass, flowStatus, tempStatus } = ctx;

    // Moisture
    const mTitle = document.getElementById("cardMoistureTitle");
    if (mTitle) mTitle.textContent = `💧 ${i18n.t("soil_moisture")}`;
    const mBadge = document.getElementById("cardMoistureBadge");
    if (mBadge) { mBadge.textContent = moistureStatus; mBadge.className = moistureClass; }
    const mTarget = document.getElementById("cardMoistureTarget");
    if (mTarget) mTarget.textContent = `${i18n.t("target_range")}: 50 - 72%`;
    const mTime = document.getElementById("cardMoistureTime");
    if (mTime) mTime.textContent = `● ${i18n.t("online")}`;

    // pH
    const phTitle = document.getElementById("cardPhTitle");
    if (phTitle) phTitle.textContent = `🧪 ${i18n.t("soil_ph")}`;
    const phBadge = document.getElementById("cardPhBadge");
    if (phBadge) { phBadge.textContent = phStatus; phBadge.className = phClass; }
    const phTarget = document.getElementById("cardPhTarget");
    if (phTarget) phTarget.textContent = `${i18n.t("target_range")}: 5.8 - 6.8 pH`;
    const phOnline = document.getElementById("cardPhOnline");
    if (phOnline) phOnline.textContent = `● ${i18n.t("online")}`;

    // NPK
    const npkTitle = document.getElementById("cardNpkTitle");
    if (npkTitle) npkTitle.textContent = `🌱 N-P-K ${isKn ? "ಪೋಷಕಾಂಶಗಳು" : "Nutrients"}`;
    const npkBadge = document.getElementById("cardNpkBadge");
    if (npkBadge) npkBadge.textContent = isKn ? "ಪರಿಶೀಲಿಸಲಾಗಿದೆ" : "Analyzed";
    const tagN = document.getElementById("cardTagN");
    if (tagN) tagN.textContent = r.nitrogen > 180 ? (isKn ? "ಸಾಕಷ್ಟು" : "Good") : (isKn ? "ಕಡಿಮೆ" : "Low");
    const tagP = document.getElementById("cardTagP");
    if (tagP) tagP.textContent = r.phosphorus > 30 ? (isKn ? "ಸಾಕಷ್ಟು" : "Good") : (isKn ? "ಕಡಿಮೆ" : "Low");
    const tagK = document.getElementById("cardTagK");
    if (tagK) tagK.textContent = r.potassium > 140 ? (isKn ? "ಸಾಕಷ್ಟು" : "Good") : (isKn ? "ಕಡಿಮೆ" : "Low");
    const npkUnit = document.getElementById("cardNpkUnit");
    if (npkUnit) npkUnit.textContent = isKn ? "ಘಟಕ: mg/kg ಮಣ್ಣು" : "Unit: mg/kg dry soil";
    const npkOnline = document.getElementById("cardNpkOnline");
    if (npkOnline) npkOnline.textContent = `● ${i18n.t("online")}`;

    // Tank
    const tTitle = document.getElementById("cardTankTitle");
    if (tTitle) tTitle.textContent = `🚰 ${i18n.t("tank_level")}`;
    const tBadge = document.getElementById("cardTankBadge");
    if (tBadge) { tBadge.textContent = tankStatus; tBadge.className = tankClass; }
    const tMeta = document.getElementById("cardTankMeta");
    if (tMeta) tMeta.textContent = `${isKn ? "ಕನಿಷ್ಠ ರಕ್ಷಣೆ" : "Dry-run Cutoff"}: 15%`;
    const tOnline = document.getElementById("cardTankOnline");
    if (tOnline) tOnline.textContent = `● ${i18n.t("online")}`;

    // Flow
    const fTitle = document.getElementById("cardFlowTitle");
    if (fTitle) fTitle.textContent = `🌊 ${i18n.t("water_flow")}`;
    const fBadge = document.getElementById("cardFlowBadge");
    if (fBadge) fBadge.textContent = flowStatus;
    const fMeta = document.getElementById("cardFlowMeta");
    if (fMeta) fMeta.textContent = `${isKn ? "ಪಂಪ್ ಕ್ಷಮತೆ" : "Flow Sensor"}: YF-S201`;
    const fOnline = document.getElementById("cardFlowOnline");
    if (fOnline) fOnline.textContent = `● ${i18n.t("online")}`;

    // Temp & Humidity
    const tempTitle = document.getElementById("cardTempTitle");
    if (tempTitle) tempTitle.textContent = `🌡️ ${i18n.t("temperature")}`;
    const tempBadge = document.getElementById("cardTempBadge");
    if (tempBadge) tempBadge.textContent = tempStatus;
    const humLabel = document.getElementById("cardHumLabel");
    if (humLabel) humLabel.textContent = isKn ? "ಗಾಳಿಯ ತೇವಾಂಶ" : "Air Humidity";
    const tempOnline = document.getElementById("cardTempOnline");
    if (tempOnline) tempOnline.textContent = `● ${i18n.t("online")}`;
  }

  updateLiveValues(packet) {
    // Keep internal reading cache in sync so language toggle never snaps back to old values
    if (this.lastData && this.lastData.reading) {
      if (packet.soil_moisture !== undefined) this.lastData.reading.soil_moisture = packet.soil_moisture;
      if (packet.soil_ph !== undefined) this.lastData.reading.soil_ph = packet.soil_ph;
      if (packet.tank_level_pct !== undefined) this.lastData.reading.tank_level_pct = packet.tank_level_pct;
      if (packet.tank_litres !== undefined) this.lastData.reading.tank_litres = packet.tank_litres;
      if (packet.water_flow_lpm !== undefined) this.lastData.reading.water_flow_lpm = packet.water_flow_lpm;
      if (packet.temperature_c !== undefined) this.lastData.reading.temperature_c = packet.temperature_c;
      if (packet.humidity_pct !== undefined) this.lastData.reading.humidity_pct = packet.humidity_pct;
    }

    const moistureVal = document.getElementById("cardMoistureVal");
    const moistureFill = document.getElementById("cardMoistureFill");
    if (moistureVal && packet.soil_moisture !== undefined) moistureVal.textContent = packet.soil_moisture.toFixed(1);
    if (moistureFill && packet.soil_moisture !== undefined) moistureFill.style.width = `${Math.min(100, packet.soil_moisture)}%`;

    const phVal = document.getElementById("cardPhVal");
    if (phVal && packet.soil_ph !== undefined) phVal.textContent = packet.soil_ph.toFixed(2);

    const tankVal = document.getElementById("cardTankVal");
    const tankFill = document.getElementById("cardTankFill");
    const tankSub = document.getElementById("cardTankSub");
    if (tankVal && packet.tank_level_pct !== undefined) tankVal.textContent = packet.tank_level_pct.toFixed(0);
    if (tankFill && packet.tank_level_pct !== undefined) tankFill.style.width = `${packet.tank_level_pct}%`;
    if (tankSub && packet.tank_litres !== undefined) tankSub.textContent = `% (${packet.tank_litres.toFixed(0)} L)`;

    const flowVal = document.getElementById("cardFlowVal");
    const flowFill = document.getElementById("cardFlowFill");
    if (flowVal && packet.water_flow_lpm !== undefined) flowVal.textContent = packet.water_flow_lpm.toFixed(1);
    if (flowFill && packet.water_flow_lpm !== undefined) flowFill.style.width = `${(packet.water_flow_lpm / 60.0) * 100}%`;

    const tempVal = document.getElementById("cardTempVal");
    const humVal = document.getElementById("cardHumVal");
    if (tempVal && packet.temperature_c !== undefined) tempVal.textContent = packet.temperature_c.toFixed(1);
    if (humVal && packet.humidity_pct !== undefined) humVal.textContent = `${packet.humidity_pct.toFixed(0)}%`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.sensorsManager = new SensorsManager();
});
