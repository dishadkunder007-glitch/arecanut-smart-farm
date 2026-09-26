/**
 * IoT Monitoring & Edge Hardware Simulator
 * Recreates SSD1306 128x64 I2C OLED display on ESP32 field gateway.
 * Provides rich real-time engineering telemetry breakdown for system administrators.
 */

class OledSimulator {
  constructor() {
    this.currentPage = 1;
    this.totalPages = 4;
    this.autoCycle = true;
    this.cycleInterval = null;
    this.data = null;
    this.initElements();
    this.bindButtons();
    this.render();
    document.addEventListener("languageChanged", () => {
      this.render();
    });
  }

  initElements() {
    this.screenElement = document.getElementById("oledScreenContent");
    this.ledPwr = document.getElementById("oledLedPwr");
    this.ledWifi = document.getElementById("oledLedWifi");
    this.ledPump = document.getElementById("oledLedPump");
    this.ledValve = document.getElementById("oledLedValve");
    this.pageIndicator = document.getElementById("oledPageIndicator");
    this.decoderContainer = document.getElementById("adminOledDecoder");
  }

  bindButtons() {
    document.getElementById("btnOledNext")?.addEventListener("click", () => {
      this.nextPage();
    });
    document.getElementById("btnOledPrev")?.addEventListener("click", () => {
      this.prevPage();
    });
    document.getElementById("btnOledSelect")?.addEventListener("click", () => {
      this.autoCycle = !this.autoCycle;
      const selectBtn = document.getElementById("btnOledSelect");
      if (selectBtn) {
        selectBtn.style.color = this.autoCycle ? "#38bdf8" : "#94a3b8";
      }
      alert(this.autoCycle ? i18n.t("oled_cycle_enabled") : i18n.t("oled_cycle_paused"));
    });

    // Screen navigation pill tabs
    document.querySelectorAll(".oled-screen-pill").forEach(pill => {
      pill.addEventListener("click", () => {
        const page = parseInt(pill.getAttribute("data-page"), 10);
        if (page >= 1 && page <= this.totalPages) {
          this.currentPage = page;
          this.render();
        }
      });
    });
  }

  nextPage() {
    this.currentPage = (this.currentPage % this.totalPages) + 1;
    this.render();
  }

  prevPage() {
    this.currentPage = this.currentPage === 1 ? this.totalPages : this.currentPage - 1;
    this.render();
  }

  startCycling() {
    this.render();
    this.loadData();
    if (!this.cycleInterval) {
      this.cycleInterval = setInterval(() => {
        if (this.autoCycle) {
          this.nextPage();
        }
      }, 5000);
    }
  }

  async loadData() {
    try {
      this.data = await api.getOledData();
      this.render();
    } catch (e) {
      console.warn("OLED data fetch error:", e);
    }
  }

  updateLiveData(packet) {
    if (!this.data) {
      this.data = {};
    }
    this.data.soil_moisture = packet.soil_moisture ?? this.data.soil_moisture ?? 56.4;
    this.data.soil_ph = packet.soil_ph ?? this.data.soil_ph ?? 6.2;
    this.data.temperature_c = packet.temperature_c ?? this.data.temperature_c ?? 28.5;
    this.data.humidity_pct = packet.humidity_pct ?? this.data.humidity_pct ?? 72;
    this.data.light_lux = packet.light_lux ?? this.data.light_lux ?? 38000;
    this.data.nitrogen = packet.nitrogen ?? this.data.nitrogen ?? 210;
    this.data.phosphorus = packet.phosphorus ?? this.data.phosphorus ?? 38;
    this.data.potassium = packet.potassium ?? this.data.potassium ?? 185;
    this.data.tank_level_pct = packet.tank_level_pct ?? this.data.tank_level_pct ?? 76;
    this.data.pump_status = packet.pump_status ?? this.data.pump_status ?? "OFF";
    this.data.operating_mode = packet.operating_mode ?? this.data.operating_mode ?? "AUTO";
    this.data.water_flow_lpm = packet.water_flow_lpm ?? this.data.water_flow_lpm ?? 0;
    this.data.dry_run_tripped = packet.dry_run_tripped ?? this.data.dry_run_tripped ?? false;
    this.data.valve_1 = packet.valve_1 ?? this.data.valve_1 ?? "CLOSED";
    this.data.valve_2 = packet.valve_2 ?? this.data.valve_2 ?? "CLOSED";
    this.data.valve_3 = packet.valve_3 ?? this.data.valve_3 ?? "CLOSED";
    this.render();
  }

