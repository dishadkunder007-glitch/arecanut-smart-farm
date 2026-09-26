/**
 * Arecanut Crop Health & AI Disease Detection
 * Features instant detection on upload/photo capture, realistic laser scanning HUD animation,
 * and automatic organ and disease identification without requiring manual plant part selection.
 */

const PRESET_SAMPLE_VISUALS = {
  sample_koleroga: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="100%" height="100%" fill="%230d2319"/><ellipse cx="300" cy="180" rx="90" ry="110" fill="%234d7c0f"/><circle cx="270" cy="150" r="30" fill="%23365314"/><circle cx="330" cy="160" r="28" fill="%2327272a"/><path d="M250,140 Q280,180 320,150" stroke="%2318181b" stroke-width="8" fill="none"/><circle cx="285" cy="180" r="25" fill="%23451a03"/><text x="300" y="340" font-family="sans-serif" font-size="18" fill="%23e4e4e7" text-anchor="middle" font-weight="bold">Arecanut Fruit Bunch - Koleroga Rot</text></svg>`,
  sample_yld: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="100%" height="100%" fill="%230f241a"/><path d="M100,350 Q300,100 500,280" stroke="%23ca8a04" stroke-width="26" fill="none"/><path d="M150,300 Q280,140 450,220" stroke="%23eab308" stroke-width="18" fill="none"/><path d="M180,320 Q320,160 480,240" stroke="%23713f12" stroke-width="12" fill="none"/><text x="300" y="360" font-family="sans-serif" font-size="18" fill="%23e4e4e7" text-anchor="middle" font-weight="bold">Arecanut Fronds - Yellow Leaf Disease (YLD)</text></svg>`,
  sample_anabe: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="100%" height="100%" fill="%23171717"/><rect x="250" y="40" width="100" height="320" fill="%23573a25" rx="8"/><path d="M230,260 C230,220 310,220 310,260 Z" fill="%23b45309"/><path d="M270,300 C270,270 340,270 340,300 Z" fill="%23d97706"/><text x="300" y="375" font-family="sans-serif" font-size="18" fill="%23e4e4e7" text-anchor="middle" font-weight="bold">Arecanut Trunk Base - Anabe Foot Rot</text></svg>`,
  sample_bleeding: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="100%" height="100%" fill="%23171717"/><rect x="240" y="30" width="120" height="340" fill="%23443122" rx="10"/><path d="M295,90 L305,280 L298,340" stroke="%231c0d02" stroke-width="14" fill="none"/><path d="M300,120 L300,240" stroke="%237f1d1d" stroke-width="8" fill="none"/><text x="300" y="380" font-family="sans-serif" font-size="18" fill="%23e4e4e7" text-anchor="middle" font-weight="bold">Arecanut Bark - Stem Bleeding</text></svg>`,
  sample_healthy: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="100%" height="100%" fill="%23062e1e"/><path d="M120,320 Q300,80 480,260" stroke="%2316a34a" stroke-width="22" fill="none"/><path d="M160,280 Q320,110 440,220" stroke="%2322c55e" stroke-width="16" fill="none"/><text x="300" y="360" font-family="sans-serif" font-size="18" fill="%23e4e4e7" text-anchor="middle" font-weight="bold">Vibrant Healthy Arecanut Foliage</text></svg>`
};

class DiseaseDetector {
  constructor() {
    this.lastDiagnosis = null;
    this.currentScanImage = null;
    this.cachedPresets = null;
    this.isScanning = false;
    this.scanTimer = null;

    this.initElements();
    this.bindEvents();
    this.loadPresets();

    document.addEventListener("languageChanged", () => {
      if (this.cachedPresets) {
        this.renderPresets(this.cachedPresets);
      }
      if (this.lastDiagnosis) {
        this.renderDiagnosis(this.lastDiagnosis);
      }
    });
  }

  initElements() {
    this.dropzone = document.getElementById("diseaseDropzone");
    this.fileInput = document.getElementById("diseaseFileInput");
    this.presetsList = document.getElementById("samplePresetsList");
    this.resultContainer = document.getElementById("diagnosisResultArea");
    this.btnCamera = document.getElementById("btnTriggerCamera");
    this.btnGallery = document.getElementById("btnTriggerGallery");
  }

  bindEvents() {
    if (this.dropzone && this.fileInput) {
      this.dropzone.addEventListener("click", (e) => {
        // Prevent triggering twice if inner buttons clicked
        if (e.target.closest(".btn-scan-trigger")) return;
        this.fileInput.click();
      });

      this.fileInput.addEventListener("change", (e) => this.handleFileUpload(e));

      // Drag and drop handlers
      this.dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        this.dropzone.classList.add("dragover");
      });

      this.dropzone.addEventListener("dragleave", () => {
        this.dropzone.classList.remove("dragover");
      });

      this.dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        this.dropzone.classList.remove("dragover");
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          this.processImageFile(e.dataTransfer.files[0]);
        }
      });
    }

    if (this.btnCamera && this.fileInput) {
      this.btnCamera.addEventListener("click", (e) => {
        e.stopPropagation();
        this.fileInput.setAttribute("capture", "environment");
        this.fileInput.click();
      });
    }

    if (this.btnGallery && this.fileInput) {
      this.btnGallery.addEventListener("click", (e) => {
        e.stopPropagation();
        this.fileInput.removeAttribute("capture");
        this.fileInput.click();
      });
    }
  }

  renderPresets(presets) {
    if (!this.presetsList || !presets) return;
    const isKn = i18n.currentLang === "kn";

    this.presetsList.innerHTML = presets.map(p => {
      const organName = isKn ? (p.organ === "Fruit Bunch" ? "ಕಾಯಿ / ಗೊನೆ" : p.organ === "Leaves" ? "ಗರಿಗಳು" : "ಕಾಂಡ / ಬುಡ") : p.organ;
      const subPrompt = isKn ? `${organName} | ತಕ್ಷಣ ಪರೀಕ್ಷಿಸಲು ಕ್ಲಿಕ್ ಮಾಡಿ` : `${p.organ} | Click for instant scan`;

      return `
        <div class="sample-preset-item" onclick="window.diseaseDetector.runPresetDiagnosis('${p.sample_id}')">
          <div class="sample-thumb" style="background: ${p.thumbnail_color};">
            ${p.organ === "Fruit Bunch" ? "🍇" : p.organ === "Leaves" ? "🍂" : "🪵"}
          </div>
          <div style="flex: 1;">
            <div style="font-weight: 700; color: var(--text-bright); font-size: 0.92rem;">
              ${isKn ? p.title_kn : p.title_en}
            </div>
            <div style="font-size: 0.76rem; color: var(--text-muted);">
              ${subPrompt}
            </div>
          </div>
          <span style="color: var(--primary-400); font-weight: 800; font-size: 1.1rem;">⚡</span>
        </div>
      `;
    }).join("");
  }

  async loadPresets(force = false) {
    if (!this.presetsList) return;
    if (this.cachedPresets && !force) {
      this.renderPresets(this.cachedPresets);
      return;
    }
    try {
      const presets = await api.getDiseaseSamples();
      this.cachedPresets = presets;
      this.renderPresets(presets);
    } catch (e) {
      console.warn("Presets load error:", e);
    }
  }

  handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    this.processImageFile(file);
    // Reset file input value so selecting the same photo again fires change
    this.fileInput.value = "";
  }

  processImageFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const imageSrc = reader.result;
      this.currentScanImage = imageSrc;
      // Start realistic scanning HUD and trigger detection
      this.startScanningHUD(imageSrc, async () => {
        try {
          const res = await api.detectDisease("Auto", null, imageSrc);
          this.renderDiagnosis(res);
        } catch (err) {
          alert("Analysis error: " + err.message);
          this.resetToEmptyState();
        }
      });
    };
    reader.readAsDataURL(file);
  }

  async runPresetDiagnosis(sampleId) {
    const imageSrc = PRESET_SAMPLE_VISUALS[sampleId] || PRESET_SAMPLE_VISUALS.sample_koleroga;
    this.currentScanImage = imageSrc;

    this.startScanningHUD(imageSrc, async () => {
      try {
        const res = await api.detectDisease("Auto", sampleId, null);
        this.renderDiagnosis(res);
      } catch (err) {
        alert("Error analyzing sample: " + err.message);
        this.resetToEmptyState();
      }
    });
  }

  /**
   * Holographic Laser Scanning HUD
   * Renders the image with animated laser line, viewfinder brackets, and progressive stage messages.
   */
  startScanningHUD(imageSrc, onComplete) {
    if (!this.resultContainer) return;
    this.isScanning = true;
    if (this.scanTimer) clearTimeout(this.scanTimer);

    const isKn = i18n.currentLang === "kn";
    const stage1Text = i18n.t("scanning_stage1");
    const stage2Text = i18n.t("scanning_stage2");
    const stage3Text = i18n.t("scanning_stage3");

    this.resultContainer.innerHTML = `
      <div class="scanner-viewport-card">
        <div class="scanner-frame">
          <img src="${imageSrc}" class="scanner-target-img" alt="Scanning Palm Tissue">
          
          <!-- Laser Beam & Glow -->
          <div class="scanner-laser-line"></div>
          <div class="scanner-laser-glow"></div>
          
          <!-- Viewfinder HUD -->
          <div class="hud-bracket hud-tl"></div>
          <div class="hud-bracket hud-tr"></div>
          <div class="hud-bracket hud-bl"></div>
          <div class="hud-bracket hud-br"></div>
          <div class="hud-center-crosshair"></div>
        </div>

        <div class="scanner-status-area">
          <div class="scanner-stage-badge">
            <span>●</span> <span>AI SCANNER ACTIVE</span>
          </div>
          <div class="scanner-stage-text" id="scannerStatusText">
            ${stage1Text}
          </div>
          <div class="scanner-progress-outer">
            <div class="scanner-progress-bar" id="scannerProgressBar" style="width: 20%;"></div>
          </div>
        </div>
      </div>
    `;

    // Smooth stage transitions
    const statusTextEl = document.getElementById("scannerStatusText");
    const progressBarEl = document.getElementById("scannerProgressBar");

    setTimeout(() => {
      if (!this.isScanning) return;
      if (statusTextEl) statusTextEl.textContent = stage2Text;
      if (progressBarEl) progressBarEl.style.width = "62%";
    }, 700);

    setTimeout(() => {
      if (!this.isScanning) return;
      if (statusTextEl) statusTextEl.textContent = stage3Text;
      if (progressBarEl) progressBarEl.style.width = "92%";
    }, 1400);

    setTimeout(() => {
      if (!this.isScanning) return;
      if (progressBarEl) progressBarEl.style.width = "100%";
    }, 1900);

    // Conclude scan after 2.1 seconds for maximum realism and smooth presentation
    this.scanTimer = setTimeout(() => {
      this.isScanning = false;
      if (onComplete) onComplete();
    }, 2100);
  }

  renderDiagnosis(res) {
    this.lastDiagnosis = res;
    if (!this.resultContainer) return;

    const isKn = i18n.currentLang === "kn";
    const name = isKn ? res.condition_kn : res.condition_en;
    const symptoms = isKn ? res.symptoms_kn : res.symptoms_en;
    const reco = isKn ? res.recommendation_kn : res.recommendation_en;
    const disclaimer = isKn ? res.disclaimer_kn : res.disclaimer_en;

    const sevClass = res.severity === "CRITICAL" ? "priority-high" : res.severity === "HIGH" ? "priority-medium" : res.severity === "HEALTHY" ? "priority-low" : "priority-medium";
    const sevText = isKn ? (res.severity === "CRITICAL" ? "ತುರ್ತು ಕ್ರಮ ಅಗತ್ಯ" : res.severity === "HIGH" ? "ಗಂಭೀರ ಬಾಧೆ" : res.severity === "HEALTHY" ? "ಆರೋಗ್ಯಕರ" : "ಸಾಧಾರಣ") : res.severity;

    const organMap = {
      "Fruit Bunch": isKn ? "🍇 ಅಡಿಕೆ ಗೊನೆ / ಕಾಯಿ" : "🍇 Fruit Bunch (Supari)",
      "Leaves": isKn ? "🍂 ಅಡಿಕೆ ಗರಿಗಳು" : "🍂 Leaves / Fronds",
      "Stem": isKn ? "🪵 ಕಾಂಡ / ಮರದ ಬುಡ" : "🪵 Stem / Trunk",
      "General": isKn ? "🌴 ಇಡೀ ಮರ" : "🌴 Whole Palm"
    };
    const organDisplay = organMap[res.organ] || res.organ;

    const imagePreviewHtml = this.currentScanImage ? `
      <div class="scanned-photo-banner">
        <img src="${this.currentScanImage}" class="scanned-thumb-img" alt="Scanned Specimen">
        <div style="flex: 1;">
          <div class="scanned-verified-badge">${i18n.t("scan_complete")}</div>
          <div style="font-size: 0.85rem; color: var(--text-bright); margin-top: 3px;">
            <strong>${i18n.t("detected_organ_lbl")}:</strong> <span style="color: var(--primary-400); font-weight: 700;">${organDisplay}</span>
          </div>
        </div>
      </div>
    ` : "";

    this.resultContainer.innerHTML = `
      <div class="diagnosis-result-card" style="animation: fadeIn 0.3s ease;">
        ${imagePreviewHtml}

        <div class="condition-title-row">
          <div>
            <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">
              ${i18n.t("possible_condition")}
            </div>
            <h2 style="font-size: 1.4rem; color: var(--text-bright); font-weight: 800; margin-top: 4px;">
              ${res.icon} ${name}
            </h2>
            <div style="font-size: 0.85rem; color: var(--text-muted); font-style: italic; margin-top: 2px;">
              ${isKn ? "ರೋಗಕಾರಕ" : "Pathogen"}: ${res.pathogen}
            </div>
          </div>
          <span class="action-priority-badge ${sevClass}">
            ${sevText}
          </span>
        </div>

        <div style="background: rgba(0,0,0,0.25); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 0.85rem;">
            <span><strong>${i18n.t("confidence")}:</strong></span>
            <span style="color: var(--primary-400); font-weight: 800;">${res.confidence_pct}% ${isKn ? "ಹೊಂದಾಣಿಕೆ" : "Match"}</span>
          </div>
          <div class="sensor-progress-bar">
            <div class="sensor-progress-fill" style="width: ${res.confidence_pct}%;"></div>
          </div>
        </div>

        <div>
          <h4 style="color: var(--text-bright); margin-bottom: 6px; font-size: 1rem;">🔍 ${i18n.t("symptoms")}</h4>
          <p style="color: var(--text-main); font-size: 0.92rem; line-height: 1.5;">${symptoms}</p>
        </div>

        <div style="background: rgba(6, 78, 59, 0.25); border: 1px solid var(--primary-600); border-radius: var(--radius-md); padding: 16px;">
          <h4 style="color: var(--primary-400); margin-bottom: 6px; font-size: 1rem;">💊 ${i18n.t("treatment")}</h4>
          <p style="color: var(--text-bright); font-size: 0.92rem; line-height: 1.6;">${reco}</p>
        </div>

        <div class="disclaimer-box">
          ${disclaimer}
        </div>

        <button type="button" class="btn-scan-trigger btn-scan-cam" style="width: 100%; justify-content: center; margin-top: 8px;" onclick="window.diseaseDetector.triggerNewScan()">
          ${i18n.t("btn_scan_another")}
        </button>
      </div>
    `;
  }

  triggerNewScan() {
    this.fileInput.click();
  }

  resetToEmptyState() {
    if (!this.resultContainer) return;
    this.resultContainer.innerHTML = `
      <div class="card" style="text-align: center; padding: 40px; color: var(--text-muted);">
        <div style="font-size: 3rem; margin-bottom: 12px;">🌿</div>
        <h4>${i18n.t("disease_prompt_empty")}</h4>
        <p style="font-size: 0.85rem; margin-top: 6px;">${i18n.t("disease_prompt_sub")}</p>
      </div>
    `;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.diseaseDetector = new DiseaseDetector();
});
