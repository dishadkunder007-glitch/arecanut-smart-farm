/**
 * Smart Irrigation Controller & Decision Engine UI
 * Manages pump start/stop, solenoid valves, manual/auto modes, and dry-run safety.
 */

class IrrigationManager {
  constructor() {
    this.pumpState = null;
    this.decision = null;
    this.zones = [];
    this.cachedEvents = null;
    this.initElements();
    this.bindEvents();

    if (api.isAuthenticated()) {
      this.loadInitialData();
    }
  }

  initElements() {
    this.pumpToggleBtn = document.getElementById("btnPumpToggle");
    this.pumpRing = document.getElementById("pumpStatusRing");
    this.pumpStatusLabel = document.getElementById("pumpStatusLabel");
    this.pumpFlowDisplay = document.getElementById("pumpFlowDisplay");
    this.modeAutoBtn = document.getElementById("btnModeAuto");
    this.modeManualBtn = document.getElementById("btnModeManual");
    this.modeHelperNote = document.getElementById("modeHelperNote");
    this.dryRunBanner = document.getElementById("dryRunWarningBanner");
    this.btnResetDryRun = document.getElementById("btnResetDryRunLockout");
    this.decisionBox = document.getElementById("decisionEngineBox");
    this.zonesContainer = document.getElementById("zonesGridContainer");
    this.eventsTableBody = document.getElementById("irrigationEventsTableBody");
  }

  bindEvents() {
    if (this.pumpToggleBtn) {
      this.pumpToggleBtn.addEventListener("click", () => this.handlePumpToggle());
    }

    if (this.modeAutoBtn) {
      this.modeAutoBtn.addEventListener("click", () => this.setMode("AUTO"));
    }
    if (this.modeManualBtn) {
      this.modeManualBtn.addEventListener("click", () => this.setMode("MANUAL"));
    }

    if (this.btnResetDryRun) {
      this.btnResetDryRun.addEventListener("click", () => this.handleResetDryRun());
    }

    document.addEventListener("languageChanged", () => {
      if (this.pumpState) {
        this.updatePumpUI(this.pumpState);
      }
      if (this.decision) {
        this.updateDecisionUI(this.decision);
      }
      if (this.zones && this.pumpState) {
        this.renderZones(this.zones, this.pumpState);
      }
      if (this.cachedEvents) {
        this.renderEvents(this.cachedEvents);
      }
    });
  }

  async loadInitialData() {
    try {
      const data = await api.getFarmCurrent();
      if (data) {
        this.renderIrrigation(data);
      }
    } catch (e) {
      console.warn("IrrigationManager loadInitialData warning:", e);
    }
  }

  async ensurePumpState() {
    if (!this.pumpState) {
      await this.loadInitialData();
    }
    if (!this.pumpState) {
      this.pumpState = {
        pump_status: "OFF",
        operating_mode: "AUTO",
        flow_rate_lpm: 0.0,
        dry_run_tripped: false,
        valve_1: "CLOSED",
        valve_2: "CLOSED",
        valve_3: "CLOSED"
      };
    }
    return this.pumpState;
  }

  renderIrrigation(data) {
    this.pumpState = data.pump_state;
    this.decision = data.irrigation_decision;
    this.zones = data.zones || [];

    this.updatePumpUI(this.pumpState);
    this.updateDecisionUI(this.decision);
    this.renderZones(this.zones, this.pumpState);
    this.loadEvents();
  }

