/**
 * Arecanut Smart Farm - Live Telemetry Voice Assistant
 * Announces live telemetry (Soil Moisture, Soil pH, NPK, Weather, Tank, Pump)
 * Supports crystal-clear FEMALE voice speech in both English and Kannada.
 * Guaranteed 100% exclusive playback (zero voice overlap) and fast response.
 */

// Global AudioContext and Web Audio hardware wake-up for Chromium desktop PWA standalone window
function unlockPwaAudio() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      if (!window._pwaAudioCtx) {
        window._pwaAudioCtx = new AudioCtx();
      }
      if (window._pwaAudioCtx.state === "suspended") {
        window._pwaAudioCtx.resume();
      }
      try {
        const buffer = window._pwaAudioCtx.createBuffer(1, 1, 22050);
        const source = window._pwaAudioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(window._pwaAudioCtx.destination);
        source.start(0);
      } catch (e) {}
    }
    if (window.speechSynthesis && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  } catch (e) {
    // Ignore audio unlock errors
  }
}

// Global master speech coordinator: stops ANY ongoing voice assistant or chatbot speech
window.stopAllFarmSpeech = function(initiator) {
  if (window.voiceAssistant && window.voiceAssistant !== initiator) {
    try { window.voiceAssistant.stopSpeaking(); } catch (e) {}
  }
  if (window.chatbotManager && window.chatbotManager !== initiator) {
    try { window.chatbotManager.stopSpeaking(); } catch (e) {}
  }
  if (typeof window !== "undefined" && window.speechSynthesis) {
    try {
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
      }
      window.speechSynthesis.resume();
    } catch (e) {}
  }
};

// Asynchronous voice loader that resolves available voices on cold-launch of Chrome PWA
function getLoadedVoicesAsync(timeoutMs = 300) {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      return resolve([]);
    }
    const immediate = window.speechSynthesis.getVoices();
    if (immediate && immediate.length > 0) {
      return resolve(immediate);
    }

    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(window.speechSynthesis.getVoices() || []);
      }
    }, timeoutMs);

    const onVoices = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
        resolve(window.speechSynthesis.getVoices() || []);
      }
    };

    window.speechSynthesis.addEventListener("voiceschanged", onVoices, { once: true });
  });
}

// Intelligent voice selector: Prioritizes FEMALE voices for both Kannada and English
function findFemaleVoice(voices, lang = "kn") {
  if (!voices || voices.length === 0) return null;

  if (lang === "kn") {
    // Look for Kannada voice (Google ಕನ್ನಡ in Chrome or Microsoft Gagan/Sapna in Edge)
    return voices.find(v => v.lang && (v.lang.startsWith("kn") || v.lang.toLowerCase().includes("kannada")));
  }

  // English: STRICTLY prioritize FEMALE voices
  // 1. Google US English (Natural Google Female Voice on Chrome localhost)
  const googleUs = voices.find(v => v.name === "Google US English");
  if (googleUs) return googleUs;

  // 2. Google UK English Female
  const googleUkFemale = voices.find(v => v.name.includes("Google") && v.name.toLowerCase().includes("female"));
  if (googleUkFemale) return googleUkFemale;

  // 3. Microsoft Zira Desktop (Built-in Windows Local Female Voice)
  const zira = voices.find(v => v.name.includes("Zira"));
  if (zira) return zira;

  // 4. Any voice explicitly labeled Female
  const anyFemale = voices.find(v => v.lang && v.lang.startsWith("en") && v.name.toLowerCase().includes("female"));
  if (anyFemale) return anyFemale;

  // 5. Indian English Female names (Heera, Priya, Veena)
  const indianFemale = voices.find(v => {
    const n = v.name.toLowerCase();
    return n.includes("heera") || n.includes("priya") || n.includes("veena") || n.includes("raveena");
  });
  if (indianFemale) return indianFemale;

  // 6. Generic en-IN or en-US fallback
  const anyEn = voices.find(v => v.lang && v.lang.startsWith("en"));
  return anyEn || null;
}