  render() {
    if (!this.screenElement) return;

    const d = this.data || {
      soil_moisture: 56.4,
      soil_ph: 6.20,
      temperature_c: 28.5,
      humidity_pct: 72,
      light_lux: 38000,
      nitrogen: 210,
      phosphorus: 38,
      potassium: 185,
      tank_level_pct: 76,
      pump_status: "OFF",
      operating_mode: "AUTO",
      water_flow_lpm: 0,
      dry_run_tripped: false,
      valve_1: "CLOSED",
      valve_2: "CLOSED",
      valve_3: "CLOSED",
      wifi_rssi: -54,
      battery_pct: 94
    };

    // Hardware Enclosure LEDs
    if (this.ledPwr) this.ledPwr.classList.add("active");
    if (this.ledWifi) this.ledWifi.classList.add("active");
    if (this.ledPump) {
      if (d.pump_status === "ON") this.ledPump.classList.add("active");
      else this.ledPump.classList.remove("active");
    }
    if (this.ledValve) {
      if (d.valve_1 === "OPEN" || d.pump_status === "ON") this.ledValve.classList.add("active");
      else this.ledValve.classList.remove("active");
    }

    // Update screen pill tabs
    document.querySelectorAll(".oled-screen-pill").forEach(pill => {
      const page = parseInt(pill.getAttribute("data-page"), 10);
      if (page === this.currentPage) {
        pill.classList.add("active");
      } else {
        pill.classList.remove("active");
      }
    });

    const isKn = i18n.currentLang === "kn";

    // Page indicator text
    if (this.pageIndicator) {
      const screenNamesEn = [
        "1/4: PRIMARY SENSORS (DHT22 / LDR)",
        "2/4: SOIL NUTRIENTS (NPK / pH)",
        "3/4: ACTUATORS (12V VALVE / PUMP)",
        "4/4: NODE BUS & DIAGNOSTICS"
      ];
      const screenNamesKn = [
        "1/4: ಮುಖ್ಯ ಸಂವೇದಕಗಳು (DHT22 / LDR)",
        "2/4: ಪೋಷಕಾಂಶಗಳು (NPK / pH)",
        "3/4: ನಿಯಂತ್ರಕಗಳು (12V ವಾಲ್ವ್ / ಪಂಪ್)",
        "4/4: ನೋಡ್ ಬಸ್ ಮತ್ತು ಆರೋಗ್ಯ"
      ];
      const name = isKn ? screenNamesKn[this.currentPage - 1] : screenNamesEn[this.currentPage - 1];
      this.pageIndicator.textContent = `${i18n.t("oled_page")} ${name}`;
    }

    // Render OLED screen matrix
    if (this.currentPage === 1) {
      // SCREEN 1: PRIMARY ENVIRONMENTAL & SOIL SENSORS
      const lightLabel = d.light_lux > 50000 ? "BRIGHT" : d.light_lux > 15000 ? "OPTIMAL" : "SHADE";
      this.screenElement.innerHTML = `
        <div class="oled-row-header">
          <span>[ESP32] SENSOR TELEMETRY</span>
          <span>P1/4</span>
        </div>
        <div class="oled-row">
          <span>DHT22 T:${d.temperature_c.toFixed(1)}C</span>
          <span>HUM:${d.humidity_pct.toFixed(0)}%</span>
        </div>
        <div class="oled-row">
          <span>LDR LUX:${d.light_lux.toFixed(0)}</span>
          <span>[${lightLabel}]</span>
        </div>
        <div class="oled-row">
          <span>SOIL MOIST:${d.soil_moisture.toFixed(1)}%</span>
          <span>[${d.soil_moisture < 40 ? 'LOW!' : d.soil_moisture > 75 ? 'HIGH' : 'OK'}]</span>
        </div>
        <div class="oled-row">
          <span>pH SENSOR:${d.soil_ph.toFixed(2)}</span>
          <span>${d.soil_ph < 5.5 ? 'ACIDIC' : 'BALANCED'}</span>
        </div>
        <div class="oled-row ${d.dry_run_tripped ? 'oled-alert-line' : ''}">
          <span>SYS: ONLINE 🟢</span>
          <span>STREAM: 1.0Hz</span>
        </div>
      `;
    } else if (this.currentPage === 2) {
      // SCREEN 2: NPK SOIL FERTILITY & pH PROBE
      this.screenElement.innerHTML = `
        <div class="oled-row-header">
          <span>[ESP32] NPK SOIL METRICS</span>
          <span>P2/4</span>
        </div>
        <div class="oled-row">
          <span>NITROGEN (N)  :</span>
          <span>${d.nitrogen.toFixed(0)} mg/kg [OK]</span>
        </div>
        <div class="oled-row">
          <span>PHOSPHORUS(P) :</span>
          <span>${d.phosphorus.toFixed(0)} mg/kg [OK]</span>
        </div>
        <div class="oled-row">
          <span>POTASSIUM (K) :</span>
          <span>${d.potassium.toFixed(0)} mg/kg [OK]</span>
        </div>
        <div class="oled-row">
          <span>SOIL pH PROBE :</span>
          <span>${d.soil_ph.toFixed(2)} pH</span>
        </div>
        <div class="oled-row">
          <span>BUS: RS485 MODBUS RTU [0x01]</span>
        </div>
      `;
    } else if (this.currentPage === 3) {
      // SCREEN 3: ACTUATOR CONTROL & 12V SOLENOID HYDRAULICS
      this.screenElement.innerHTML = `
        <div class="oled-row-header">
          <span>[ESP32] ACTUATOR CONTROL</span>
          <span>P3/4</span>
        </div>
        <div class="oled-row">
          <span>12V SOLENOID :</span>
          <span>${d.valve_1 === 'OPEN' || d.pump_status === 'ON' ? 'OPEN 💧' : 'CLOSED ⛔'}</span>
        </div>
        <div class="oled-row">
          <span>MAIN PUMP    :</span>
          <span>${d.pump_status} (${d.operating_mode})</span>
        </div>
        <div class="oled-row">
          <span>FLOW SENSOR  :</span>
          <span>${d.water_flow_lpm.toFixed(0)} LPM | 2.2 BAR</span>
        </div>
        <div class="oled-row">
          <span>5mm DRIP LINE:</span>
          <span>${d.pump_status === 'ON' ? 'PRESSURIZED' : 'STANDBY'}</span>
        </div>
        <div class="oled-row ${d.dry_run_tripped ? 'oled-alert-line' : ''}">
          <span>GUARD: ${d.dry_run_tripped ? '!DRY-RUN LOCKOUT!' : 'ARMED / OK 🛡️'}</span>
        </div>
      `;
    } else {
      // SCREEN 4: NODE BUS, POWER RAILS & DIAGNOSTICS
      this.screenElement.innerHTML = `
        <div class="oled-row-header">
          <span>[ESP32] NODE DIAGNOSTICS</span>
          <span>P4/4</span>
        </div>
        <div class="oled-row">
          <span>CPU: DUAL-CORE ESP32 @ 240MHz</span>
        </div>
        <div class="oled-row">
          <span>PWR: 12V 10A PSU (RAIL: 12.1V)</span>
        </div>
        <div class="oled-row">
          <span>LOGIC: 5V & 3.3V TERMINALS OK</span>
        </div>
        <div class="oled-row">
          <span>I2C: 0x3C (SSD1306) ACK @ 400kHz</span>
        </div>
        <div class="oled-row">
          <span>WIFI: ArecaNet (${d.wifi_rssi || -54}dBm) 100%</span>
        </div>
      `;
    }

    // Render Admin Telemetry Decoder
    this.renderAdminDecoder(d, isKn);

    // Update live readouts on hardware component cards
    this.updateComponentLiveReadouts(d);
  }