  updatePumpUI(ps) {
    if (!ps) return;
    const isKn = i18n.currentLang === "kn";
    const isRunning = ps.pump_status === "ON";
    const isTripped = ps.dry_run_tripped;
    const isManual = ps.operating_mode === "MANUAL";

    if (this.pumpRing) {
      this.pumpRing.className = "pump-status-ring";
      if (isTripped) {
        this.pumpRing.classList.add("pump-fault");
        this.pumpRing.innerHTML = "⚠️";
      } else if (isRunning) {
        this.pumpRing.classList.add("pump-running");
        this.pumpRing.innerHTML = "⚡";
      } else {
        this.pumpRing.classList.add("pump-stopped");
        this.pumpRing.innerHTML = "⏹️";
      }
    }

    if (this.pumpStatusLabel) {
      if (isTripped) {
        this.pumpStatusLabel.textContent = isKn ? "ಡ್ರೈ-ರನ್ ಲಾಕ್ ಆಗಿದೆ (TRIPPED)" : "LOCKOUT: DRY-RUN FAULT";
        this.pumpStatusLabel.style.color = "var(--status-critical)";
      } else if (isRunning) {
        this.pumpStatusLabel.textContent = isKn ? "ಮೋಟಾರ್ ಚಾಲನೆಯಲ್ಲಿದೆ (RUNNING)" : "PUMP ACTIVE & RUNNING";
        this.pumpStatusLabel.style.color = "var(--primary-400)";
      } else {
        this.pumpStatusLabel.textContent = isKn ? "ಮೋಟಾರ್ ಆಫ್ ಆಗಿದೆ (STANDBY)" : "PUMP IDLE (STANDBY)";
        this.pumpStatusLabel.style.color = "var(--text-muted)";
      }
    }

    if (this.pumpFlowDisplay) {
      const flowVal = typeof ps.flow_rate_lpm === "number" ? ps.flow_rate_lpm.toFixed(1) : "0.0";
      this.pumpFlowDisplay.textContent = `${isKn ? "ಪ್ರಸ್ತುತ ಹರಿವು" : "Flow Rate"}: ${flowVal} L/min`;
    }

    if (this.pumpToggleBtn) {
      if (isRunning) {
        this.pumpToggleBtn.className = "btn-pump-toggle btn-pump-off";
        this.pumpToggleBtn.innerHTML = `🛑 ${i18n.t("btn_turn_off")}`;
      } else {
        this.pumpToggleBtn.className = "btn-pump-toggle btn-pump-on";
        this.pumpToggleBtn.innerHTML = `💧 ${i18n.t("btn_turn_on")}`;
      }
      this.pumpToggleBtn.disabled = isTripped;
    }

    // Dry run banner
    if (this.dryRunBanner) {
      this.dryRunBanner.style.display = isTripped ? "flex" : "none";
    }

    // Operating Mode: Locked to Auto AI Engine
    if (this.modeAutoBtn) {
      this.modeAutoBtn.classList.add("active");
    }

    // Mode Helper Note
    if (this.modeHelperNote) {
      this.modeHelperNote.innerHTML = isKn
        ? "🤖 <strong>AI ಸ್ವಯಂಚಾಲಿತ ಎಂಜಿನ್:</strong> ಮಣ್ಣಿನ ತೇವಾಂಶ ಮಿತಿ (&lt; 40%) ಆಧರಿಸಿ ನೀರಾವರಿಯನ್ನು ತಾನಾಗಿಯೇ ಸ್ವಯಂಚಾಲಿತವಾಗಿ ನಿರ್ವಹಿಸುತ್ತದೆ."
        : "🤖 <strong>AI Auto Engine:</strong> Automatically triggers precision irrigation when soil moisture drops below threshold (&lt; 40%).";
      this.modeHelperNote.style.borderColor = "var(--border-subtle)";
      this.modeHelperNote.style.color = "var(--text-muted)";
    }
  }

  updateLivePump(packet) {
    if (!this.pumpState) {
      this.pumpState = {
        pump_status: packet.pump_status || "OFF",
        operating_mode: packet.operating_mode || "AUTO",
        flow_rate_lpm: packet.water_flow_lpm || 0.0,
        dry_run_tripped: packet.dry_run_tripped || false,
        valve_1: packet.valve_1 || "CLOSED",
        valve_2: packet.valve_2 || "CLOSED",
        valve_3: packet.valve_3 || "CLOSED"
      };
    } else {
      this.pumpState.pump_status = packet.pump_status;
      this.pumpState.operating_mode = packet.operating_mode;
      this.pumpState.flow_rate_lpm = packet.water_flow_lpm;
      this.pumpState.dry_run_tripped = packet.dry_run_tripped;
      this.pumpState.valve_1 = packet.valve_1;
      this.pumpState.valve_2 = packet.valve_2;
      this.pumpState.valve_3 = packet.valve_3;
    }
    this.updatePumpUI(this.pumpState);

    if (packet.irrigation_decision) {
      this.decision = packet.irrigation_decision;
      this.updateDecisionUI(packet.irrigation_decision);
    }
  }

