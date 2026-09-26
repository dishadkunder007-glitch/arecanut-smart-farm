/**
 * Admin Farm Operations & Farmer CRUD Management Portal
 */

class AdminPortal {
  constructor() {
    this.farmers = [];
    this.initElements();
    this.bindEvents();
  }

  initElements() {
    this.overviewCards = document.getElementById("adminOverviewMetrics");
    this.farmersTableBody = document.getElementById("adminFarmersTableBody");
    this.modalAddFarmer = document.getElementById("modalAddFarmer");
    this.modalThresholds = document.getElementById("modalThresholds");
    this.formAddFarmer = document.getElementById("formAddFarmer");
    this.formThresholds = document.getElementById("formThresholds");
    this.btnAddFarmer = document.getElementById("btnOpenAddFarmerModal");
    this.btnCloseModals = document.querySelectorAll(".btn-close-modal");
    this.lastData = null;
    this.farmers = [];
  }

  bindEvents() {
    this.btnAddFarmer?.addEventListener("click", () => {
      this.modalAddFarmer?.classList.add("open");
    });

    this.btnCloseModals.forEach(btn => {
      btn.addEventListener("click", () => {
        this.modalAddFarmer?.classList.remove("open");
        this.modalThresholds?.classList.remove("open");
      });
    });

    this.formAddFarmer?.addEventListener("submit", (e) => this.handleAddFarmer(e));
    this.formThresholds?.addEventListener("submit", (e) => this.handleUpdateThresholds(e));

    document.addEventListener("languageChanged", () => {
      if (this.lastData) {
        this.renderMetrics(this.lastData);
      }
      if (this.farmers && this.farmers.length > 0) {
        this.renderFarmersList(this.farmers);
      }
    });
  }

  async loadOverview() {
    try {
      const data = await api.getAdminOverview();
      this.renderMetrics(data);
      this.loadFarmers();
    } catch (e) {
      console.warn("Admin overview error:", e);
    }
  }

  renderMetrics(data) {
    if (!this.overviewCards) return;
    this.lastData = data;
    const isKn = i18n.currentLang === "kn";

    this.overviewCards.innerHTML = `
      <div class="admin-stat-card">
        <div class="admin-stat-card-top">
          <span class="admin-stat-label">${i18n.t("total_farmers")}</span>
          <span class="admin-stat-icon-pill">👨‍🌾</span>
        </div>
        <div class="admin-stat-value" style="color: var(--forest-500);">${data.total_farmers}</div>
        <div class="admin-stat-sub">
          <span class="status-indicator-dot" style="background: #10b981;"></span>
          ${data.total_farms} ${isKn ? "ಸಕ್ರಿಯ ತೋಟಗಳು" : "Active Plantations"}
        </div>
      </div>

      <div class="admin-stat-card">
        <div class="admin-stat-card-top">
          <span class="admin-stat-label">${i18n.t("online_devices")}</span>
          <span class="admin-stat-icon-pill">📡</span>
        </div>
        <div class="admin-stat-value" style="color: #10b981;">${data.online_devices} <span style="font-size: 1.1rem; font-weight: 600; opacity: 0.7;">/ ${data.total_devices}</span></div>
        <div class="admin-stat-sub">
          <span class="status-indicator-dot" style="background: ${data.online_devices === data.total_devices ? '#10b981' : '#f59e0b'};"></span>
          ${isKn ? "ESP32 ಗೇಟ್‌ವೇಗಳು" : "ESP32 Gateways"}
        </div>
      </div>

      <div class="admin-stat-card">
        <div class="admin-stat-card-top">
          <span class="admin-stat-label">${i18n.t("pumps_running_stat")}</span>
          <span class="admin-stat-icon-pill">💧</span>
        </div>
        <div class="admin-stat-value" style="color: #0284c7;">${data.pumps_running}</div>
        <div class="admin-stat-sub ${data.pumps_dry_run_fault > 0 ? 'admin-stat-alert' : ''}">
          ${data.pumps_dry_run_fault > 0 ? `⚠️ ${data.pumps_dry_run_fault} ${isKn ? 'ಡ್ರೈ-ರನ್ ಲಾಕ್‌ಔಟ್‌ಗಳು' : 'Dry-Run Lockouts'}` : (isKn ? 'ಯಾವುದೇ ಪಂಪ್ ದೋಷಗಳಿಲ್ಲ' : 'Zero Pump Faults')}
        </div>
      </div>

      <div class="admin-stat-card">
        <div class="admin-stat-card-top">
          <span class="admin-stat-label">${i18n.t("low_water_stat")}</span>
          <span class="admin-stat-icon-pill">🚰</span>
        </div>
        <div class="admin-stat-value" style="color: ${data.low_water_farms > 0 ? '#f59e0b' : '#10b981'};">
          ${data.low_water_farms}
        </div>
        <div class="admin-stat-sub">
          ${isKn ? "ನೀರಿನ ಟ್ಯಾಂಕ್ < 25%" : "Storage Tanks < 25%"}
        </div>
      </div>
    `;
  }