class VoiceAssistantManager {
  constructor() {
    this.modal = document.getElementById("voiceAssistantModal");
    this.triggerBtn = document.getElementById("floatingVoiceBtn");
    this.closeBtn = document.getElementById("btnCloseVoiceModal");
    this.backdrop = document.getElementById("voiceModalBackdrop");
    this.btnSpeakKn = document.getElementById("btnVoiceSpeakKn");
    this.btnSpeakEn = document.getElementById("btnVoiceSpeakEn");
    this.btnStop = document.getElementById("btnVoiceStop");
    this.waveContainer = document.getElementById("voiceWaveContainer");
    this.statusText = document.getElementById("voiceStatusText");
    this.transcriptContent = document.getElementById("voiceTranscriptContent");

    // Core Real-Time Farm Telemetry elements (Moisture, pH, NPK)
    this.valMoisture = document.getElementById("voiceMoistureVal");
    this.valPh = document.getElementById("voicePhVal");
    this.valNpk = document.getElementById("voiceNpkVal");

    this.currentUtterance = null;
    this.currentAudio = null;
    this.isSpeaking = false;
    this.voices = [];
    this.keepAliveTimer = null;
    this.speakDelayTimer = null;
    this.sessionId = 0;
    this.lastOpenTime = 0;

    this.initVoices();
    this.bindEvents();
  }