  updateDecisionUI(dec) {
    if (!this.decisionBox || !dec) return;
    const isKn = i18n.currentLang === "kn";
    const reason = isKn ? (dec.reason_kn || dec.reason_en) : (dec.reason_en || dec.reason_kn);
    const action = isKn ? (dec.action_kn || dec.action) : (dec.action_en || dec.action);
    const badge = isKn ? (dec.badge_kn || dec.badge) : (dec.badge_en || dec.badge);

    this.decisionBox.innerHTML = `
      <div class="decision-badge">
        <span>${badge}</span>
      </div>
      <div class="decision-reason">
        <strong>${i18n.t("decision_engine_title")}:</strong> ${reason}
      </div>
      <div style="font-size: 0.85rem; color: var(--primary-400);">
        ⚡ <strong>${i18n.t("action_label")}</strong> ${action}
      </div>
    `;
  }

  renderZones(zones, pumpState) {
    if (!this.zonesContainer) return;
    const isKn = i18n.currentLang === "kn";
    const ps = pumpState || this.pumpState || {};

    this.zonesContainer.innerHTML = zones.map((z, idx) => {
      const vNum = z.valve_index || (idx + 1);
      const isOpen = ps[`valve_${vNum}`] === "OPEN";
      const btnClass = isOpen ? "valve-btn valve-open" : "valve-btn valve-closed";
      const btnText = isOpen ? i18n.t("valve_open") : i18n.t("valve_closed");

      return `
        <div class="zone-card">
          <div class="zone-header">
            <span class="zone-title">${z.name}</span>
            <button class="${btnClass}" onclick="window.irrigationManager.toggleValve(${vNum}, '${isOpen ? "CLOSED" : "OPEN"}')">
              ${isOpen ? "🟢" : "⚪"} ${btnText}
            </button>
          </div>
          <div style="font-size: 0.85rem; color: var(--text-muted);">
            🌴 ${isKn ? "ತಳಿ" : "Variety"}: ${z.variety} | ${z.tree_count} ${isKn ? "ಮರಗಳು" : "palms"}
          </div>
          <div style="font-size: 0.85rem; color: var(--text-main);">
            📊 ${isKn ? "ಮಣ್ಣಿನ ತೇವಾಂಶ ಮಿತಿ" : "Threshold"}: ${isKn ? "ಕನಿಷ್ಠ" : "Min"} <strong>${z.moisture_threshold_min}%</strong> / ${isKn ? "ಗುರಿ" : "Target"} <strong>${z.moisture_target}%</strong>
          </div>
        </div>
      `;
    }).join("");
  }

  async handlePumpToggle() {
    await this.ensurePumpState();
    const nextAction = this.pumpState.pump_status === "ON" ? "OFF" : "ON";
    
    // Optimistic UI response
    this.pumpToggleBtn.disabled = true;
    try {
      const res = await api.controlPump(nextAction);
      this.pumpState.pump_status = res.pump_status;
      this.pumpState.flow_rate_lpm = res.flow_rate_lpm;
      // Starting pump manually automatically engages MANUAL mode
      if (nextAction === "ON") {
        this.pumpState.operating_mode = "MANUAL";
      }
      this.updatePumpUI(this.pumpState);
      this.loadEvents(true);
    } catch (err) {
      alert(err.message || "Failed to toggle pump");
    } finally {
      this.pumpToggleBtn.disabled = false;
    }
  }

  async toggleValve(valveIndex, action) {
    await this.ensurePumpState();
    try {
      const res = await api.controlValve(valveIndex, action);
      this.pumpState[`valve_${valveIndex}`] = res.action;
      this.renderZones(this.zones, this.pumpState);
    } catch (err) {
      alert(err.message || "Failed to control solenoid valve");
    }
  }