  renderAdminDecoder(d, isKn) {
    if (!this.decoderContainer) return;

    if (this.currentPage === 1) {
      // PAGE 1 DECODER: PRIMARY SENSORS
      const tClass = (d.temperature_c >= 20 && d.temperature_c <= 34) ? 'status-tag-ok' : 'status-tag-alert';
      const tStatus = (d.temperature_c >= 20 && d.temperature_c <= 34) ? (isKn ? 'ಸಾಮಾನ್ಯ' : 'NORMAL') : (isKn ? 'ಹೆಚ್ಚು' : 'ALERT');
      const hClass = (d.humidity_pct >= 50 && d.humidity_pct <= 85) ? 'status-tag-ok' : 'status-tag-warn';
      const hStatus = (d.humidity_pct >= 50 && d.humidity_pct <= 85) ? (isKn ? 'ಸೂಕ್ತ' : 'OPTIMAL') : (isKn ? 'ಗಮನಿಸಿ' : 'MONITOR');
      const mClass = (d.soil_moisture >= 50 && d.soil_moisture <= 70) ? 'status-tag-ok' : (d.soil_moisture < 40 ? 'status-tag-alert' : 'status-tag-warn');
      const mStatus = (d.soil_moisture >= 50 && d.soil_moisture <= 70) ? (isKn ? 'ಸೂಕ್ತ' : 'OPTIMAL') : (d.soil_moisture < 40 ? (isKn ? 'ಕಡಿಮೆ' : 'LOW') : (isKn ? 'ಹೆಚ್ಚು' : 'HIGH'));
      const pClass = (d.soil_ph >= 5.5 && d.soil_ph <= 6.8) ? 'status-tag-ok' : 'status-tag-warn';
      const pStatus = (d.soil_ph >= 5.5 && d.soil_ph <= 6.8) ? (isKn ? 'ಆರೋಗ್ಯಕರ' : 'HEALTHY') : (isKn ? 'ವ್ಯತ್ಯಾಸ' : 'WARNING');

      this.decoderContainer.innerHTML = `
        <div class="admin-decoder-header">
          <div class="admin-decoder-title">
            <span>🔬</span>
            <span>${isKn ? 'ಸ್ಕ್ರೀನ್ 1 ವಿಶ್ಲೇಷಣೆ: ಪ್ರಾಥಮಿಕ ಸಂವೇದಕಗಳು (DHT22 & LDR)' : 'Screen 1 Decoder: Primary Sensors (DHT22 & LDR)'}</span>
          </div>
          <span class="decoder-status-tag status-tag-ok">${isKn ? 'ಸಂವೇದಕಗಳು ಸಕ್ರಿಯ' : 'TELEMETRY LIVE'}</span>
        </div>
        <table class="admin-decoder-table">
          <thead>
            <tr>
              <th>${isKn ? 'ಪ್ಯಾರಾಮೀಟರ್' : 'Telemetry Parameter'}</th>
              <th>${isKn ? 'ಪ್ರಸ್ತುತ ಮೌಲ್ಯ' : 'Live Value'}</th>
              <th>${isKn ? 'ಸೂಕ್ತ ಮಿತಿ' : 'Baseline Window'}</th>
              <th>${isKn ? 'ಸ್ಥಿತಿ' : 'Admin Status'}</th>
              <th>${isKn ? 'ನಿರ್ವಾಹಕ ವಿವರಣೆ' : 'Admin Diagnostic Interpretation'}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><div class="decoder-param-name">🌡️ DHT22 Air Temperature</div></td>
              <td><span class="decoder-param-val">${d.temperature_c.toFixed(1)} °C</span></td>
              <td>22.0°C – 34.0°C</td>
              <td><span class="decoder-status-tag ${tClass}">${tStatus}</span></td>
              <td><div class="decoder-note">${isKn ? 'ತೋಟದ ಉಷ್ಣಾಂಶ ಸೂಕ್ತ ವ್ಯಾಪ್ತಿಯಲ್ಲಿದೆ. ತೀವ್ರ ಶಾಖದ ಒತ್ತಡವಿಲ್ಲ.' : 'Ambient microclimate is within normal range for Arecanut canopy.'}</div></td>
            </tr>
            <tr>
              <td><div class="decoder-param-name">💧 DHT22 Relative Humidity</div></td>
              <td><span class="decoder-param-val">${d.humidity_pct.toFixed(0)} %</span></td>
              <td>55% – 80%</td>
              <td><span class="decoder-status-tag ${hClass}">${hStatus}</span></td>
              <td><div class="decoder-note">${isKn ? 'ಆರ್ದ್ರತೆ ಉತ್ತಮವಾಗಿದೆ. ಫಂಗಲ್ ಸೋಂಕಿನ ಅಪಾಯ ಕಡಿಮೆ.' : 'Favorable relative humidity; low immediate risk of fungal spore spread.'}</div></td>
            </tr>
            <tr>
              <td><div class="decoder-param-name">☀️ LDR Ambient Light Sensor</div></td>
              <td><span class="decoder-param-val">${d.light_lux.toLocaleString()} Lux</span></td>
              <td>10k – 65k Lux</td>
              <td><span class="decoder-status-tag status-tag-active">${isKn ? 'ಬೆಳಕು' : 'DAYLIGHT'}</span></td>
              <td><div class="decoder-note">${isKn ? 'ದ್ಯುತಿಸಂಶ್ಲೇಷಣೆಗೆ ನೈಸರ್ಗಿಕ ಬೆಳಕು ಲಭ್ಯವಿದೆ.' : 'Solar irradiance active. Evapotranspiration demand is steady.'}</div></td>
            </tr>
            <tr>
              <td><div class="decoder-param-name">🌱 Capacitive Soil Moisture</div></td>
              <td><span class="decoder-param-val">${d.soil_moisture.toFixed(1)} %</span></td>
              <td>50.0% – 70.0%</td>
              <td><span class="decoder-status-tag ${mClass}">${mStatus}</span></td>
              <td><div class="decoder-note">${isKn ? 'ಅಡಿಕೆ ಬೇರುಗಳ ಭಾಗದಲ್ಲಿ ತೇವಾಂಶ ಸಮರ್ಪಕವಾಗಿದೆ.' : 'Volumetric root moisture adequate. Zero water stress detected.'}</div></td>
            </tr>
            <tr>
              <td><div class="decoder-param-name">🧪 Soil pH Probe</div></td>
              <td><span class="decoder-param-val">${d.soil_ph.toFixed(2)} pH</span></td>
              <td>5.50 – 6.50 pH</td>
              <td><span class="decoder-status-tag ${pClass}">${pStatus}</span></td>
              <td><div class="decoder-note">${isKn ? 'ಆಮ್ಲತೆ ಸಾಮಾನ್ಯ. ಪೋಷಕಾಂಶಗಳ ಹೀರಿಕೆಗೆ ಯಾವುದೇ ಅಡಚಣೆಯಿಲ್ಲ.' : 'Ideal acidity for laterite red soil; excellent nutrient bioavailability.'}</div></td>
            </tr>
          </tbody>
        </table>
      `;
    } else if (this.currentPage === 2) {
      // PAGE 2 DECODER: NPK SOIL METRICS
      this.decoderContainer.innerHTML = `
        <div class="admin-decoder-header">
          <div class="admin-decoder-title">
            <span>🌿</span>
            <span>${isKn ? 'ಸ್ಕ್ರೀನ್ 2 ವಿಶ್ಲೇಷಣೆ: ಮಣ್ಣಿನ ರಸಗೊಬ್ಬರ (NPK & pH)' : 'Screen 2 Decoder: Soil Fertility (NPK & pH)'}</span>
          </div>
          <span class="decoder-status-tag status-tag-ok">MODBUS RS485 ACTIVE</span>
        </div>
        <table class="admin-decoder-table">
          <thead>
            <tr>
              <th>${isKn ? 'ಪೋಷಕಾಂಶ' : 'Nutrient Metric'}</th>
              <th>${isKn ? 'ಪ್ರಸ್ತುತ ಮಟ್ಟ' : 'Live Reading'}</th>
              <th>${isKn ? 'ಶಿಫಾರಸು ಮಾಡಿದ ಮಿತಿ' : 'Target Threshold'}</th>
              <th>${isKn ? 'ಸ್ಥಿತಿ' : 'Fertility Status'}</th>
              <th>${isKn ? 'ನಿರ್ವಾಹಕ ವಿವರಣೆ' : 'Admin Engineering Note'}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><div class="decoder-param-name">🍃 Nitrogen (N)</div></td>
              <td><span class="decoder-param-val">${d.nitrogen.toFixed(0)} mg/kg</span></td>
              <td>140 – 250 mg/kg</td>
              <td><span class="decoder-status-tag status-tag-ok">${isKn ? 'ಸಮರ್ಪಕ' : 'OPTIMAL'}</span></td>
              <td><div class="decoder-note">${isKn ? 'ಸಸ್ಯದ ಬೆಳವಣಿಗೆಗೆ ಸಾರಜನಕ ಮಟ್ಟ ಸಮೃದ್ಧವಾಗಿದೆ.' : 'Promotes robust vegetative frond development and crown greenness.'}</div></td>
            </tr>
            <tr>
              <td><div class="decoder-param-name">🌱 Phosphorus (P)</div></td>
              <td><span class="decoder-param-val">${d.phosphorus.toFixed(0)} mg/kg</span></td>
              <td>25 – 50 mg/kg</td>
              <td><span class="decoder-status-tag status-tag-ok">${isKn ? 'ಸಮರ್ಪಕ' : 'SUFFICIENT'}</span></td>
              <td><div class="decoder-note">${isKn ? 'ಬೇರುಗಳ ವೃದ್ಧಿ ಮತ್ತು ಹೂಬಿಡುವಿಕೆಗೆ ಸೂಕ್ತ.' : 'Supports root anchoring and flowering node initiation.'}</div></td>
            </tr>
            <tr>
              <td><div class="decoder-param-name">🌰 Potassium (K)</div></td>
              <td><span class="decoder-param-val">${d.potassium.toFixed(0)} mg/kg</span></td>
              <td>150 – 250 mg/kg</td>
              <td><span class="decoder-status-tag status-tag-ok">${isKn ? 'ಉತ್ತಮ' : 'EXCELLENT'}</span></td>
              <td><div class="decoder-note">${isKn ? 'ಅಡಿಕೆ ಕಾಯಿ ತೂಕ ಮತ್ತು ಗುಣಮಟ್ಟ ಹೆಚ್ಚಿಸುತ್ತದೆ.' : 'Crucial for arecanut kernel density and resistance to drought stress.'}</div></td>
            </tr>
            <tr>
              <td><div class="decoder-param-name">🧪 Signal Transceiver</div></td>
              <td><span class="decoder-param-val">RS485 Modbus</span></td>
              <td>9600 Baud, 8N1</td>
              <td><span class="decoder-status-tag status-tag-active">CONNECTED</span></td>
              <td><div class="decoder-note">Industrial RS485 differential bus on UART2 (GPIO16/17) with CRC check.</div></td>
            </tr>
          </tbody>
        </table>
      `;
    } else if (this.currentPage === 3) {
      // PAGE 3 DECODER: ACTUATORS & 12V SOLENOID VALVE
      const valveActive = d.valve_1 === 'OPEN' || d.pump_status === 'ON';
      this.decoderContainer.innerHTML = `
        <div class="admin-decoder-header">
          <div class="admin-decoder-title">
            <span>⚙️</span>
            <span>${isKn ? 'ಸ್ಕ್ರೀನ್ 3 ವಿಶ್ಲೇಷಣೆ: 12V ವಾಲ್ವ್ ಮತ್ತು ಪಂಪ್ ನಿಯಂತ್ರಣ' : 'Screen 3 Decoder: Actuator & 12V Solenoid Control'}</span>
          </div>
          <span class="decoder-status-tag ${valveActive ? 'status-tag-active' : 'status-tag-ok'}">
            ${valveActive ? (isKn ? 'ವಾಲ್ವ್ ತೆರೆದಿದೆ' : 'SOLENOID OPEN') : (isKn ? 'ಸ್ಥಗಿತ / ಸಿದ್ಧ' : 'VALVE IDLE')}
          </span>
        </div>
        <table class="admin-decoder-table">
          <thead>
            <tr>
              <th>${isKn ? 'ಕಾಂಪೊನೆಂಟ್' : 'Subsystem'}</th>
              <th>${isKn ? 'ಸ್ಥಿತಿ' : 'Active State'}</th>
              <th>${isKn ? 'ವಿದ್ಯುತ್ / ಹರಿವು' : 'Hydraulic Telemetry'}</th>
              <th>${isKn ? 'ರಕ್ಷಣೆ' : 'Guard Circuit'}</th>
              <th>${isKn ? 'ನಿರ್ವಾಹಕ ವಿವರಣೆ' : 'Admin Engineering Note'}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><div class="decoder-param-name">🚰 12V Solenoid Valve</div></td>
              <td><span class="decoder-param-val">${valveActive ? 'ENERGIZED (OPEN)' : 'DE-ENERGIZED (CLOSED)'}</span></td>
              <td>12V DC / 0.8A Coil</td>
              <td><span class="decoder-status-tag ${valveActive ? 'status-tag-active' : 'status-tag-ok'}">${valveActive ? 'FLOWING' : 'SEALED'}</span></td>
              <td><div class="decoder-note">Controls pressurized water delivery to the 5-tree drip distribution pipe.</div></td>
            </tr>
            <tr>
              <td><div class="decoder-param-name">⚡ Submersible Irrigation Pump</div></td>
              <td><span class="decoder-param-val">${d.pump_status} [${d.operating_mode}]</span></td>
              <td>${d.water_flow_lpm.toFixed(0)} Litres / Min</td>
              <td><span class="decoder-status-tag ${d.dry_run_tripped ? 'status-tag-alert' : 'status-tag-ok'}">${d.dry_run_tripped ? 'TRIPPED' : 'SAFE'}</span></td>
              <td><div class="decoder-note">Autonomous duty cycling managed by backend SmartIrrigation decision engine.</div></td>
            </tr>
            <tr>
              <td><div class="decoder-param-name">🛡️ Dry-Run Protective Circuit</div></td>
              <td><span class="decoder-param-val">${d.dry_run_tripped ? 'ACTIVE LOCKOUT' : 'STANDBY ARMED'}</span></td>
              <td>Hall-Effect Pulse Check</td>
              <td><span class="decoder-status-tag ${d.dry_run_tripped ? 'status-tag-alert' : 'status-tag-ok'}">${d.dry_run_tripped ? 'CUTOFF' : 'MONITORING'}</span></td>
              <td><div class="decoder-note">Cuts off pump coil immediately if zero flow is detected within 12 seconds of run.</div></td>
            </tr>
            <tr>
              <td><div class="decoder-param-name">🌿 5-Tree Drip Manifold</div></td>
              <td><span class="decoder-param-val">5x Adjustable Drippers</span></td>
              <td>Operating: ~2.2 Bar</td>
              <td><span class="decoder-status-tag status-tag-ok">BALANCED</span></td>
              <td><div class="decoder-note">10m 5mm flexible drip tube with T-connectors directly watering 5 root zones.</div></td>
            </tr>
          </tbody>
        </table>
      `;
    } else {
      // PAGE 4 DECODER: NODE BUS, POWER & TELEMETRY
      this.decoderContainer.innerHTML = `
        <div class="admin-decoder-header">
          <div class="admin-decoder-title">
            <span>💻</span>
            <span>${isKn ? 'ಸ್ಕ್ರೀನ್ 4 ವಿಶ್ಲೇಷಣೆ: IoT ನೋಡ್ ಬಸ್ ಮತ್ತು ಪವರ್ ರೈಲ್' : 'Screen 4 Decoder: Node Hardware & Power Rails'}</span>
          </div>
          <span class="decoder-status-tag status-tag-ok">HEALTH 100%</span>
        </div>
        <table class="admin-decoder-table">
          <thead>
            <tr>
              <th>${isKn ? 'ವ್ಯವಸ್ಥೆ' : 'Hardware Subsystem'}</th>
              <th>${isKn ? 'ವಿವರಣೆ' : 'Specification'}</th>
              <th>${isKn ? 'ವಿದ್ಯುತ್ / ಸಿಗ್ನಲ್' : 'Operating Telemetry'}</th>
              <th>${isKn ? 'ಸ್ಥಿತಿ' : 'Bus Health'}</th>
              <th>${isKn ? 'ನಿರ್ವಾಹಕ ವಿವರಣೆ' : 'Admin Engineering Note'}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><div class="decoder-param-name">🧠 Microcontroller</div></td>
              <td>ESP32-WROOM-32D</td>
              <td><span class="decoder-param-val">240 MHz Dual-Core</span></td>
              <td><span class="decoder-status-tag status-tag-ok">ONLINE</span></td>
              <td><div class="decoder-note">Core 0 manages WiFi/REST telemetry; Core 1 handles sensor I2C/ADC polling loop.</div></td>
            </tr>
            <tr>
              <td><div class="decoder-param-name">🔌 12V 10A Main Power Supply</div></td>
              <td>Regulated 120W SMPS</td>
              <td><span class="decoder-param-val">12.1V DC / 2.4A Load</span></td>
              <td><span class="decoder-status-tag status-tag-ok">STABLE</span></td>
              <td><div class="decoder-note">Sufficient current headroom to actuate 12V solenoid valves and water pumps.</div></td>
            </tr>
            <tr>
              <td><div class="decoder-param-name">⚡ 12V & 5V Terminal Blocks</div></td>
              <td>Dual-Rail Barrier Strip</td>
              <td><span class="decoder-param-val">5.02V / 3.31V Logic</span></td>
              <td><span class="decoder-status-tag status-tag-ok">ISOLATED</span></td>
              <td><div class="decoder-note">No inductive kickback noise detected on sensitive analog/digital sensor lines.</div></td>
            </tr>
            <tr>
              <td><div class="decoder-param-name">📟 0.96" I2C OLED Display</div></td>
              <td>SSD1306 128x64</td>
              <td><span class="decoder-param-val">Addr 0x3C @ 400kHz</span></td>
              <td><span class="decoder-status-tag status-tag-ok">ACK OK</span></td>
              <td><div class="decoder-note">Physical I2C bus on GPIO21 (SDA) / GPIO22 (SCL). Zero I2C bus collision.</div></td>
            </tr>
            <tr>
              <td><div class="decoder-param-name">📶 Wi-Fi Station Uplink</div></td>
              <td>802.11 b/g/n 2.4GHz</td>
              <td><span class="decoder-param-val">${d.wifi_rssi || -54} dBm (RSSI)</span></td>
              <td><span class="decoder-status-tag status-tag-ok">STRONG</span></td>
              <td><div class="decoder-note">Direct HTTP REST push to /api/telemetry/push with low packet latency (~18ms).</div></td>
            </tr>
          </tbody>
        </table>
      `;
    }
  }