  async loadFarmers() {
    if (!this.farmersTableBody) return;
    try {
      this.farmers = await api.getAdminFarmers();
      this.renderFarmersList(this.farmers);
    } catch (e) {
      console.error("Failed to load farmers list:", e);
    }
  }

  renderFarmersList(farmers) {
    if (!this.farmersTableBody) return;
    const isKn = i18n.currentLang === "kn";
    this.farmersTableBody.innerHTML = farmers.map(f => {
      const farm = f.farm || {};
      const isPumpOn = farm.pump_status === "ON";
      return `
        <tr>
          <td>
            <strong>${f.name}</strong><br>
            <span style="font-size: 0.78rem; color: var(--text-muted);">📞 ${f.phone}</span>
          </td>
          <td>
            <strong>${farm.name || "N/A"}</strong><br>
            <span style="font-size: 0.78rem; color: var(--text-muted);">${farm.location || ""}</span>
          </td>
          <td>${farm.area_acres || 0} ${isKn ? "ಎಕರೆ" : "Ac"} / ${farm.tree_count || 0} ${isKn ? "ಮರಗಳು" : "Palms"}</td>
          <td>
            <span class="sensor-badge ${farm.soil_moisture < 40 ? 'sensor-badge-offline' : 'sensor-badge-online'}">
              💧 ${farm.soil_moisture !== null ? farm.soil_moisture.toFixed(1) + "%" : "--"}
            </span>
          </td>
          <td>
            <span class="sensor-badge ${isPumpOn ? 'sensor-badge-online' : ''}">
              ${isPumpOn ? (isKn ? '⚡ ಚಾಲನೆಯಲ್ಲಿದೆ' : '⚡ RUNNING') : (isKn ? '⏹️ ಆಫ್ ಆಗಿದೆ' : '⏹️ IDLE')}
            </span>
          </td>
          <td>
            <button class="btn-icon" style="display: inline-flex; width: 32px; height: 32px; font-size: 0.85rem;" title="${isKn ? 'ಮಿತಿ ಸಂರಚಿಸಿ' : 'Configure Thresholds'}" onclick="window.adminPortal.openThresholdsModal(${farm.id || 1})">
              ⚙️
            </button>
            <button class="btn-icon" style="display: inline-flex; width: 32px; height: 32px; font-size: 0.85rem; color: #ef4444;" title="${isKn ? 'ರೈತರನ್ನು ಅಳಿಸಿ' : 'Delete Farmer'}" onclick="window.adminPortal.deleteFarmer(${f.id})">
              🗑️
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  async handleAddFarmer(e) {
    e.preventDefault();
    const payload = {
      name: document.getElementById("newFarmerName").value,
      phone: document.getElementById("newFarmerPhone").value,
      password: document.getElementById("newFarmerPassword").value,
      email: document.getElementById("newFarmerEmail").value || null,
      farm_name: document.getElementById("newFarmName").value,
      location: document.getElementById("newFarmLocation").value,
      area_acres: parseFloat(document.getElementById("newFarmArea").value) || 5.0,
      tree_count: parseInt(document.getElementById("newFarmTrees").value) || 1200,
      soil_type: document.getElementById("newFarmSoil").value,
      irrigation_type: document.getElementById("newFarmIrrigation").value,
      tank_capacity_litres: parseFloat(document.getElementById("newFarmTank").value) || 15000.0
    };

    try {
      await api.createFarmer(payload);
      alert("Farmer and farm plantation successfully registered!");
      this.modalAddFarmer?.classList.remove("open");
      this.formAddFarmer?.reset();
      this.loadOverview();
    } catch (err) {
      alert("Failed to create farmer: " + err.message);
    }
  }

  openThresholdsModal(farmId) {
    document.getElementById("thresholdFarmId").value = farmId;
    this.modalThresholds?.classList.add("open");
  }

  async handleUpdateThresholds(e) {
    e.preventDefault();
    const farmId = document.getElementById("thresholdFarmId").value;
    const payload = {
      moisture_min: parseFloat(document.getElementById("threshMinMoisture").value),
      moisture_target: parseFloat(document.getElementById("threshTargetMoisture").value),
      tank_critical_cutoff_pct: parseFloat(document.getElementById("threshTankCutoff").value),
      auto_irrigation: true
    };

    try {
      await api.updateThresholds(farmId, payload);
      alert("Irrigation thresholds successfully updated!");
      this.modalThresholds?.classList.remove("open");
    } catch (err) {
      alert("Failed to update thresholds: " + err.message);
    }
  }

  async deleteFarmer(farmerId) {
    if (!confirm("Are you sure you want to delete this farmer and all associated farm telemetry?")) return;
    try {
      await api.deleteFarmer(farmerId);
      this.loadOverview();
    } catch (err) {
      alert("Failed to delete farmer: " + err.message);
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.adminPortal = new AdminPortal();
});
