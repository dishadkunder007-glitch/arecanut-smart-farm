/**
 * Floating AI Farmer Advisor Chatbot
 * Answers questions grounded in live telemetry, with Groq Llama 3.3 LLM integration.
 * Includes Groq Whisper AI voice transcription + MediaRecorder + browser SpeechRecognition fallback
 * and manual Audio Speech Playback (Text-to-Speech).
 */

class ChatbotManager {
  constructor() {
    this.isOpen = false;
    this.groqConfigured = false;
    this.isListening = false;
    this.recognition = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.micStream = null;
    this.hasRecordedSpeech = false;
    this.finalTranscript = "";
    this.currentSpeakingBtn = null;
    this.silenceTimeout = null;
    this.maxRecordTimeout = null;
    this.voiceStatusTimeout = null;

    this.initElements();
    this.initSpeechSynthesis();
    this.bindEvents();
    this.checkGroqStatus();
    this.renderWelcome();
  }

  initElements() {
    this.triggerBtn = document.getElementById("floatingChatBtn");
    this.drawer = document.getElementById("chatDrawer");
    this.btnClose = document.getElementById("btnCloseChat");
    this.chatBody = document.getElementById("chatMessagesBody");
    this.input = document.getElementById("chatTextInput");
    this.btnSend = document.getElementById("btnSendChat");
    this.btnVoice = document.getElementById("btnVoiceChat");
    this.suggestionsContainer = document.getElementById("chatSuggestionsRow");

    // Voice status banner elements
    this.voiceStatusBar = document.getElementById("chatVoiceStatusBar");
    this.voiceStatusMsg = document.getElementById("voiceStatusMsg");
    this.voiceSoundwave = document.getElementById("voiceSoundwave");
    this.btnStopVoice = document.getElementById("btnStopVoiceListening");

    // Groq configuration elements
    this.groqStatusBadge = document.getElementById("groqStatusBadge");
    this.groqKeyBox = document.getElementById("groqKeyConfigBox");
    this.btnCloseGroqBox = document.getElementById("btnCloseGroqBox");
    this.groqApiKeyInput = document.getElementById("groqApiKeyInput");
    this.btnSaveGroqKey = document.getElementById("btnSaveGroqKey");
    this.groqKeyMsg = document.getElementById("groqKeyMsg");
  }

  showVoiceStatus(message, color = "#38bdf8", autoHideMs = null) {
    if (!this.voiceStatusBar || !this.voiceStatusMsg) return;
    this.voiceStatusBar.style.display = "flex";
    this.voiceStatusMsg.textContent = message;
    this.voiceStatusMsg.style.color = color;

    clearTimeout(this.voiceStatusTimeout);
    if (autoHideMs) {
      this.voiceStatusTimeout = setTimeout(() => {
        if (!this.isListening && this.voiceStatusBar) {
          this.voiceStatusBar.style.display = "none";
        }
      }, autoHideMs);
    }
  }

  hideVoiceStatus() {
    if (this.voiceStatusBar) {
      this.voiceStatusBar.style.display = "none";
    }
  }

  setMicButtonActive(isActive) {
    if (!this.btnVoice) return;
    if (isActive) {
      this.btnVoice.classList.add("listening");
      this.btnVoice.title = "Stop Recording";
      // Red stop square icon
      this.btnVoice.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <rect x="4" y="4" width="16" height="16" rx="3"></rect>
        </svg>
      `;
    } else {
      this.btnVoice.classList.remove("listening");
      const title = (typeof i18n !== "undefined" && i18n.t("btn_mic_title")) || "Voice Search (Speak question)";
      this.btnVoice.title = title;
      // Modern microphone SVG icon
      this.btnVoice.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
          <line x1="12" y1="19" x2="12" y2="23"></line>
          <line x1="8" y1="22" x2="16" y2="22"></line>
        </svg>
      `;
    }
  }

