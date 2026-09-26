/**
 * Farm History & Activity Logs Manager (No Charts)
 * Handles Irrigation History, Safety Alerts/Faults History, and Telemetry Records.
 * Supports editing, deleting, and logging past irrigation events, as well as resolving and deleting alerts.
 */

class HistoryManager {
  constructor() {
    this.currentFilter = "7days";
    this.cachedIrrigation = null;
    this.cachedAlerts = null;
    this.cachedTelemetry = null;
    this.initFilterButtons();
    this.bindEvents();
    this.bindModalEvents();
  }

  initFilterButtons() {
    const buttons = document.querySelectorAll(".filter-btn");
    buttons.forEach(btn => {
      btn.addEventListener("click", () => {
        buttons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        this.currentFilter = btn.getAttribute("data-range");
        this.loadHistory();
      });
    });
  }

  bindEvents() {
    document.addEventListener("languageChanged", () => {
      if (this.cachedIrrigation || this.cachedAlerts || this.cachedTelemetry) {
        this.renderFromCache();
      }
    });

    // Add Past Event button
    const btnAdd = document.getElementById("btnOpenAddEventModal");
    if (btnAdd) {
      btnAdd.addEventListener("click", () => this.openAddModal());
    }
  }

  bindModalEvents() {
    const modal = document.getElementById("modalEditIrrigationEvent");
    const btnClose = document.getElementById("btnCloseEventModal");
    const btnCancel = document.getElementById("btnCancelEventModal");
    const form = document.getElementById("formEditIrrigationEvent");
    const btnDelete = document.getElementById("btnDeleteEventFromModal");
    const durationInput = document.getElementById("editEventDuration");
    const waterInput = document.getElementById("editEventWater");

    if (btnClose) {
      btnClose.addEventListener("click", () => this.closeEventModal());
    }
    if (btnCancel) {
      btnCancel.addEventListener("click", () => this.closeEventModal());
    }

    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) this.closeEventModal();
      });
    }

    // Auto-calculate water when duration changes
    if (durationInput && waterInput) {
      durationInput.addEventListener("input", () => {
        const mins = parseFloat(durationInput.value) || 0;
        waterInput.value = Math.round(mins * 45.0);
      });
    }

    if (form) {
      form.addEventListener("submit", (e) => this.handleEventFormSubmit(e));
    }

    if (btnDelete) {
      btnDelete.addEventListener("click", () => {
        const id = document.getElementById("editEventId").value;
        if (id) {
          this.closeEventModal();
          this.confirmDeleteEvent(parseInt(id));
        }
      });
    }
  }

  // Compatibility hook
  renderCharts() {
    if (!this.cachedIrrigation) {
      this.loadHistory();
    } else {
      this.renderFromCache();
    }
  }

  renderFromCache() {
    if (this.cachedIrrigation) this.renderIrrigationLogs(this.cachedIrrigation);
    if (this.cachedAlerts) this.renderAlertsLogs(this.cachedAlerts);
    if (this.cachedTelemetry) this.renderTelemetryLogs(this.cachedTelemetry);
    if (this.cachedIrrigation && this.cachedTelemetry && this.cachedAlerts) {
      this.updateSummaryStats(this.cachedIrrigation, this.cachedTelemetry, this.cachedAlerts);
    }
  }

  async loadHistory() {
    try {
      const [irrigationData, alerts, telemetryData] = await Promise.all([
        api.getIrrigationEvents(this.currentFilter),
        api.getAlerts(),
        api.getHistory(this.currentFilter)
      ]);

      this.cachedIrrigation = irrigationData;
      this.cachedAlerts = alerts;
      this.cachedTelemetry = telemetryData;

      this.renderFromCache();
    } catch (err) {
      console.error("Failed to load history logs:", err);
    }
  }

  renderIrrigationLogs(data) {
    const tbody = document.getElementById("historyIrrigationTableBody");
    const badge = document.getElementById("irrigationLogCountBadge");
    if (!tbody) return;

    const events = (data.events || []).slice(0, 6);
    const isKn = i18n.currentLang === "kn";

    if (badge) {
      badge.textContent = `${events.length} ${isKn ? "ನೀರಾವರಿ ಘಟನೆಗಳು" : "events logged"}`;
    }

    if (events.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 24px;">${isKn ? "ಆಯ್ಕೆಮಾಡಿದ ಅವಧಿಯಲ್ಲಿ ಯಾವುದೇ ನೀರಾವರಿ ದಾಖಲೆಗಳಿಲ್ಲ" : "No irrigation events recorded for this period."}</td></tr>`;
      return;
    }

    tbody.innerHTML = events.map(e => {
      const isCompleted = e.status === "COMPLETED";
      const statusBadge = isCompleted ?
        `<span class="sensor-badge sensor-badge-online">✓ ${isKn ? "ಪೂರ್ಣಗೊಂಡಿದೆ" : "COMPLETED"}</span>` :
        `<span class="sensor-badge sensor-badge-offline">⚠️ ${e.status}</span>`;

      const { zone, reason } = this.getTranslatedIrrigationEvent(e, isKn);

      return `
        <tr>
          <td>
            <strong>${e.start_time}</strong>
          </td>
          <td>
            <span style="color: var(--text-bright); font-weight: 700;">${zone}</span>
          </td>
          <td>${e.duration_minutes} ${isKn ? "ನಿಮಿಷ" : "min"}</td>
          <td>
            <strong style="color: #38bdf8;">${e.water_used_litres} L</strong>
          </td>
          <td>
            <span style="font-size: 0.85rem; color: var(--primary-400); font-weight: 600;">
              ${isKn ? (e.trigger_type.includes("AUTO") ? "ಸ್ವಯಂಚಾಲಿತ AI" : e.trigger_type.includes("Smart") ? "ಸ್ಮಾರ್ಟ್ AI ಎಂಜಿನ್" : "ಮ್ಯಾನುಯಲ್") : e.trigger_type}
            </span>
          </td>
          <td>${statusBadge}</td>
          <td style="font-size: 0.85rem; color: var(--text-muted); max-width: 260px; line-height: 1.4;">
            ${reason}
          </td>
          <td style="text-align: center; white-space: nowrap;">
            <button class="btn-action-edit" onclick="window.analyticsManager.openEditModal(${e.id})" title="${isKn ? "ತಿದ್ದಿ" : "Edit"}">
              ✏️ ${isKn ? "ತಿದ್ದಿ" : "Edit"}
            </button>
            <button class="btn-action-delete" onclick="window.analyticsManager.confirmDeleteEvent(${e.id})" title="${isKn ? "ಅಳಿಸಿ" : "Delete"}">
              🗑️ ${isKn ? "ಅಳಿಸಿ" : "Delete"}
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  getTranslatedIrrigationEvent(e, isKn) {
    if (!isKn) {
      return {
        zone: e.zone_name,
        reason: e.reason || "--"
      };
    }

    let zone = e.zone_name || "";
    if (zone.includes("Zone 1")) zone = "ವಲಯ 1 - ಮುಖ್ಯ ದಕ್ಷಿಣ ತೋಟ";
    else if (zone.includes("Zone 2")) zone = "ವಲಯ 2 - ಮಿಶ್ರಬೆಳೆ (ಕೋಕೋ/ಮೆಣಸು)";
    else if (zone.includes("Zone 3")) zone = "ವಲಯ 3 - ಸಸಿ ಮಡಿ (ನರ್ಸರಿ)";

    let reason = e.reason || "--";
    const rLower = (e.reason || "").toLowerCase();
    if (rLower.includes("diurnal") || rLower.includes("daytime") || rLower.includes("40%")) {
      reason = "ಹೆಚ್ಚಿನ ಬಿಸಿಲಿನಿಂದಾಗಿ ಮಣ್ಣಿನ ತೇವಾಂಶ 40% ಕ್ಕಿಂತ ಕಡಿಮೆಯಾದ್ದರಿಂದ ಸ್ವಯಂಚಾಲಿತ ಹನಿ ನೀರಾವರಿ.";
    } else if (rLower.includes("afternoon") || rLower.includes("deficit")) {
      reason = "ಮಧ್ಯಾಹ್ನದ ನೀರಿನ ಕೊರತೆ ಪೂರೈಸಲು ನಿಗದಿತ ಹನಿ ನೀರಾವರಿ ಚಕ್ರ.";
    } else if (rLower.includes("manual farmer") || rLower.includes("farmer initiated")) {
      reason = "ರೈತರು ನೇರವಾಗಿ ಪ್ರಾರಂಭಿಸಿದ ಮ್ಯಾನುಯಲ್ ನೀರಾವರಿ ಚಕ್ರ.";
    } else if (rLower.includes("scheduled")) {
      reason = "ಮುಂಜಾನೆಯ ನಿಗದಿತ ಹನಿ ನೀರಾವರಿ ಚಕ್ರ.";
    }

    return { zone, reason };
  }

  renderAlertsLogs(alerts) {
    const tbody = document.getElementById("historyAlertsTableBody");
    const badge = document.getElementById("alertsLogCountBadge");
    if (!tbody) return;

    const isKn = i18n.currentLang === "kn";
    const alertsList = (alerts || []).slice(0, 6);
    if (badge) {
      badge.textContent = `${alertsList.length} ${isKn ? "ದಾಖಲಾದ ಎಚ್ಚರಿಕೆಗಳು" : "logged events"}`;
    }

    if (!alertsList || alertsList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 24px;">${isKn ? "ಯಾವುದೇ ದೋಷಗಳು ಅಥವಾ ತುರ್ತು ಎಚ್ಚರಿಕೆಗಳು ದಾಖಲಾಗಿಲ್ಲ (ಎಲ್ಲವೂ ಸುರಕ್ಷಿತ)" : "Zero faults or critical alerts recorded. System operated safely."}</td></tr>`;
      return;
    }

    tbody.innerHTML = alertsList.map(a => {
      const isCritical = a.severity === "CRITICAL";
      const isWarning = a.severity === "WARNING";
      const sevBadge = isCritical ?
        `<span class="action-priority-badge priority-high">${isKn ? "ತುರ್ತು" : "CRITICAL"}</span>` :
        isWarning ?
        `<span class="action-priority-badge priority-medium">${isKn ? "ಎಚ್ಚರಿಕೆ" : "WARNING"}</span>` :
        `<span class="action-priority-badge priority-low">${isKn ? "ಮಾಹಿತಿ" : "INFO"}</span>`;

      const catText = isKn ? (a.category === "PUMP" ? "ಪಂಪ್" : a.category === "SAFETY" ? "ಸುರಕ್ಷತೆ" : a.category === "SOIL" ? "ಮಣ್ಣು" : a.category === "ENVIRONMENT" ? "ಪರಿಸರ" : a.category) : a.category;

      const formattedDate = new Date(a.timestamp).toLocaleString(isKn ? "kn-IN" : "en-US", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
      });

      const { title, message, action } = this.getTranslatedAlert(a, isKn);

      return `
        <tr>
          <td><strong>${formattedDate}</strong></td>
          <td><span style="font-weight: 700; color: var(--text-muted);">${catText}</span></td>
          <td>${sevBadge}</td>
          <td>
            <strong style="color: var(--text-bright);">${title}</strong>
            <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 2px; line-height: 1.4;">${message}</div>
          </td>
          <td style="font-size: 0.85rem; color: var(--primary-400); line-height: 1.4;">
            ${action}
          </td>
          <td>
            <span class="sensor-badge ${a.is_resolved ? 'sensor-badge-online' : 'sensor-badge-offline'}">
              ${a.is_resolved ? (isKn ? 'ಪರಿಹರಿಸಲಾಗಿದೆ' : 'Resolved') : (isKn ? 'ಸಕ್ರಿಯ' : 'Active')}
            </span>
          </td>
          <td style="text-align: center; white-space: nowrap;">
            ${!a.is_resolved ? `
              <button class="btn-action-resolve" onclick="window.analyticsManager.resolveAlert(${a.id})" title="${isKn ? "ಪರಿಹರಿಸಿ" : "Resolve"}">
                ✓ ${isKn ? "ಪರಿಹರಿಸಿ" : "Resolve"}
              </button>
            ` : ""}
            <button class="btn-action-delete" onclick="window.analyticsManager.deleteAlert(${a.id})" title="${isKn ? "ಅಳಿಸಿ" : "Delete"}">
              🗑️ ${isKn ? "ಅಳಿಸಿ" : "Delete"}
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  getTranslatedAlert(a, isKn) {
    if (!isKn) {
      return {
        title: a.title,
        message: a.message,
        action: a.action_recommendation || "--"
      };
    }

    if (a.title_kn && a.message_kn) {
      return {
        title: a.title_kn,
        message: a.message_kn,
        action: a.action_recommendation_kn || a.action_recommendation || "--"
      };
    }

    const tLower = (a.title || "").toLowerCase();
    const mLower = (a.message || "").toLowerCase();

    if (tLower.includes("dry-run") || tLower.includes("dry run") || mLower.includes("flow meter detected 0.0") || mLower.includes("impeller burnout")) {
      return {
        title: "ಡ್ರೈ-ರನ್ ರಕ್ಷಣಾ ಲಾಕ್ ಸಕ್ರಿಯಗೊಂಡಿದೆ (TRIPPED)",
        message: "ಮೋಟಾರ್ ಚಾಲನೆಯಲ್ಲಿದ್ದರೂ ನೀರಿನ ಹರಿವು 0.0 L/min ಎಂದು ಸಂವೇದಕ ಪತ್ತೆಮಾಡಿದೆ. ಇಂಪೆಲ್ಲರ್ ಸುಟ್ಟುಹೋಗುವುದನ್ನು ತಪ್ಪಿಸಲು ಮೋಟಾರ್ ತಕ್ಷಣ ಸ್ಥಗಿತಗೊಳಿಸಿ ಎಲ್ಲಾ ವಾಲ್ವ್‌ಗಳನ್ನು ಮುಚ್ಚಲಾಗಿದೆ.",
        action: "ಪಂಪ್ ಇನ್‌ಲೆಟ್, ಫುಟ್-ವಾಲ್ವ್ ಪ್ರೈಮಿಂಗ್, ಏರ್ ಲಾಕ್ ಅಥವಾ ಪೈಪ್ ಬ್ಲಾಕ್ ಆಗಿದೆಯೇ ಪರೀಕ್ಷಿಸಿ, ನಂತರ 'ಡ್ರೈ-ರನ್ ಲಾಕ್ ತೆರವುಗೊಳಿಸಿ' ಬಟನ್ ಒತ್ತಿರಿ."
      };
    }

    if (tLower.includes("low tank") || mLower.includes("tank level") || mLower.includes("storage")) {
      return {
        title: "ತುರ್ತು ಸ್ಥಗಿತ: ನೀರಿನ ಟ್ಯಾಂಕ್ ಮಟ್ಟ ತೀರಾ ಕಡಿಮೆ",
        message: "ನೀರಿನ ಟ್ಯಾಂಕ್ ಮಟ್ಟ 15% ಕ್ಕಿಂತ ಕಡಿಮೆಯಾಗಿದೆ. ಮೋಟಾರ್ ರಕ್ಷಣೆಗಾಗಿ ಮತ್ತು ಡ್ರೈ-ರನ್ ಹಾನಿ ತಪ್ಪಿಸಲು ಪಂಪ್ ನಿಲ್ಲಿಸಲಾಗಿದೆ.",
        action: "ಮೋಟಾರ್ ಮರುಪ್ರಾರಂಭಿಸುವ ಮುನ್ನ ಟ್ಯಾಂಕ್‌ಗೆ ನೀರು ತುಂಬಿಸಿ ಅಥವಾ ಬದಲಿ ನೀರಿನ ಮೂಲವನ್ನು ಸಂಪರ್ಕಿಸಿ."
      };
    }

    if (tLower.includes("koleroga") || mLower.includes("koleroga") || mLower.includes("fruit rot") || mLower.includes("phytophthora")) {
      return {
        title: "ಕೊಳೆರೋಗ (ಮಹಾಲಿ) ಹರಡುವ ಹೆಚ್ಚಿನ ಅಪಾಯದ ಮುನ್ಸೂಚನೆ",
        message: "ವಾತಾವರಣದಲ್ಲಿ ತೇವಾಂಶ 80% ಕ್ಕಿಂತ ಹೆಚ್ಚಿದೆ. ಫೈಟೋಫ್ತೋರಾ ಶಿಲೀಂಧ್ರ ರೋಗಾಣುಗಳು ಹರಡಲು ಇದು ಪೂರಕ ವಾತಾವರಣವಾಗಿದೆ.",
        action: "ಅಡಿಕೆ ಗೊನೆಗಳನ್ನು ಪರಿಶೀಲಿಸಿ. ಅಂಟು ಸಹಿತ 1% ಬೋರ್ಡೋ ದ್ರಾವಣವನ್ನು ತಕ್ಷಣ ಸಿಂಪಡಿಸಿ."
      };
    }

    return {
      title: a.title,
      message: a.message,
      action: a.action_recommendation || "--"
    };
  }

  renderTelemetryLogs(data) {
    const tbody = document.getElementById("historyTelemetryTableBody");
    if (!tbody) return;

    const records = (data.records || []).slice(0, 6);
    const isKn = i18n.currentLang === "kn";

    if (records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">${isKn ? "ಯಾವುದೇ ಸಂವೇದಕ ದಾಖಲೆಗಳಿಲ್ಲ" : "No telemetry logs recorded."}</td></tr>`;
      return;
    }

    tbody.innerHTML = records.map(r => `
      <tr>
        <td><strong>${r.timestamp}</strong></td>
        <td>
          <span style="font-weight: 700; color: ${r.soil_moisture < 40 ? '#ef4444' : '#10b981'};">
            ${r.soil_moisture.toFixed(1)}%
          </span>
        </td>
        <td>${r.soil_ph.toFixed(2)} pH</td>
        <td>
          <span style="font-size: 0.85rem;">
            N:<strong>${r.nitrogen.toFixed(0)}</strong> | P:<strong>${r.phosphorus.toFixed(0)}</strong> | K:<strong>${r.potassium.toFixed(0)}</strong>
          </span>
        </td>
        <td>
          <span style="color: #38bdf8; font-weight: 700;">${r.tank_level_pct.toFixed(0)}%</span>
        </td>
        <td>
          ${r.temperature_c.toFixed(1)}°C / ${r.humidity_pct.toFixed(0)}%
        </td>
      </tr>
    `).join("");
  }

  updateSummaryStats(irrigationData, telemetryData, alerts) {
    const isKn = i18n.currentLang === "kn";

    // Water
    const totalWaterEl = document.getElementById("historyTotalWater");
    const waterSubEl = document.getElementById("historyWaterSub");
    if (totalWaterEl) {
      totalWaterEl.textContent = `${Math.round(irrigationData.total_water_litres).toLocaleString()} L`;
    }
    if (waterSubEl) {
      waterSubEl.textContent = isKn ? `${irrigationData.total_events} ನೀರಾವರಿ ಚಕ್ರಗಳು` : `${irrigationData.total_events} automated cycles`;
    }

    // Runtime
    const runtimeEl = document.getElementById("historyTotalRuntime");
    const eventsCountEl = document.getElementById("historyEventsCount");
    if (runtimeEl) {
      const hours = Math.floor(irrigationData.total_minutes / 60);
      const mins = Math.round(irrigationData.total_minutes % 60);
      runtimeEl.textContent = hours > 0 ?
        `${hours}${isKn ? 'ಗಂ ' : 'h '}${mins}${isKn ? 'ನಿಮಿಷ' : 'm'}` :
        `${mins} ${isKn ? 'ನಿಮಿಷ' : 'mins'}`;
    }
    if (eventsCountEl) {
      eventsCountEl.textContent = isKn ? "ಒಟ್ಟು ಪಂಪ್ ಚಾಲನಾ ಸಮಯ" : "Total active pumping";
    }

    // Moisture
    const avgMoistureEl = document.getElementById("historyAvgMoisture");
    const moistureTrendEl = document.getElementById("historyMoistureTrend");
    if (avgMoistureEl && telemetryData.stats?.moisture) {
      avgMoistureEl.textContent = `${telemetryData.stats.moisture.avg}%`;
    }
    if (moistureTrendEl && telemetryData.stats?.moisture) {
      const m = telemetryData.stats.moisture;
      moistureTrendEl.textContent = m.trend === "rising" ?
        (isKn ? "↗ ತೇವಾಂಶ ಏರಿಕೆಯಲ್ಲಿದೆ" : "↗ Hydration rising") :
        (isKn ? "↘ ತೇವಾಂಶ ಇಳಿಕೆಯಲ್ಲಿದೆ" : "↘ Evapotranspiration gradual");
    }

    // Alerts
    const alertsCountEl = document.getElementById("historyAlertsCount");
    if (alertsCountEl) {
      alertsCountEl.textContent = `${alerts.length}`;
    }
  }

  // ==========================================
  // Modal & CRUD Operations for Pre-Events
  // ==========================================

  openAddModal() {
    const isKn = i18n.currentLang === "kn";
    document.getElementById("editEventId").value = "";
    document.getElementById("modalEventTitle").textContent = isKn ? "➕ ಹಿಂದಿನ ನೀರಾವರಿ ದಾಖಲೆ ಸೇರಿಸಿ" : "➕ Log Past Irrigation Event";
    
    // Default values
    document.getElementById("editEventZone").value = "Zone 1 - Main South Block";
    document.getElementById("editEventDuration").value = "30";
    document.getElementById("editEventWater").value = "1350";
    document.getElementById("editEventTrigger").value = "Manual Farmer Override";
    document.getElementById("editEventStatus").value = "COMPLETED";
    document.getElementById("editEventReason").value = isKn ? "ರೈತರ ನೇರ ಮ್ಯಾನುಯಲ್ ಹನಿ ನೀರಾವರಿ ಚಕ್ರ." : "Manual irrigation cycle performed by farmer.";

    const btnDelete = document.getElementById("btnDeleteEventFromModal");
    if (btnDelete) btnDelete.style.display = "none";

    const modal = document.getElementById("modalEditIrrigationEvent");
    if (modal) modal.classList.add("open");
  }

  openEditModal(eventId) {
    if (!this.cachedIrrigation || !this.cachedIrrigation.events) return;
    const event = this.cachedIrrigation.events.find(e => e.id === eventId);
    if (!event) return;

    const isKn = i18n.currentLang === "kn";
    document.getElementById("editEventId").value = event.id;
    document.getElementById("modalEventTitle").textContent = isKn ? "✏️ ನೀರಾವರಿ ದಾಖಲೆ ತಿದ್ದುಪಡಿ" : "✏️ Edit Irrigation Event";

    // Select or set zone
    const zoneSelect = document.getElementById("editEventZone");
    if (zoneSelect) {
      let matched = false;
      for (let opt of zoneSelect.options) {
        if (opt.value === event.zone_name) {
          zoneSelect.value = event.zone_name;
          matched = true;
          break;
        }
      }
      if (!matched && zoneSelect.options.length > 0) {
        zoneSelect.value = zoneSelect.options[0].value;
      }
    }

    document.getElementById("editEventDuration").value = event.duration_minutes || 30;
    document.getElementById("editEventWater").value = event.water_used_litres || 1350;

    const triggerSelect = document.getElementById("editEventTrigger");
    if (triggerSelect) {
      triggerSelect.value = event.trigger_type || "Manual Farmer Override";
    }

    const statusSelect = document.getElementById("editEventStatus");
    if (statusSelect) {
      statusSelect.value = event.status || "COMPLETED";
    }

    document.getElementById("editEventReason").value = event.reason || "";

    const btnDelete = document.getElementById("btnDeleteEventFromModal");
    if (btnDelete) btnDelete.style.display = "inline-block";

    const modal = document.getElementById("modalEditIrrigationEvent");
    if (modal) modal.classList.add("open");
  }

  closeEventModal() {
    const modal = document.getElementById("modalEditIrrigationEvent");
    if (modal) modal.classList.remove("open");
  }

  async handleEventFormSubmit(e) {
    e.preventDefault();
    const isKn = i18n.currentLang === "kn";
    const eventId = document.getElementById("editEventId").value;
    const zone = document.getElementById("editEventZone").value;
    const duration = parseFloat(document.getElementById("editEventDuration").value) || 30;
    const water = parseFloat(document.getElementById("editEventWater").value) || (duration * 45);
    const trigger = document.getElementById("editEventTrigger").value;
    const status = document.getElementById("editEventStatus").value;
    const reason = document.getElementById("editEventReason").value.trim();

    const payload = {
      zone_name: zone,
      duration_minutes: duration,
      water_used_litres: water,
      trigger_type: trigger,
      status: status,
      reason: reason
    };

    try {
      if (eventId) {
        // Update
        const res = await api.updateIrrigationEvent(parseInt(eventId), payload);
        if (res.success && res.event && this.cachedIrrigation) {
          const idx = this.cachedIrrigation.events.findIndex(x => x.id === parseInt(eventId));
          if (idx !== -1) {
            this.cachedIrrigation.events[idx] = res.event;
          }
        }
      } else {
        // Create
        const res = await api.createIrrigationEvent(payload);
        if (res.success && res.event && this.cachedIrrigation) {
          this.cachedIrrigation.events.unshift(res.event);
        }
      }

      // Recalculate totals
      if (this.cachedIrrigation && this.cachedIrrigation.events) {
        this.cachedIrrigation.total_events = this.cachedIrrigation.events.length;
        this.cachedIrrigation.total_water_litres = this.cachedIrrigation.events.reduce((sum, x) => sum + (x.water_used_litres || 0), 0);
        this.cachedIrrigation.total_minutes = this.cachedIrrigation.events.reduce((sum, x) => sum + (x.duration_minutes || 0), 0);
      }

      this.closeEventModal();
      this.renderFromCache();

      // Show toast
      alert(isKn ? (eventId ? "ನೀರಾವರಿ ದಾಖಲೆಯನ್ನು ಯಶಸ್ವಿಯಾಗಿ ತಿದ್ದಲಾಗಿದೆ." : "ಹೊಸ ನೀರಾವರಿ ದಾಖಲೆ ಯಶಸ್ವಿಯಾಗಿ ಸೇರಿಸಲಾಗಿದೆ.") : (eventId ? "Irrigation event updated successfully." : "Irrigation event logged successfully."));
    } catch (err) {
      console.error("Save event error:", err);
      alert(err.message || "Failed to save irrigation event");
    }
  }

  async confirmDeleteEvent(eventId) {
    const isKn = i18n.currentLang === "kn";
    const confirmMsg = isKn
      ? "ಈ ನೀರಾವರಿ ದಾಖಲೆಯನ್ನು ಅಳಿಸಲು ಖಚಿತವಾಗಿ ಬಯಸುವಿರಾ? ಈ ಕ್ರಿಯೆಯನ್ನು ಹಿಂಪಡೆಯಲಾಗುವುದಿಲ್ಲ."
      : "Are you sure you want to delete this irrigation event? This action cannot be undone.";

    if (!confirm(confirmMsg)) return;

    try {
      await api.deleteIrrigationEvent(eventId);
      if (this.cachedIrrigation && this.cachedIrrigation.events) {
        this.cachedIrrigation.events = this.cachedIrrigation.events.filter(e => e.id !== eventId);
        this.cachedIrrigation.total_events = this.cachedIrrigation.events.length;
        this.cachedIrrigation.total_water_litres = this.cachedIrrigation.events.reduce((sum, x) => sum + (x.water_used_litres || 0), 0);
        this.cachedIrrigation.total_minutes = this.cachedIrrigation.events.reduce((sum, x) => sum + (x.duration_minutes || 0), 0);
      }

      this.renderFromCache();
      alert(isKn ? "ನೀರಾವರಿ ದಾಖಲೆಯನ್ನು ಅಳಿಸಲಾಗಿದೆ." : "Irrigation event deleted successfully.");
    } catch (err) {
      console.error("Delete event error:", err);
      alert(err.message || "Failed to delete irrigation event");
    }
  }

  async deleteAlert(alertId) {
    const isKn = i18n.currentLang === "kn";
    const confirmMsg = isKn
      ? "ಈ ಎಚ್ಚರಿಕೆಯ ದಾಖಲೆಯನ್ನು ಅಳಿಸಲು ಖಚಿತವಾಗಿ ಬಯಸುವಿರಾ?"
      : "Are you sure you want to delete this alert record?";

    if (!confirm(confirmMsg)) return;

    try {
      await api.deleteAlert(alertId);
      if (this.cachedAlerts) {
        this.cachedAlerts = this.cachedAlerts.filter(a => a.id !== alertId);
      }
      this.renderFromCache();
    } catch (err) {
      console.error("Delete alert error:", err);
      alert(err.message || "Failed to delete alert");
    }
  }

  async resolveAlert(alertId) {
    const isKn = i18n.currentLang === "kn";
    try {
      await api.resolveAlert(alertId);
      if (this.cachedAlerts) {
        const a = this.cachedAlerts.find(x => x.id === alertId);
        if (a) a.is_resolved = true;
      }
      this.renderFromCache();
    } catch (err) {
      console.error("Resolve alert error:", err);
      alert(err.message || "Failed to resolve alert");
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.analyticsManager = new HistoryManager();
});
