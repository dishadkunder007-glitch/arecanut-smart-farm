/**
 * Farmer Overview & Main Dashboard Logic
 * Displays Overall Farm Status 🟢🟡🔴, Daily Farm Summary, and Today's Actions.
 */

class FarmerDashboard {
  constructor() {
    this.currentData = null;
    this.initNavigation();
    this.bindEvents();
    this.setupLiveTelemetry();
    if (api.isAuthenticated()) {
      this.loadData();
    }
  }

  initNavigation() {
    const navLinks = document.querySelectorAll(".nav-link, .mobile-nav-item");
    navLinks.forEach(link => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const targetView = link.getAttribute("data-target");
        this.switchView(targetView);
        this.closeMobileDrawer();
      });
    });

    const hamburgerBtn = document.getElementById("hamburgerBtn");
    const drawer = document.getElementById("mobileNavDrawer");
    const backdrop = document.getElementById("mobileNavBackdrop");
    const btnClose = document.getElementById("btnCloseMobileNav");

    if (hamburgerBtn) {
      hamburgerBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleMobileDrawer();
      });
    }
    if (backdrop) {
      backdrop.addEventListener("click", () => this.closeMobileDrawer());
    }
    // Settings & Sub-Modals
    const modalSettings = document.getElementById("modalSettings");
    const modalEditUserName = document.getElementById("modalEditUserName");
    const modalChangePassword = document.getElementById("modalChangePassword");
    const modalEditUserPhone = document.getElementById("modalEditUserPhone");

    const btnDrawerSettings = document.getElementById("btnDrawerSettings");
    const btnDesktopSettings = document.getElementById("btnDesktopSettings");
    const btnDrawerAbout = document.getElementById("btnDrawerAbout");
    const btnDesktopAbout = document.getElementById("btnDesktopAbout");
    const btnCloseSettings = document.getElementById("btnCloseSettingsModal");

    const openModal = (m) => {
      this.closeMobileDrawer();
      if (m) m.classList.add("open");
    };
    const closeModal = (m) => {
      if (m) m.classList.remove("open");
    };

    if (btnDrawerSettings) {
      btnDrawerSettings.addEventListener("click", () => {
        openModal(modalSettings);
        const scrollArea = modalSettings?.querySelector(".settings-content-scroll");
        if (scrollArea) scrollArea.scrollTop = 0;
      });
    }
    if (btnDesktopSettings) {
      btnDesktopSettings.addEventListener("click", () => {
        openModal(modalSettings);
        const scrollArea = modalSettings?.querySelector(".settings-content-scroll");
        if (scrollArea) scrollArea.scrollTop = 0;
      });
    }

    const openAboutSection = () => {
      openModal(modalSettings);
      setTimeout(() => {
        const aboutSec = document.getElementById("settingsSectionAbout");
        if (aboutSec) aboutSec.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 120);
    };

    if (btnDrawerAbout) btnDrawerAbout.addEventListener("click", openAboutSection);
    if (btnDesktopAbout) btnDesktopAbout.addEventListener("click", openAboutSection);

    if (btnCloseSettings) btnCloseSettings.addEventListener("click", () => closeModal(modalSettings));

    [modalSettings, modalEditUserName, modalChangePassword, modalEditUserPhone].forEach((m) => {
      if (m) {
        m.addEventListener("click", (e) => {
          if (e.target === m) closeModal(m);
        });
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closeMobileDrawer();
        [modalSettings, modalEditUserName, modalChangePassword, modalEditUserPhone].forEach(closeModal);
      }
    });
  }

  toggleMobileDrawer() {
    const drawer = document.getElementById("mobileNavDrawer");
    const backdrop = document.getElementById("mobileNavBackdrop");
    const hamburger = document.getElementById("hamburgerBtn");
    if (drawer) drawer.classList.toggle("open");
    if (backdrop) backdrop.classList.toggle("open");
    if (hamburger) hamburger.classList.toggle("active");
  }

  closeMobileDrawer() {
    const drawer = document.getElementById("mobileNavDrawer");
    const backdrop = document.getElementById("mobileNavBackdrop");
    const hamburger = document.getElementById("hamburgerBtn");
    if (drawer) drawer.classList.remove("open");
    if (backdrop) backdrop.classList.remove("open");
    if (hamburger) hamburger.classList.remove("active");
  }

  switchView(viewId) {
    if (!viewId) return;

    // Enforce role restriction: view-oled (IoT Monitoring) and view-admin are strictly Admin-only
    const isAdmin = window.auth?.currentUser?.role === "admin";
    if ((viewId === "view-oled" || viewId === "view-admin") && !isAdmin) {
      viewId = "view-home";
    }

    // Update nav states
    document.querySelectorAll(".nav-link, .mobile-nav-item").forEach(el => {
      if (el.getAttribute("data-target") === viewId) {
        el.classList.add("active");
      } else {
        el.classList.remove("active");
      }
    });

    // Update section visibility
    document.querySelectorAll(".view-section").forEach(sec => {
      if (sec.id === viewId) {
        sec.classList.add("active");
        sec.style.display = "block";
      } else {
        sec.classList.remove("active");
        sec.style.display = "none";
      }
    });

    // View specific hooks
    if (viewId === "view-history") {
      window.analyticsManager?.renderCharts();
    } else if (viewId === "view-oled") {
      window.oledSimulator?.startCycling();
    } else if (viewId === "view-admin") {
      window.adminPortal?.loadOverview();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  bindEvents() {
    document.addEventListener("languageChanged", () => {
      if (this.currentData) {
        this.renderOverview(this.currentData);
      }
    });
  }

  setupLiveTelemetry() {
    api.onTelemetryUpdate((packet) => {
      if (packet.type === "telemetry_update") {
        this.handleLivePacket(packet);
      }
    });
  }

  handleLivePacket(packet) {
    // Keep internal currentData in sync so language toggle never reverts readings
    if (this.currentData) {
      if (!this.currentData.reading) this.currentData.reading = {};
      if (packet.soil_moisture !== undefined) this.currentData.reading.soil_moisture = packet.soil_moisture;
      if (packet.soil_ph !== undefined) this.currentData.reading.soil_ph = packet.soil_ph;
      if (packet.tank_level_pct !== undefined) this.currentData.reading.tank_level_pct = packet.tank_level_pct;
      if (packet.tank_litres !== undefined) this.currentData.reading.tank_litres = packet.tank_litres;
      if (packet.water_flow_lpm !== undefined) this.currentData.reading.water_flow_lpm = packet.water_flow_lpm;
      if (packet.temperature_c !== undefined) this.currentData.reading.temperature_c = packet.temperature_c;
      if (packet.humidity_pct !== undefined) this.currentData.reading.humidity_pct = packet.humidity_pct;

      if (packet.overall_status) {
        if (!this.currentData.overall_status) this.currentData.overall_status = {};
        this.currentData.overall_status.label = packet.overall_status;
        this.currentData.overall_status.badge = packet.overall_badge;
        this.currentData.overall_status.reason = packet.overall_reason;
        this.currentData.overall_status.reason_kn = packet.overall_reason_kn;
        this.currentData.overall_status.reason_en = packet.overall_reason_en;
      }
    }

    // Update Farm Status Hero
    const hero = document.getElementById("farmStatusHero");
    const badgeText = document.getElementById("statusBadgeText");
    const statusDot = document.getElementById("statusIndicatorDot");
    const statusReason = document.getElementById("statusReasonText");
    const isKn = i18n.currentLang === "kn";

    if (hero && badgeText) {
      hero.className = "farm-status-hero";
      if (packet.overall_status === "Critical") {
        hero.classList.add("status-hero-critical");
        statusDot.style.background = "var(--status-critical)";
        statusDot.style.color = "var(--status-critical)";
      } else if (packet.overall_status === "Attention Required") {
        hero.classList.add("status-hero-attention");
        statusDot.style.background = "var(--status-warning)";
        statusDot.style.color = "var(--status-warning)";
      } else {
        hero.classList.add("status-hero-healthy");
        statusDot.style.background = "var(--status-healthy)";
        statusDot.style.color = "var(--status-healthy)";
      }

      badgeText.textContent = `${packet.overall_badge} ${isKn ? (packet.overall_status === "Critical" ? "ತುರ್ತು ಎಚ್ಚರಿಕೆ" : packet.overall_status === "Attention Required" ? "ಗಮನ ಅಗತ್ಯವಿದೆ" : "ಆರೋಗ್ಯಕರವಾಗಿದೆ") : packet.overall_status}`;
      statusReason.textContent = isKn ? (packet.overall_reason_kn || packet.overall_reason) : (packet.overall_reason_en || packet.overall_reason);
    }

    // Companion Hero status pill
    const compTextLive = document.getElementById("homeCompanionStatusText");
    if (compTextLive && packet.overall_status) {
      const stLabel = isKn ? (packet.overall_status === "Critical" ? "ತುರ್ತು ಎಚ್ಚರಿಕೆ" : packet.overall_status === "Attention Required" ? "ಗಮನ ಅಗತ್ಯವಿದೆ" : "ಆರೋಗ್ಯಕರವಾಗಿದೆ") : packet.overall_status;
      const stReason = isKn ? (packet.overall_reason_kn || packet.overall_reason) : (packet.overall_reason_en || packet.overall_reason);
      compTextLive.textContent = `${stLabel} • ${stReason}`;
    }

    // Keep Daily Summary Tiles live
    const moistureVal = document.getElementById("summaryMoistureVal");
    if (moistureVal && packet.soil_moisture !== undefined) {
      moistureVal.textContent = `${packet.soil_moisture.toFixed(1)}%`;
    }
    const weatherVal = document.getElementById("summaryWeatherVal");
    if (weatherVal && packet.temperature_c !== undefined && packet.humidity_pct !== undefined) {
      weatherVal.textContent = `${packet.temperature_c.toFixed(1)}°C / ${packet.humidity_pct.toFixed(0)}%`;
    }
    const tankVal = document.getElementById("summaryTankVal");
    if (tankVal && packet.tank_level_pct !== undefined) {
      tankVal.textContent = `${packet.tank_level_pct.toFixed(0)}% (${((packet.tank_litres || 15000) / 1000).toFixed(1)}k L)`;
    }

    // Update real-time cards and pump states
    window.sensorsManager?.updateLiveValues(packet);
    window.irrigationManager?.updateLivePump(packet);
    window.oledSimulator?.updateLiveData(packet);
  }

  async loadData() {
    if (!api.isAuthenticated()) return;

    try {
      const data = await api.getFarmCurrent();
      this.currentData = data;
      window.sensorsManager?.renderSensors(data);
      window.irrigationManager?.renderIrrigation(data);
      this.renderOverview(data);
    } catch (err) {
      console.error("Error loading farm data:", err);
    }
  }

  renderOverview(data) {
    const isKn = i18n.currentLang === "kn";
    const f = data.farm;
    const s = data.overall_status;
    const ds = data.daily_summary;

    // Farm Meta Headers
    const farmNameEl = document.getElementById("displayFarmName");
    const farmLocationEl = document.getElementById("displayFarmLocation");
    const farmAreaEl = document.getElementById("displayFarmArea");
    const farmTreesEl = document.getElementById("displayFarmTrees");

    if (farmNameEl) farmNameEl.textContent = f.name;
    if (farmLocationEl) farmLocationEl.textContent = f.location;
    if (farmAreaEl) farmAreaEl.textContent = `${f.area_acres} ${isKn ? "ಎಕರೆ" : "Acres"}`;
    if (farmTreesEl) farmTreesEl.textContent = `${f.tree_count} ${isKn ? "ಅಡಿಕೆ ಮರಗಳು" : "Areca Palms"}`;

    // Status Hero
    const hero = document.getElementById("farmStatusHero");
    const badgeText = document.getElementById("statusBadgeText");
    const statusDot = document.getElementById("statusIndicatorDot");
    const statusReason = document.getElementById("statusReasonText");

    if (hero) {
      hero.className = "farm-status-hero";
      if (s.label === "Critical") {
        hero.classList.add("status-hero-critical");
        statusDot.style.background = "var(--status-critical)";
        statusDot.style.color = "var(--status-critical)";
      } else if (s.label === "Attention Required") {
        hero.classList.add("status-hero-attention");
        statusDot.style.background = "var(--status-warning)";
        statusDot.style.color = "var(--status-warning)";
      } else {
        hero.classList.add("status-hero-healthy");
        statusDot.style.background = "var(--status-healthy)";
        statusDot.style.color = "var(--status-healthy)";
      }

      badgeText.textContent = `${s.badge} ${isKn ? (s.label === "Critical" ? "ತುರ್ತು ಎಚ್ಚರಿಕೆ" : s.label === "Attention Required" ? "ಗಮನ ಅಗತ್ಯವಿದೆ" : "ಆರೋಗ್ಯಕರವಾಗಿದೆ") : s.label}`;
      statusReason.textContent = isKn ? (s.reason_kn || s.reason) : (s.reason_en || s.reason);
    }

    // Companion Hero status pill
    const compTextInit = document.getElementById("homeCompanionStatusText");
    if (compTextInit && s) {
      const stLabel = isKn ? (s.label === "Critical" ? "ತುರ್ತು ಎಚ್ಚರಿಕೆ" : s.label === "Attention Required" ? "ಗಮನ ಅಗತ್ಯವಿದೆ" : "ಆರೋಗ್ಯಕರವಾಗಿದೆ") : s.label;
      const stReason = isKn ? (s.reason_kn || s.reason) : (s.reason_en || s.reason);
      compTextInit.textContent = `${stLabel} • ${stReason}`;
    }

    // Daily Summary Tiles (if present)
    const setIfExists = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setIfExists("summaryConditionVal", isKn ? (s.label === "Healthy" ? "ಉತ್ತಮ" : s.label === "Attention Required" ? "ಸಾಧಾರಣ" : "ತುರ್ತು") : s.label);
    setIfExists("summaryWaterUsedVal", `${ds.water_used_litres || 850} L`);
    setIfExists("summaryMoistureVal", `${data.reading.soil_moisture.toFixed(1)}%`);
    setIfExists("summaryWeatherVal", `${data.reading.temperature_c.toFixed(1)}°C / ${data.reading.humidity_pct.toFixed(0)}%`);
    setIfExists("summaryTankVal", `${data.reading.tank_level_pct.toFixed(0)}% (${(data.reading.tank_litres / 1000).toFixed(1)}k L)`);
    setIfExists("summaryAlertsVal", `${ds.active_alerts_count} ${isKn ? "ಸಕ್ರಿಯ" : "Active"}`);
    setIfExists("summaryDiseaseVal", isKn ? (ds.disease_risk === "Moderate" ? "ಮಧ್ಯಮ" : ds.disease_risk === "Low" ? "ಕಡಿಮೆ" : "ಹೆಚ್ಚು") : ds.disease_risk);

    // Render Today's Actions
    const actionListEl = document.getElementById("todaysActionsList");
    if (actionListEl && data.recommendations) {
      actionListEl.innerHTML = data.recommendations.map(r => {
        const title = isKn ? r.title_kn : r.title_en;
        const reason = isKn ? r.reason_kn : r.reason_en;
        const action = isKn ? r.action_kn : r.action_en;
        const prio = isKn ? r.priority_label_kn : r.priority_label_en;
        const pClass = r.priority === "HIGH" ? "priority-high" : r.priority === "MEDIUM" ? "priority-medium" : "priority-low";

        return `
          <div class="action-item">
            <div class="action-priority-badge ${pClass}">${prio}</div>
            <div class="action-content">
              <h4>${title}</h4>
              <div class="action-reason"><strong>${i18n.t("why_label")}</strong> ${reason}</div>
              <div class="action-suggested"><strong>${i18n.t("action_label")}</strong> ${action}</div>
            </div>
          </div>
        `;
      }).join("");
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.farmerDashboard = new FarmerDashboard();
});