  async setMode(mode) {
    await this.ensurePumpState();

    // 1. Instant optimistic visual feedback on buttons
    if (this.modeAutoBtn && this.modeManualBtn) {
      if (mode === "MANUAL") {
        this.modeManualBtn.classList.add("active");
        this.modeAutoBtn.classList.remove("active");
      } else {
        this.modeAutoBtn.classList.add("active");
        this.modeManualBtn.classList.remove("active");
      }
    }

    try {
      const res = await api.setOperatingMode(mode);
      this.pumpState.operating_mode = res.mode || mode;
      this.updatePumpUI(this.pumpState);

      // Instantly update decision box to show appropriate status
      const isKn = i18n.currentLang === "kn";
      if (mode === "MANUAL") {
        this.decision = {
          badge: "⚡ Manual Override Active",
          badge_en: "⚡ Manual Override Active",
          badge_kn: "⚡ ಮ್ಯಾನುಯಲ್ ನಿಯಂತ್ರಣ ಸಕ್ರಿಯ",
          reason_en: "MANUAL OVERRIDE ENGAGED: Automatic AI cycles suspended. You have direct authority over the pump and solenoid valves.",
          reason_kn: "ಮ್ಯಾನುಯಲ್ ನಿಯಂತ್ರಣ ಸಕ್ರಿಯವಾಗಿದೆ: ಸ್ವಯಂಚಾಲಿತ AI ಚಕ್ರಗಳನ್ನು ಸ್ಥಗಿತಗೊಳಿಸಲಾಗಿದೆ. ಮೋಟಾರ್ ಮತ್ತು ವಾಲ್ವ್‌ಗಳು ನಿಮ್ಮ ನೇರ ನಿಯಂತ್ರಣದಲ್ಲಿವೆ.",
          action_en: "Tap 'START PUMP' to begin irrigating, or toggle valves for specific blocks below.",
          action_kn: "ನೀರಾವರಿ ಪ್ರಾರಂಭಿಸಲು 'ಮೋಟಾರ್ ಚಾಲು ಮಾಡಿ' ಒತ್ತಿ, ಅಥವಾ ವಾಲ್ವ್‌ಗಳನ್ನು ನಿಯಂತ್ರಿಸಿ."
        };
      } else {
        // Switching back to AUTO: re-evaluate
        const data = await api.getFarmCurrent();
        if (data && data.irrigation_decision) {
          this.decision = data.irrigation_decision;
        }
      }
      this.updateDecisionUI(this.decision);

    } catch (err) {
      console.error("Mode switch error:", err);
      alert(err.message || "Failed to change operating mode");
      if (this.pumpState) this.updatePumpUI(this.pumpState);
    }
  }

  async handleResetDryRun() {
    await this.ensurePumpState();
    try {
      await api.resetDryRunLockout();
      this.pumpState.dry_run_tripped = false;
      this.pumpState.pump_status = "OFF";
      this.updatePumpUI(this.pumpState);
      alert(i18n.currentLang === "kn" ? "ಡ್ರೈ-ರನ್ ಲಾಕ್ ತೆರವುಗೊಳಿಸಲಾಗಿದೆ. ಮೋಟಾರ್ ಈಗ ಸಿದ್ಧವಾಗಿದೆ." : "Dry-run protection cleared. System ready.");
    } catch (err) {
      alert(err.message || "Failed to reset lockout");
    }
  }

  renderEvents(events) {
    if (!this.eventsTableBody || !events) return;
    const isKn = i18n.currentLang === "kn";
    this.eventsTableBody.innerHTML = events.slice(0, 5).map(e => `
      <tr>
        <td>${new Date(e.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
        <td><strong>${e.zone_name.split('-')[0]}</strong></td>
        <td>${e.duration_minutes} ${isKn ? "ನಿಮಿಷ" : "min"}</td>
        <td>${e.water_used_litres} L</td>
        <td><span class="sensor-badge sensor-badge-online">${isKn ? (e.trigger_type.includes("AUTO") ? "ಸ್ವಯಂಚಾಲಿತ AI" : "ಮ್ಯಾನುಯಲ್") : e.trigger_type.split(' ')[0]}</span></td>
      </tr>
    `).join("");
  }

  async loadEvents(force = false) {
    if (!this.eventsTableBody) return;
    if (this.cachedEvents && !force) {
      this.renderEvents(this.cachedEvents);
      return;
    }
    try {
      const events = await api.request("/api/irrigation/events");
      this.cachedEvents = events;
      this.renderEvents(events);
    } catch (e) {
      console.warn("Events load error:", e);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.irrigationManager = new IrrigationManager();
});