  updateComponentLiveReadouts(d) {
    const elDHT = document.getElementById("compLiveDHT");
    if (elDHT) elDHT.textContent = `${d.temperature_c.toFixed(1)}°C | ${d.humidity_pct.toFixed(0)}% RH`;

    const elLDR = document.getElementById("compLiveLDR");
    if (elLDR) elLDR.textContent = `${d.light_lux.toLocaleString()} Lux`;

    const elPH = document.getElementById("compLivePH");
    if (elPH) elPH.textContent = `${d.soil_ph.toFixed(2)} pH (Optimal)`;

    const elNPK = document.getElementById("compLiveNPK");
    if (elNPK) elNPK.textContent = `N:${d.nitrogen.toFixed(0)} P:${d.phosphorus.toFixed(0)} K:${d.potassium.toFixed(0)}`;

    const elSolenoid = document.getElementById("compLiveSolenoid");
    if (elSolenoid) {
      const isAct = d.valve_1 === "OPEN" || d.pump_status === "ON";
      elSolenoid.textContent = isAct ? "OPEN 💧" : "CLOSED ⛔";
      elSolenoid.style.color = isAct ? "#38bdf8" : "#94a3b8";
    }

    const elOLED = document.getElementById("compLiveOLED");
    if (elOLED) elOLED.textContent = `P${this.currentPage}/4 Active`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.oledSimulator = new OledSimulator();
});