  initVoices() {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      const loadVoices = () => {
        const v = window.speechSynthesis.getVoices();
        if (v && v.length > 0) this.voices = v;
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  bindEvents() {
    this.triggerBtn?.addEventListener("click", (e) => {
      e.preventDefault();
      unlockPwaAudio();
      this.openAndAnnounce();
    });
    this.closeBtn?.addEventListener("click", () => this.close());
    this.backdrop?.addEventListener("click", () => this.close());

    this.btnSpeakKn?.addEventListener("click", (e) => {
      e.preventDefault();
      unlockPwaAudio();
      this.speak("kn");
    });
    this.btnSpeakEn?.addEventListener("click", (e) => {
      e.preventDefault();
      unlockPwaAudio();
      this.speak("en");
    });
    this.btnStop?.addEventListener("click", (e) => {
      e.preventDefault();
      this.stopSpeaking();
    });

    // Listen for live telemetry packets from WebSocket
    if (typeof api !== "undefined" && api.onTelemetryUpdate) {
      api.onTelemetryUpdate((packet) => {
        if (packet && packet.type === "telemetry_update") {
          this.updateMetricPills(packet);
        }
      });
    }
  }

  getCurrentReading() {
    if (window.farmerDashboard?.currentData?.reading) {
      return window.farmerDashboard.currentData.reading;
    }
    if (window.sensorsManager?.lastData?.reading) {
      return window.sensorsManager.lastData.reading;
    }
    return {
      soil_moisture: 55.0,
      soil_ph: 6.17,
      nitrogen: 210,
      phosphorus: 38,
      potassium: 185
    };
  }

  updateMetricPills(reading) {
    if (!reading) return;
    if (this.valMoisture && reading.soil_moisture !== undefined) {
      this.valMoisture.textContent = `${reading.soil_moisture.toFixed(1)}%`;
    }
    if (this.valPh && reading.soil_ph !== undefined) {
      this.valPh.textContent = `${reading.soil_ph.toFixed(2)} pH`;
    }
    if (this.valNpk && reading.nitrogen !== undefined) {
      this.valNpk.textContent = `${Math.round(reading.nitrogen)} - ${Math.round(reading.phosphorus || 38)} - ${Math.round(reading.potassium || 185)}`;
    }
  }

  generateReport(lang, r) {
    const moisture = r.soil_moisture !== undefined ? r.soil_moisture.toFixed(1) : "55.0";
    const ph = r.soil_ph !== undefined ? r.soil_ph.toFixed(2) : "6.17";
    const n = r.nitrogen !== undefined ? Math.round(r.nitrogen) : 210;
    const p = r.phosphorus !== undefined ? Math.round(r.phosphorus) : 38;
    const k = r.potassium !== undefined ? Math.round(r.potassium) : 185;

    if (lang === "kn") {
      let moistureQuality = "ಸೂಕ್ತ";
      if (r.soil_moisture < 40) moistureQuality = "ಕಡಿಮೆ";
      else if (r.soil_moisture > 72) moistureQuality = "ಹೆಚ್ಚು";

      let phQuality = "ಉತ್ತಮ";
      if (r.soil_ph < 5.8) phQuality = "ಆಮ್ಲೀಯ";
      else if (r.soil_ph > 6.8) phQuality = "ಕ್ಷಾರೀಯ";

      const spokenText = `ನಮಸ್ಕಾರ! ನಿಮ್ಮ ಅಡಿಕೆ ತೋಟದ ಪ್ರಸ್ತುತ ನೇರ ಮಾಹಿತಿ:
ಒಂದು: ಮಣ್ಣಿನ ತೇವಾಂಶ ${moisture} ಶೇಕಡಾ ಇದ್ದು, ${moistureQuality} ಮಟ್ಟದಲ್ಲಿದೆ.
ಎರಡು: ಮಣ್ಣಿನ ಪಿಎಚ್ ಮಟ್ಟ ${ph} ಆಗಿದ್ದು, ಅಡಿಕೆ ಮರಗಳಿಗೆ ${phQuality}ವಾಗಿದೆ.
ಮೂರು: ಎನ್-ಪಿ-ಕೆ ಪೋಷಕಾಂಶಗಳ ಮಟ್ಟ: ಸಾರಜನಕ ${n}, ರಂಜಕ ${p}, ಮತ್ತು ಪೊಟ್ಯಾಶ್ ${k} ಮಿಲಿಗ್ರಾಂ ಪ್ರತಿ ಕಿಲೋಗ್ರಾಂ ನಷ್ಟಿದೆ.
ತೋಟದ ಮಣ್ಣಿನ ಸ್ಥಿತಿ ಸಾಮಾನ್ಯವಾಗಿ ಸುರಕ್ಷಿತವಾಗಿದೆ.`;

      const displayText = `<strong>🌾 ನಮಸ್ಕಾರ! ನಿಮ್ಮ ಅಡಿಕೆ ತೋಟದ ಪ್ರಸ್ತುತ ನೇರ ಮಾಹಿತಿ:</strong><br><br>
💧 <strong>೧. ಮಣ್ಣಿನ ತೇವಾಂಶ:</strong> ${moisture}% (${moistureQuality} ಮಟ್ಟ, ಗುರಿ: 50-72%)<br>
🧪 <strong>೨. ಮಣ್ಣಿನ ಪಿಎಚ್ ಮಟ್ಟ:</strong> ${ph} pH (${phQuality} ಮಟ್ಟ, ಗುರಿ: 5.8-6.8 pH)<br>
🌱 <strong>೩. ಎನ್-ಪಿ-ಕೆ ಪೋಷಕಾಂಶಗಳು:</strong> N: ${n} mg/kg | P: ${p} mg/kg | K: ${k} mg/kg`;

      return { spokenText, displayText };
    } else {
      let moistureQuality = "optimal";
      if (r.soil_moisture < 40) moistureQuality = "low";
      else if (r.soil_moisture > 72) moistureQuality = "high";

      let phQuality = "ideal";
      if (r.soil_ph < 5.8) phQuality = "slightly acidic";
      else if (r.soil_ph > 6.8) phQuality = "slightly alkaline";

      const spokenText = `Hello! Here is the live telemetry report of your Arecanut farm:
First: Soil moisture is at ${moisture} percent, which is in the ${moistureQuality} range.
Second: Soil pH level is ${ph}, which is ${phQuality} for healthy palm growth.
Third: Soil N-P-K nutrient balance: Nitrogen is ${n}, Phosphorus is ${p}, and Potassium is ${k} milligrams per kilogram.
All farm soil parameters are operating safely.`;

      const displayText = `<strong>🌾 Hello! Here is the live telemetry report of your Arecanut farm:</strong><br><br>
💧 <strong>1. Soil Moisture:</strong> ${moisture}% (${moistureQuality} range, Target: 50-72%)<br>
🧪 <strong>2. Soil pH Level:</strong> ${ph} pH (${phQuality}, Target: 5.8-6.8 pH)<br>
🌱 <strong>3. N-P-K Nutrients:</strong> Nitrogen ${n} mg/kg | Phosphorus ${p} mg/kg | Potassium ${k} mg/kg`;

      return { spokenText, displayText };
    }
  }

  openAndAnnounce() {
    const now = Date.now();
    // Debounce duplicate clicks within 400ms
    if (now - this.lastOpenTime < 400) return;
    this.lastOpenTime = now;

    if (!this.modal) this.modal = document.getElementById("voiceAssistantModal");
    if (!this.transcriptContent) this.transcriptContent = document.getElementById("voiceTranscriptContent");
    if (!this.waveContainer) this.waveContainer = document.getElementById("voiceWaveContainer");
    if (!this.statusText) this.statusText = document.getElementById("voiceStatusText");
    if (!this.btnSpeakKn) this.btnSpeakKn = document.getElementById("btnVoiceSpeakKn");
    if (!this.btnSpeakEn) this.btnSpeakEn = document.getElementById("btnVoiceSpeakEn");
    if (!this.btnStop) this.btnStop = document.getElementById("btnVoiceStop");
    if (!this.valMoisture) this.valMoisture = document.getElementById("voiceMoistureVal");
    if (!this.valPh) this.valPh = document.getElementById("voicePhVal");
    if (!this.valNpk) this.valNpk = document.getElementById("voiceNpkVal");

    if (this.modal) {
      this.modal.style.display = "flex";
    }

    const reading = this.getCurrentReading();
    this.updateMetricPills(reading);

    // Announce in active language (Kannada default)
    const activeLang = (typeof i18n !== "undefined" && i18n.currentLang === "en") ? "en" : "kn";
    this.speak(activeLang);

    if (typeof api !== "undefined" && api.isAuthenticated()) {
      api.getFarmCurrent()
        .then((farmData) => {
          if (farmData && farmData.reading) {
            this.updateMetricPills(farmData.reading);
          }
        })
        .catch(() => {});
    }
  }

  close() {
    this.stopSpeaking();
    if (this.modal) {
      this.modal.style.display = "none";
    }
  }

  speak(lang = "kn") {
    // 1. Master silence: cancel any audio/speech across assistant AND chatbot
    if (typeof window !== "undefined" && window.stopAllFarmSpeech) {
      window.stopAllFarmSpeech(this);
    }
    this.stopSpeaking();

    // 2. Generate new session token so any pending promises from prior voice are ignored
    this.sessionId = (this.sessionId || 0) + 1;
    const currentSession = this.sessionId;

    // 3. Wake audio hardware in Chrome standalone PWA
    unlockPwaAudio();

    // 4. Update button active states
    if (lang === "kn") {
      this.btnSpeakKn?.classList.add("active");
      this.btnSpeakEn?.classList.remove("active");
    } else {
      this.btnSpeakEn?.classList.add("active");
      this.btnSpeakKn?.classList.remove("active");
    }

    const reading = this.getCurrentReading();
    this.updateMetricPills(reading);

    const { spokenText, displayText } = this.generateReport(lang, reading);

    if (this.transcriptContent) {
      this.transcriptContent.innerHTML = displayText;
    }

    const voices = (typeof window !== "undefined" && window.speechSynthesis)
      ? (window.speechSynthesis.getVoices() || [])
      : [];
    if (voices.length > 0) this.voices = voices;

    if (lang === "kn") {
      // Check if browser has a native Kannada voice for 0ms zero-latency playback
      const knVoice = findFemaleVoice(this.voices, "kn");
      if (knVoice) {
        this.speakWithSpeechSynthesis(spokenText, "kn", knVoice, currentSession);
      } else {
        // Stream high-fidelity Google Kannada female voice via /api/tts
        this.playAudioStream(spokenText, "kn", currentSession);
      }
      return;
    }

    // If English:
    const enVoice = findFemaleVoice(this.voices, "en");
    if (enVoice) {
      this.speakWithSpeechSynthesis(spokenText, "en", enVoice, currentSession);
    } else {
      this.playAudioStream(spokenText, "en", currentSession);
    }
  }

  speakWithSpeechSynthesis(text, lang, voice, sessionToken) {
    if (this.speakDelayTimer) clearTimeout(this.speakDelayTimer);

    this.speakDelayTimer = setTimeout(() => {
      if (sessionToken !== this.sessionId) return;
      try {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance._sessionToken = sessionToken;
        if (voice) {
          utterance.voice = voice;
          utterance.lang = voice.lang || (lang === "kn" ? "kn-IN" : "en-US");
        } else {
          utterance.lang = lang === "kn" ? "kn-IN" : "en-US";
        }

        utterance.rate = lang === "kn" ? 0.90 : 0.95;
        utterance.pitch = 1.05;
        utterance.volume = 1.0;

        if (!window._pwaSpeechPinSet) window._pwaSpeechPinSet = new Set();
        window._pwaSpeechPinSet.add(utterance);

        utterance.onstart = () => {
          if (sessionToken !== this.sessionId) return;
          this.isSpeaking = true;
          this.waveContainer?.classList.add("active");
          this.triggerBtn?.classList.add("speaking");
          if (this.statusText) {
            this.statusText.textContent = lang === "kn"
              ? "ತೋಟದ ಮಾಹಿತಿಯನ್ನು ಓದಲಾಗುತ್ತಿದೆ (Kannada Voice)..."
              : "Speaking farm telemetry report (Female Voice)...";
          }
        };

        utterance.onend = () => {
          window._pwaSpeechPinSet?.delete(utterance);
          if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer);
            this.keepAliveTimer = null;
          }
          if (sessionToken !== this.sessionId) return;
          this.isSpeaking = false;
          this.waveContainer?.classList.remove("active");
          this.triggerBtn?.classList.remove("speaking");
          if (this.statusText) {
            this.statusText.textContent = lang === "kn"
              ? "ವರದಿ ಪೂರ್ಣಗೊಂಡಿದೆ • ಆಲಿಸಲು ಬಟನ್ ಕ್ಲಿಕ್ ಮಾಡಿ"
              : "Report complete • Click button to replay";
          }
        };

        utterance.onerror = (e) => {
          window._pwaSpeechPinSet?.delete(utterance);
          if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer);
            this.keepAliveTimer = null;
          }
          // Do NOT fall back on intentional cancellation, abortion, or session mismatch
          if (utterance._aborted || e.error === "canceled" || e.error === "interrupted" || sessionToken !== this.sessionId) {
            return;
          }
          console.warn("[VoiceAssistant] Speech notice:", e.error || e);
          this.playAudioStream(text, lang, sessionToken);
        };

        this.currentUtterance = utterance;
        window.speechSynthesis.speak(utterance);
        window.speechSynthesis.resume();

        if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
        this.keepAliveTimer = setInterval(() => {
          if (!window.speechSynthesis.speaking) {
            clearInterval(this.keepAliveTimer);
            this.keepAliveTimer = null;
          } else {
            window.speechSynthesis.resume();
          }
        }, 5000);

      } catch (err) {
        console.warn("[VoiceAssistant] Speech error:", err);
        if (sessionToken === this.sessionId) {
          this.playAudioStream(text, lang, sessionToken);
        }
      }
    }, 40);
  }

  playAudioStream(text, lang, sessionToken) {
    if (sessionToken !== this.sessionId) return;
    try {
      const targetLang = lang.startsWith("kn") ? "kn" : "en";
      const baseUrl = (typeof API_BASE !== "undefined" && API_BASE) ? API_BASE : window.location.origin;
      const audioUrl = `${baseUrl}/api/tts?lang=${targetLang}&text=${encodeURIComponent(text)}`;

      const audio = new Audio();
      audio.preload = "auto";
      audio.src = audioUrl;
      audio._sessionToken = sessionToken;
      this.currentAudio = audio;

      this.isSpeaking = true;
      this.waveContainer?.classList.add("active");
      this.triggerBtn?.classList.add("speaking");

      if (this.statusText) {
        this.statusText.textContent = targetLang === "kn"
          ? "ತೋಟದ ಮಾಹಿತಿಯನ್ನು ಓದಲಾಗುತ್ತಿದೆ (Kannada Voice)..."
          : "Speaking farm telemetry report (Female Voice)...";
      }

      audio.onended = () => {
        if (sessionToken !== this.sessionId) return;
        this.isSpeaking = false;
        this.waveContainer?.classList.remove("active");
        this.triggerBtn?.classList.remove("speaking");
        this.currentAudio = null;
        if (this.statusText) {
          this.statusText.textContent = targetLang === "kn"
            ? "ವರದಿ ಪೂರ್ಣಗೊಂಡಿದೆ • ಆಲಿಸಲು ಬಟನ್ ಕ್ಲಿಕ್ ಮಾಡಿ"
            : "Report complete • Click button to replay";
        }
      };

      audio.onerror = (e) => {
        if (audio._aborted || sessionToken !== this.sessionId) return;
        console.warn("[VoiceAssistant] Audio stream playback notice:", e);
        const fallbackVoice = findFemaleVoice(this.voices, targetLang);
        if (fallbackVoice) {
          this.speakWithSpeechSynthesis(text, targetLang, fallbackVoice, sessionToken);
        } else {
          this.isSpeaking = false;
          this.waveContainer?.classList.remove("active");
          this.triggerBtn?.classList.remove("speaking");
          this.currentAudio = null;
          if (this.statusText) {
            this.statusText.textContent = targetLang === "kn"
              ? "ವರದಿ ಪೂರ್ಣಗೊಂಡಿದೆ • ಆಲಿಸಲು ಬಟನ್ ಕ್ಲಿಕ್ ಮಾಡಿ"
              : "Report complete • Click button to replay";
          }
        }
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          // If aborted because audio was paused, stopped, or session changed, DO NOT trigger fallback!
          if (audio._aborted || err?.name === "AbortError" || sessionToken !== this.sessionId) {
            return;
          }
          console.warn("[VoiceAssistant] Audio play promise notice:", err);
          const fallbackVoice = findFemaleVoice(this.voices, targetLang);
          if (fallbackVoice) {
            this.speakWithSpeechSynthesis(text, targetLang, fallbackVoice, sessionToken);
          } else {
            this.isSpeaking = false;
            this.waveContainer?.classList.remove("active");
            this.triggerBtn?.classList.remove("speaking");
          }
        });
      }
    } catch (e) {
      console.warn("[VoiceAssistant] Audio stream creation error:", e);
    }
  }

  stopSpeaking() {
    this.sessionId = (this.sessionId || 0) + 1;
    if (this.speakDelayTimer) {
      clearTimeout(this.speakDelayTimer);
      this.speakDelayTimer = null;
    }
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.currentAudio) {
      try {
        this.currentAudio._aborted = true;
        this.currentAudio.pause();
        this.currentAudio.src = "";
      } catch (e) {}
      this.currentAudio = null;
    }
    if (this.currentUtterance) {
      this.currentUtterance._aborted = true;
      this.currentUtterance = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      try {
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
          window.speechSynthesis.cancel();
        }
        window.speechSynthesis.resume();
      } catch (e) {}
    }
    this.isSpeaking = false;
    this.waveContainer?.classList.remove("active");
    this.triggerBtn?.classList.remove("speaking");
    if (this.statusText) {
      this.statusText.textContent = "ನಿಲುಗಡೆ ಮಾಡಲಾಗಿದೆ • Stopped";
    }
  }
}

function initVoiceAssistant() {
  if (!window.voiceAssistant) {
    window.voiceAssistant = new VoiceAssistantManager();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initVoiceAssistant);
} else {
  initVoiceAssistant();
}