  async toggleVoiceInput() {
    if (this.isListening) {
      this.stopVoiceRecording(true);
      return;
    }

    // Stop speaking audio if playing
    this.stopSpeaking();

    const isKn = typeof i18n !== "undefined" && i18n.currentLang === "kn";

    // 1. Request microphone access
    try {
      this.showVoiceStatus(isKn ? "ಮೈಕ್ರೊಫೋನ್ ಸಕ್ರಿಯಗೊಳಿಸಲಾಗುತ್ತಿದೆ..." : "Opening microphone...", "#38bdf8");
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (permErr) {
      console.warn("Microphone access error:", permErr);
      const permMsg = isKn ?
        "⚠️ ಮೈಕ್ರೊಫೋನ್ ಅನುಮತಿ ಸಿಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಬ್ರೌಸರ್‌ನಲ್ಲಿ ಮೈಕ್ ಅನುಮತಿ ನೀಡಿ." :
        "⚠️ Microphone access denied. Please allow microphone permission in your browser address bar.";
      this.showVoiceStatus(permMsg, "#ef4444", 7000);
      return;
    }

    // 2. Start MediaRecorder for guaranteed Groq Whisper audio
    try {
      this.audioChunks = [];
      let mimeType = "audio/webm";
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          mimeType = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
          mimeType = "audio/webm";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          mimeType = "audio/mp4";
        } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
          mimeType = "audio/ogg";
        }
        this.mediaRecorder = new MediaRecorder(this.micStream, { mimeType });
        this.mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) this.audioChunks.push(e.data);
        };
        this.mediaRecorder.start(250);
      }
    } catch (e) {
      console.warn("MediaRecorder init notice:", e);
    }

    // 3. In parallel, start SpeechRecognition for live real-time preview (if supported)
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.hasRecordedSpeech = false;
    this.finalTranscript = "";

    if (SpeechRecognition) {
      try {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = isKn ? "kn-IN" : "en-IN";

        this.recognition.onresult = (event) => {
          let transcript = "";
          for (let i = 0; i < event.results.length; ++i) {
            transcript += event.results[i][0].transcript;
          }
          if (transcript.trim()) {
            this.hasRecordedSpeech = true;
            this.finalTranscript = transcript.trim();
            if (this.input) this.input.value = this.finalTranscript;

            // Silence debounce: 2.2s after speaking auto-finish
            clearTimeout(this.silenceTimeout);
            this.silenceTimeout = setTimeout(() => {
              if (this.isListening && this.hasRecordedSpeech) {
                this.stopVoiceRecording(true);
              }
            }, 2200);
          }
        };

        this.recognition.onerror = (event) => {
          console.info("SpeechRecognition interim note:", event.error);
        };

        this.recognition.start();
      } catch (err) {
        console.info("SpeechRecognition start note:", err);
      }
    }

    // Mark listening state and activate UI
    this.isListening = true;
    this.setMicButtonActive(true);
    if (this.voiceSoundwave) this.voiceSoundwave.style.display = "flex";
    const prompt = isKn ? "🎙️ ಆಲಿಸಲಾಗುತ್ತಿದೆ... ಮಾತನಾಡಿ (ಮುಗಿದಾಗ Done ಒತ್ತಿ)" : "🎙️ Listening... Speak now (Click Done when finished)";
    this.showVoiceStatus(prompt, "#34d399");

    // 15-second safety timeout
    clearTimeout(this.maxRecordTimeout);
    this.maxRecordTimeout = setTimeout(() => {
      if (this.isListening) {
        this.stopVoiceRecording(true);
      }
    }, 15000);
  }

  async stopVoiceRecording(processResult = true) {
    clearTimeout(this.silenceTimeout);
    clearTimeout(this.maxRecordTimeout);

    this.isListening = false;
    this.setMicButtonActive(false);

    if (this.voiceSoundwave) this.voiceSoundwave.style.display = "none";

    // Stop client SpeechRecognition
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
      this.recognition = null;
    }

    if (!processResult) {
      if (this.micStream) {
        this.micStream.getTracks().forEach(t => t.stop());
        this.micStream = null;
      }
      this.hideVoiceStatus();
      return;
    }

    const isKn = typeof i18n !== "undefined" && i18n.currentLang === "kn";

    // If client SpeechRecognition already captured words, send directly!
    if (this.finalTranscript && this.finalTranscript.trim().length > 1) {
      if (this.micStream) {
        this.micStream.getTracks().forEach(t => t.stop());
        this.micStream = null;
      }
      this.showVoiceStatus(`✓ "${this.finalTranscript}"`, "#38bdf8", 2000);
      setTimeout(() => this.sendMessage(), 300);
      return;
    }

    // Otherwise, utilize Groq Whisper AI backend for transcription
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.showVoiceStatus(
        isKn ? "⚡ AI ಮೂಲಕ ಧ್ವನಿ ಪರಿವರ್ತಿಸಲಾಗುತ್ತಿದೆ..." : "⚡ Transcribing voice with Groq AI...",
        "#38bdf8"
      );

      this.mediaRecorder.onstop = async () => {
        if (this.micStream) {
          this.micStream.getTracks().forEach(t => t.stop());
          this.micStream = null;
        }

        const mimeType = this.mediaRecorder.mimeType || "audio/webm";
        const audioBlob = new Blob(this.audioChunks, { type: mimeType });

        if (audioBlob.size < 500) {
          const noSoundMsg = isKn ? "ಧ್ವನಿ ಕೇಳಿಸಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೊಮ್ಮೆ ಮಾತನಾಡಿ." : "No voice heard. Please speak closer to your mic.";
          this.showVoiceStatus(noSoundMsg, "#fbbf24", 4000);
          return;
        }

        try {
          const lang = isKn ? "kn" : "en";
          const res = await api.transcribeVoice(audioBlob, lang);
          if (res && res.success && res.transcript && res.transcript.trim()) {
            const clean = res.transcript.trim();
            if (this.input) this.input.value = clean;
            this.showVoiceStatus(`✓ "${clean}"`, "#34d399", 2500);
            setTimeout(() => this.sendMessage(), 350);
          } else {
            const failMsg = (res && res.error) || (isKn ? "ಧ್ವನಿ ಸ್ಪಷ್ಟವಾಗಿ ಕೇಳಿಸಲಿಲ್ಲ. ಮತ್ತೊಮ್ಮೆ ಮಾತನಾಡಿ." : "Could not recognize words clearly. Please try again.");
            this.showVoiceStatus(failMsg, "#fbbf24", 4500);
          }
        } catch (err) {
          console.warn("Whisper transcription error:", err);
          this.showVoiceStatus("Voice error: " + err.message, "#ef4444", 4500);
        }
      };

      try {
        this.mediaRecorder.stop();
      } catch (e) {
        console.warn("mediaRecorder.stop error:", e);
      }
    } else {
      if (this.micStream) {
        this.micStream.getTracks().forEach(t => t.stop());
        this.micStream = null;
      }
      this.showVoiceStatus("No voice detected.", "#fbbf24", 3000);
    }
  }

  initSpeechSynthesis() {
    this.voices = [];
    if (typeof window !== "undefined" && window.speechSynthesis) {
      const load = () => {
        const v = window.speechSynthesis.getVoices();
        if (v && v.length > 0) this.voices = v;
      };
      load();
      window.speechSynthesis.onvoiceschanged = load;
    }
  }

  async getBestVoicesAsync(timeoutMs = 350) {
    if (typeof window === "undefined" || !window.speechSynthesis) return [];
    const direct = window.speechSynthesis.getVoices();
    if (direct && direct.length > 0) {
      this.voices = direct;
      return direct;
    }
    return new Promise((resolve) => {
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          const v = window.speechSynthesis.getVoices() || [];
          this.voices = v;
          resolve(v);
        }
      }, timeoutMs);
      const onVoices = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
          const v = window.speechSynthesis.getVoices() || [];
          this.voices = v;
          resolve(v);
        }
      };
      window.speechSynthesis.addEventListener("voiceschanged", onVoices, { once: true });
    });
  }

  cleanTextForSpeech(raw) {
    if (!raw) return "";
    let cleaned = raw
      .replace(/<[^>]*>/g, " ")
      .replace(/SUGGESTIONS:[\s\S]*$/i, "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/#{1,6}\s+/g, "")
      .replace(/^\s*[-*•]\s+/gm, "")
      .replace(/[^\w\s.,?!;:।%\-–—\u0C80-\u0CFF]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Limit voice speech to the first 350 characters (or nearest sentence) for snappy response
    if (cleaned.length > 350) {
      const match = cleaned.substring(0, 350).match(/(.*[.?!।])\s/);
      if (match && match[1] && match[1].length > 100) {
        cleaned = match[1];
      } else {
        cleaned = cleaned.substring(0, 350) + "...";
      }
    }
    return cleaned;
  }

  findFemaleVoice(voices, lang = "kn") {
    if (!voices || voices.length === 0) return null;
    if (lang === "kn") {
      return voices.find(v => v.lang && (v.lang.startsWith("kn") || v.lang.toLowerCase().includes("kannada")));
    }
    // English female voice selection
    const googleUs = voices.find(v => v.name === "Google US English");
    if (googleUs) return googleUs;
    const googleUkFemale = voices.find(v => v.name.includes("Google") && v.name.toLowerCase().includes("female"));
    if (googleUkFemale) return googleUkFemale;
    const zira = voices.find(v => v.name.includes("Zira"));
    if (zira) return zira;
    const anyFemale = voices.find(v => v.lang && v.lang.startsWith("en") && v.name.toLowerCase().includes("female"));
    if (anyFemale) return anyFemale;
    const indianFemale = voices.find(v => {
      const n = v.name.toLowerCase();
      return n.includes("heera") || n.includes("priya") || n.includes("veena") || n.includes("raveena");
    });
    if (indianFemale) return indianFemale;
    const anyEn = voices.find(v => v.lang && v.lang.startsWith("en"));
    return anyEn || null;
  }

  async speakMessage(buttonEl, msgTextId = null) {
    // 1. Master speech coordinator: stop voice assistant and any ongoing audio
    if (typeof window !== "undefined" && window.stopAllFarmSpeech) {
      window.stopAllFarmSpeech(this);
    }

    if (this.currentSpeakingBtn === buttonEl) {
      this.stopSpeaking();
      return;
    }

    // Stop ongoing speech
    this.stopSpeaking();

    // Generate new unique session token
    this.sessionId = (this.sessionId || 0) + 1;
    const currentSession = this.sessionId;

    // Wake Web Audio hardware pipeline for Chromium standalone PWA
    unlockPwaAudio();

    let textToSpeak = "";
    if (msgTextId) {
      const el = document.getElementById(msgTextId);
      if (el) textToSpeak = el.innerText || el.textContent;
    }
    if (!textToSpeak) {
      const bubble = buttonEl.closest(".chat-bubble-bot");
      if (bubble) {
        const textDiv = bubble.querySelector(".msg-text-content");
        textToSpeak = textDiv ? textDiv.innerText : bubble.innerText;
      }
    }

    const cleanText = this.cleanTextForSpeech(textToSpeak);
    if (!cleanText) return;

    // Detect language: check Kannada characters or current i18n state
    const hasKn = /[\u0C80-\u0CFF]/.test(cleanText) || (typeof i18n !== "undefined" && i18n.currentLang === "kn");
    const targetLang = hasKn ? "kn" : "en";

    // Load voices with async safety
    const voices = await this.getBestVoicesAsync(150);
    const selectedVoice = this.findFemaleVoice(voices, targetLang);

    if (selectedVoice) {
      // Fast 0ms native browser speech synthesis
      this.speakWithSpeechSynthesis(buttonEl, cleanText, targetLang === "kn" ? "kn-IN" : "en-US", selectedVoice, currentSession);
    } else {
      // High-fidelity fast backend Google TTS stream
      this.playAudioStream(cleanText, targetLang, buttonEl, currentSession);
    }
  }

  speakWithSpeechSynthesis(buttonEl, text, targetLang, selectedVoice, sessionToken) {
    if (this.chatSpeakDelayTimer) clearTimeout(this.chatSpeakDelayTimer);
    this.chatSpeakDelayTimer = setTimeout(() => {
      if (sessionToken !== this.sessionId) return;
      try {
        if (window.speechSynthesis && window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance._sessionToken = sessionToken;
        if (selectedVoice) {
          utterance.voice = selectedVoice;
          utterance.lang = selectedVoice.lang || targetLang;
        } else {
          utterance.lang = targetLang;
        }

        utterance.rate = targetLang.startsWith("kn") ? 0.90 : 0.95;
        utterance.pitch = 1.05;
        utterance.volume = 1.0;

        if (!window._pwaSpeechPinSet) window._pwaSpeechPinSet = new Set();
        window._pwaSpeechPinSet.add(utterance);

        utterance.onstart = () => {
          if (sessionToken !== this.sessionId) return;
          this.currentSpeakingBtn = buttonEl;
          buttonEl.classList.add("speaking");
          const icon = buttonEl.querySelector(".audio-icon");
          const label = buttonEl.querySelector(".audio-label");
          if (icon) icon.textContent = "⏹️";
          if (label) {
            const isKn = typeof i18n !== "undefined" && i18n.currentLang === "kn";
            label.textContent = (typeof i18n !== "undefined" && i18n.t("btn_stop_speak")) || (isKn ? "ನಿಲ್ಲಿಸಿ" : "Stop");
          }
        };

        utterance.onend = () => {
          window._pwaSpeechPinSet?.delete(utterance);
          if (this.speechKeepAliveTimer) {
            clearInterval(this.speechKeepAliveTimer);
            this.speechKeepAliveTimer = null;
          }
          if (sessionToken !== this.sessionId) return;
          this.resetSpeakingUI(buttonEl);
          if (this.currentSpeakingBtn === buttonEl) this.currentSpeakingBtn = null;
        };

        utterance.onerror = (e) => {
          window._pwaSpeechPinSet?.delete(utterance);
          if (this.speechKeepAliveTimer) {
            clearInterval(this.speechKeepAliveTimer);
            this.speechKeepAliveTimer = null;
          }
          // Do NOT fall back on intentional cancellation, abortion, or session change
          if (utterance._aborted || e.error === "canceled" || e.error === "interrupted" || sessionToken !== this.sessionId) {
            return;
          }
          console.warn("[Chatbot] Speech notice:", e.error || e);
          this.playAudioStream(text, targetLang.startsWith("kn") ? "kn" : "en", buttonEl, sessionToken);
        };

        this.currentUtterance = utterance;
        window.speechSynthesis.speak(utterance);
        window.speechSynthesis.resume();

        if (this.speechKeepAliveTimer) clearInterval(this.speechKeepAliveTimer);
        this.speechKeepAliveTimer = setInterval(() => {
          if (!window.speechSynthesis.speaking) {
            clearInterval(this.speechKeepAliveTimer);
            this.speechKeepAliveTimer = null;
          } else {
            window.speechSynthesis.resume();
          }
        }, 5000);

      } catch (err) {
        console.warn("[Chatbot] Speech error:", err);
        if (sessionToken === this.sessionId) {
          this.playAudioStream(text, targetLang.startsWith("kn") ? "kn" : "en", buttonEl, sessionToken);
        }
      }
    }, 40);
  }

  playAudioStream(text, lang, buttonEl, sessionToken) {
    if (sessionToken !== this.sessionId) return;
    try {
      this.stopSpeaking();
      const targetLang = lang.startsWith("kn") ? "kn" : "en";
      const baseUrl = (typeof API_BASE !== "undefined" && API_BASE) ? API_BASE : window.location.origin;
      const audioUrl = `${baseUrl}/api/tts?lang=${targetLang}&text=${encodeURIComponent(text)}`;

      const audio = new Audio();
      audio.preload = "auto";
      audio.src = audioUrl;
      audio._sessionToken = sessionToken;
      this.currentAudio = audio;
      this.currentSpeakingBtn = buttonEl;

      buttonEl.classList.add("speaking");
      const icon = buttonEl.querySelector(".audio-icon");
      const label = buttonEl.querySelector(".audio-label");
      if (icon) icon.textContent = "⏹️";
      if (label) {
        const isKn = typeof i18n !== "undefined" && i18n.currentLang === "kn";
        label.textContent = (typeof i18n !== "undefined" && i18n.t("btn_stop_speak")) || (isKn ? "ನಿಲ್ಲಿಸಿ" : "Stop");
      }

      audio.onended = () => {
        if (sessionToken !== this.sessionId) return;
        this.resetSpeakingUI(buttonEl);
        if (this.currentSpeakingBtn === buttonEl) this.currentSpeakingBtn = null;
        this.currentAudio = null;
      };

      audio.onerror = (e) => {
        if (audio._aborted || sessionToken !== this.sessionId) return;
        console.warn("[Chatbot] Audio stream error:", e);
        const fallbackVoice = this.findFemaleVoice(this.bestVoices, targetLang);
        if (fallbackVoice) {
          this.speakWithSpeechSynthesis(buttonEl, text, targetLang.startsWith("kn") ? "kn-IN" : "en-US", fallbackVoice, sessionToken);
        } else {
          this.resetSpeakingUI(buttonEl);
          if (this.currentSpeakingBtn === buttonEl) this.currentSpeakingBtn = null;
          this.currentAudio = null;
        }
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          // If aborted due to user pausing or new voice starting, DO NOT fall back!
          if (audio._aborted || err?.name === "AbortError" || sessionToken !== this.sessionId) {
            return;
          }
          console.warn("[Chatbot] Audio play promise notice:", err);
          const fallbackVoice = this.findFemaleVoice(this.bestVoices, targetLang);
          if (fallbackVoice) {
            this.speakWithSpeechSynthesis(buttonEl, text, targetLang.startsWith("kn") ? "kn-IN" : "en-US", fallbackVoice, sessionToken);
          } else {
            this.resetSpeakingUI(buttonEl);
            if (this.currentSpeakingBtn === buttonEl) this.currentSpeakingBtn = null;
          }
        });
      }
    } catch (e) {
      console.warn("[Chatbot] Audio stream initialization error:", e);
      this.resetSpeakingUI(buttonEl);
    }
  }

  stopSpeaking() {
    this.sessionId = (this.sessionId || 0) + 1;
    if (this.chatSpeakDelayTimer) {
      clearTimeout(this.chatSpeakDelayTimer);
      this.chatSpeakDelayTimer = null;
    }
    if (this.speechKeepAliveTimer) {
      clearInterval(this.speechKeepAliveTimer);
      this.speechKeepAliveTimer = null;
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
    if (this.currentSpeakingBtn) {
      this.resetSpeakingUI(this.currentSpeakingBtn);
      this.currentSpeakingBtn = null;
    }
  }

  resetSpeakingUI(buttonEl) {
    if (!buttonEl) return;
    buttonEl.classList.remove("speaking");
    const icon = buttonEl.querySelector(".audio-icon");
    const label = buttonEl.querySelector(".audio-label");
    if (icon) icon.textContent = "🔊";
    if (label) {
      const isKn = typeof i18n !== "undefined" && i18n.currentLang === "kn";
      label.textContent = (typeof i18n !== "undefined" && i18n.t("btn_speak_title")) || (isKn ? "ಉತ್ತರ ಆಲಿಸಿ" : "Listen");
    }
  }

  bindEvents() {
    this.triggerBtn?.addEventListener("click", () => this.toggleChat());
    this.btnClose?.addEventListener("click", () => this.toggleChat(false));
    this.btnSend?.addEventListener("click", () => this.sendMessage());
    this.btnVoice?.addEventListener("click", () => this.toggleVoiceInput());
    this.btnStopVoice?.addEventListener("click", () => this.stopVoiceRecording(true));

    this.input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.sendMessage();
    });

    // Groq key toggle & save
    this.groqStatusBadge?.addEventListener("click", () => {
      if (this.groqKeyBox) {
        const isHidden = this.groqKeyBox.style.display === "none";
        this.groqKeyBox.style.display = isHidden ? "block" : "none";
        if (isHidden && this.groqApiKeyInput) this.groqApiKeyInput.focus();
      }
    });

    this.btnCloseGroqBox?.addEventListener("click", () => {
      if (this.groqKeyBox) this.groqKeyBox.style.display = "none";
    });

    this.btnSaveGroqKey?.addEventListener("click", () => this.handleSaveGroqKey());
    this.groqApiKeyInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.handleSaveGroqKey();
    });

    document.addEventListener("languageChanged", () => {
      this.renderSuggestions();
      this.updateWelcomeMessage();
      this.updateI18nLabels();
    });
  }

  updateI18nLabels() {
    if (this.btnVoice && !this.isListening) {
      const micTitle = (typeof i18n !== "undefined" && i18n.t("btn_mic_title")) || "Voice Search (Speak your question)";
      this.btnVoice.setAttribute("title", micTitle);
    }
    const speakBtns = document.querySelectorAll(".btn-speak-msg:not(.speaking)");
    const isKn = typeof i18n !== "undefined" && i18n.currentLang === "kn";
    const speakLabel = (typeof i18n !== "undefined" && i18n.t("btn_speak_title")) || (isKn ? "ಉತ್ತರ ಆಲಿಸಿ" : "Listen");
    speakBtns.forEach(btn => {
      const label = btn.querySelector(".audio-label");
      if (label) label.textContent = speakLabel;
      btn.setAttribute("title", speakLabel);
    });
  }

  async checkGroqStatus() {
    try {
      const status = await api.getGroqStatus();
      this.groqConfigured = status.is_configured;
      this.updateGroqBadge(status);
    } catch (e) {
      console.warn("Groq status check error:", e);
    }
  }

  updateGroqBadge(status) {
    if (!this.groqStatusBadge) return;
    if (status.is_configured) {
      this.groqStatusBadge.textContent = "⚡ Groq Active";
      this.groqStatusBadge.style.background = "rgba(16, 185, 129, 0.2)";
      this.groqStatusBadge.style.color = "#34d399";
      this.groqStatusBadge.style.borderColor = "rgba(16, 185, 129, 0.4)";
      this.groqStatusBadge.title = `Powered by Groq Cloud (${status.model || 'Llama 3.3 70B'})`;
    } else {
      this.groqStatusBadge.textContent = "⚙️ Set Groq Key";
      this.groqStatusBadge.style.background = "rgba(245, 158, 11, 0.2)";
      this.groqStatusBadge.style.color = "#fbbf24";
      this.groqStatusBadge.style.borderColor = "rgba(245, 158, 11, 0.4)";
      this.groqStatusBadge.title = "Click to paste your Groq API Key";
    }
  }

  async handleSaveGroqKey() {
    const key = this.groqApiKeyInput?.value.trim();
    if (!key) {
      this.showGroqMsg("Please enter a valid Groq API key (starts with gsk_...)", false);
      return;
    }

    try {
      this.btnSaveGroqKey.disabled = true;
      this.btnSaveGroqKey.textContent = "Saving...";
      const res = await api.setGroqKey(key);
      this.showGroqMsg("✓ " + (res.message || "Groq key activated!"), true);
      this.groqConfigured = true;
      this.updateGroqBadge({ is_configured: true, model: "Llama 3.3 70B" });
      setTimeout(() => {
        if (this.groqKeyBox) this.groqKeyBox.style.display = "none";
        if (this.groqKeyMsg) this.groqKeyMsg.style.display = "none";
        if (this.groqApiKeyInput) this.groqApiKeyInput.value = "";
      }, 1800);
    } catch (err) {
      this.showGroqMsg("Error saving key: " + err.message, false);
    } finally {
      this.btnSaveGroqKey.disabled = false;
      this.btnSaveGroqKey.textContent = "Save";
    }
  }

  showGroqMsg(text, isSuccess) {
    if (!this.groqKeyMsg) return;
    this.groqKeyMsg.style.display = "block";
    this.groqKeyMsg.style.color = isSuccess ? "#34d399" : "#f87171";
    this.groqKeyMsg.textContent = text;
  }

  toggleChat(force = null) {
    this.isOpen = force !== null ? force : !this.isOpen;
    if (this.isOpen) {
      this.drawer?.classList.add("open");
      this.input?.focus();
      this.renderSuggestions();
      this.checkGroqStatus();
    } else {
      this.drawer?.classList.remove("open");
      this.stopSpeaking();
      this.stopVoiceRecording(false);
    }
  }

  renderWelcome() {
    const isKn = typeof i18n !== "undefined" && i18n.currentLang === "kn";
    const welcomeText = isKn ?
      "ನಮಸ್ಕಾರ! ನಾನು ನಿಮ್ಮ ಅಡಿಕೆ ತೋಟದ AI ಸಲಹೆಗಾರ. ನಿಮ್ಮ ತೋಟದ ಮಣ್ಣಿನ ತೇವಾಂಶ, ಪಂಪ್, ಗೊಬ್ಬರ (NPK) ಅಥವಾ ರೋಗಗಳ ಬಗ್ಗೆ ಕೇಳಬಹುದು." :
      "Namaskara! I am your Arecanut Farm AI Advisor. You can ask me anything about your current soil moisture, pump status, NPK fertilizer balance, or crop diseases.";

    this.appendMessage("bot", `<span id="botWelcomeText">${welcomeText}</span>`, false, "botWelcomeBubble");
    this.renderSuggestions();
  }

  updateWelcomeMessage() {
    const welcomeEl = document.getElementById("botWelcomeText");
    if (welcomeEl) {
      const isKn = typeof i18n !== "undefined" && i18n.currentLang === "kn";
      welcomeEl.textContent = isKn ?
        "ನಮಸ್ಕಾರ! ನಾನು ನಿಮ್ಮ ಅಡಿಕೆ ತೋಟದ AI ಸಲಹೆಗಾರ. ನಿಮ್ಮ ತೋಟದ ಮಣ್ಣಿನ ತೇವಾಂಶ, ಪಂಪ್, ಗೊಬ್ಬರ (NPK) ಅಥವಾ ರೋಗಗಳ ಬಗ್ಗೆ ಕೇಳಬಹುದು." :
        "Namaskara! I am your Arecanut Farm AI Advisor. You can ask me anything about your current soil moisture, pump status, NPK fertilizer balance, or crop diseases.";
    }
  }

  renderSuggestions() {
    if (!this.suggestionsContainer) return;
    const isKn = typeof i18n !== "undefined" && i18n.currentLang === "kn";

    const suggestions = isKn ? [
      "ನನ್ನ ತೋಟಕ್ಕೆ ನೀರು ಬೇಕೆ?",
      "ಪಂಪ್ ಏಕೆ ಓಡುತ್ತಿದೆ?",
      "ಗೊಬ್ಬರದ (NPK) ಮಟ್ಟ ಸರಿಯಿದೆಯೇ?",
      "ಇಂದು ತೋಟದಲ್ಲಿ ಏನು ಮಾಡಬೇಕು?",
      "ಕೊಳೆರೋಗದ ಅಪಾಯವಿದೆಯೇ?",
      "ಇಂದು ಎಷ್ಟು ನೀರು ಖರ್ಚಾಗಿದೆ?"
    ] : [
      "Does my farm need water?",
      "Why is the pump running?",
      "Is my NPK okay?",
      "What should I do today?",
      "Is there a disease risk?",
      "How much water did I use?"
    ];

    this.suggestionsContainer.innerHTML = suggestions.map(q => `
      <div class="chip-suggestion" onclick="window.chatbotManager.askQuickQuestion('${q.replace(/'/g, "\\'")}')">
        ${q}
      </div>
    `).join("");
  }

  askQuickQuestion(query) {
    if (this.input) {
      this.input.value = query;
      this.sendMessage();
    }
  }

  async sendMessage() {
    const text = this.input?.value.trim();
    if (!text) return;

    // Stop speaking previous message
    this.stopSpeaking();
    this.hideVoiceStatus();

    this.appendMessage("user", text);
    this.input.value = "";

    // Show typing indicator
    const typingId = "typing-" + Date.now();
    const thinkingText = (typeof i18n !== "undefined" && i18n.t("thinking")) || "Analyzing farm sensors...";
    this.appendMessage("bot", thinkingText, false, typingId);

    try {
      const currentLang = (typeof i18n !== "undefined" && i18n.currentLang) || "en";
      const res = await api.askChatbot(text, currentLang);
      const typingEl = document.getElementById(typingId);
      if (typingEl) typingEl.remove();

      this.appendMessage("bot", res.reply, res.is_demo);

      // Render suggested next questions
      if (res.suggested_actions && res.suggested_actions.length > 0) {
        this.suggestionsContainer.innerHTML = res.suggested_actions.map(a => `
          <div class="chip-suggestion" onclick="window.chatbotManager.askQuickQuestion('${a.replace(/'/g, "\\'")}')">
            ${a}
          </div>
        `).join("");
      }
    } catch (e) {
      const typingEl = document.getElementById(typingId);
      if (typingEl) typingEl.remove();
      const connErr = (typeof i18n !== "undefined" && i18n.t("chatbot_conn_error")) || "Connection error: ";
      this.appendMessage("bot", connErr + e.message);
    }
  }

  appendMessage(sender, text, isDemo = false, customId = null) {
    if (!this.chatBody) return;
    const div = document.createElement("div");
    div.className = `chat-bubble chat-bubble-${sender}`;
    if (customId) div.id = customId;

    let tag = "";
    let actions = "";
    const isKn = typeof i18n !== "undefined" && i18n.currentLang === "kn";
    const msgTextId = "msg-text-" + Math.random().toString(36).substr(2, 9);

    if (sender === "bot") {
      if (isDemo) {
        const demoTag = (typeof i18n !== "undefined" && i18n.t("demo_data_tag")) || "DEMO DATA";
        tag = `<div style="font-size: 0.65rem; color: #f59e0b; font-weight: 800; margin-bottom: 4px; text-transform: uppercase;">
          ${demoTag} <span style="font-weight: normal; opacity: 0.8;">(Add Groq Key for full AI)</span>
        </div>`;
      } else {
        tag = `<div style="font-size: 0.65rem; color: #38bdf8; font-weight: 800; margin-bottom: 4px; text-transform: uppercase; display: flex; align-items: center; gap: 4px;">
          <span>⚡ GROQ AI (LLAMA 3.3 70B)</span>
        </div>`;
      }

      // If this is NOT a typing indicator, render the manual "Listen to answer" audio button
      if (!customId || !customId.startsWith("typing-")) {
        const speakTitle = (typeof i18n !== "undefined" && i18n.t("btn_speak_title")) || (isKn ? "ಉತ್ತರ ಆಲಿಸಿ" : "Listen to answer");
        const speakLabel = isKn ? "ಉತ್ತರ ಆಲಿಸಿ" : "Listen";
        actions = `
          <div class="chat-bubble-actions">
            <button class="btn-speak-msg" type="button" title="${speakTitle}" onclick="window.chatbotManager.speakMessage(this, '${msgTextId}')">
              <span class="audio-icon">🔊</span>
              <span class="audio-label">${speakLabel}</span>
            </button>
          </div>
        `;
      }
    }

    div.innerHTML = `${tag}<div id="${msgTextId}" class="msg-text-content">${text}</div>${actions}`;
    this.chatBody.appendChild(div);
    this.chatBody.scrollTop = this.chatBody.scrollHeight;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.chatbotManager = new ChatbotManager();
});

