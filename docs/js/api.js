/**
 * API Client and Real-Time WebSocket Telemetry Connector
 * Abstracts backend REST calls and WebSocket streaming.
 */

const API_BASE = window.location.origin;

class ApiClient {
  constructor() {
    this.token = localStorage.getItem("areca_token") || null;
    this.user = JSON.parse(localStorage.getItem("areca_user") || "null");
    this.ws = null;
    this.wsListeners = [];
    this.connectWebSocket();
  }

  setSession(token, user) {
    this.token = token;
    this.user = user;
    localStorage.setItem("areca_token", token);
    localStorage.setItem("areca_user", JSON.stringify(user));
  }

  clearSession() {
    this.token = null;
    this.user = null;
    localStorage.removeItem("areca_token");
    localStorage.removeItem("areca_user");
  }

  isAuthenticated() {
    return !!this.token;
  }

  getHeaders() {
    const headers = { "Content-Type": "application/json" };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const opts = {
      ...options,
      headers: { ...this.getHeaders(), ...(options.headers || {}) }
    };

    try {
      const res = await fetch(url, opts);
      if (res.status === 401) {
        this.clearSession();
        window.location.reload();
        throw new Error("Session expired. Please sign in again.");
      }
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ detail: "Request failed" }));
        throw new Error(errorData.detail || `Server returned status ${res.status}`);
      }
      return await res.json();
    } catch (err) {
      console.error(`API Error on ${endpoint}:`, err);
      throw err;
    }
  }

  // Auth Endpoints
  async loginAdmin(email, password) {
    return this.request("/api/auth/admin/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
  }

  async loginFarmer(phone, password) {
    return this.request("/api/auth/farmer/login", {
      method: "POST",
      body: JSON.stringify({ phone, password })
    });
  }

  // Farm Overview & Telemetry
  async getFarmCurrent(farmId = null) {
    const query = farmId ? `?farm_id=${farmId}` : "";
    return this.request(`/api/farm/current${query}`);
  }

  async getHistory(rangeFilter = "7days") {
    return this.request(`/api/farm/readings/history?range_filter=${rangeFilter}`);
  }

  async getIrrigationEvents(rangeFilter = "7days") {
    return this.request(`/api/irrigation/events?range_filter=${rangeFilter}`);
  }

  async createIrrigationEvent(eventData) {
    return this.request("/api/irrigation/events", {
      method: "POST",
      body: JSON.stringify(eventData)
    });
  }

  async updateIrrigationEvent(eventId, eventData) {
    return this.request(`/api/irrigation/events/${eventId}`, {
      method: "PUT",
      body: JSON.stringify(eventData)
    });
  }

  async deleteIrrigationEvent(eventId) {
    return this.request(`/api/irrigation/events/${eventId}`, {
      method: "DELETE"
    });
  }

  async getAlerts() {
    return this.request("/api/alerts");
  }

  async deleteAlert(alertId) {
    return this.request(`/api/alerts/${alertId}`, {
      method: "DELETE"
    });
  }

  async resolveAlert(alertId) {
    return this.request(`/api/alerts/${alertId}/resolve`, {
      method: "POST"
    });
  }

  // Irrigation Controls
  async controlPump(action, reason = "Manual farmer control") {
    return this.request("/api/irrigation/pump", {
      method: "POST",
      body: JSON.stringify({ action, reason })
    });
  }

  async controlValve(valveIndex, action) {
    return this.request("/api/irrigation/valve", {
      method: "POST",
      body: JSON.stringify({ valve_index: valveIndex, action })
    });
  }

  async setOperatingMode(mode) {
    return this.request("/api/irrigation/mode", {
      method: "POST",
      body: JSON.stringify({ mode })
    });
  }

  async resetDryRunLockout() {
    return this.request("/api/irrigation/reset-dry-run", {
      method: "POST",
      body: JSON.stringify({ reset: true })
    });
  }

  // Disease Detection
  async getDiseaseSamples() {
    return this.request("/api/disease/samples");
  }

  async detectDisease(organ = "Auto", sampleId = null, customImageBase64 = null) {
    return this.request("/api/disease/detect", {
      method: "POST",
      body: JSON.stringify({
        organ: organ || "Auto",
        sample_id: sampleId,
        custom_image_base64: customImageBase64
      })
    });
  }

  // Advisor & Chatbot
  async askChatbot(message, language = "en") {
    return this.request("/api/advisor/chat", {
      method: "POST",
      body: JSON.stringify({ message, language })
    });
  }

  async getGroqStatus() {
    return this.request("/api/advisor/groq-status");
  }

  async setGroqKey(apiKey) {
    return this.request("/api/advisor/groq-key", {
      method: "POST",
      body: JSON.stringify({ api_key: apiKey })
    });
  }

  async transcribeVoice(audioBlob, language = "en") {
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");
    formData.append("lang", language);
    const headers = {};
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    const res = await fetch(`${this.baseUrl}/api/advisor/voice-transcribe`, {
      method: "POST",
      headers,
      body: formData
    });
    return res.json();
  }


  // OLED Data
  async getOledData(farmId = 1) {
    return this.request(`/api/oled/data?farm_id=${farmId}`);
  }

  // Simulation Scenario Switcher
  async setSimulationScenario(scenario) {
    return this.request("/api/simulation/scenario", {
      method: "POST",
      body: JSON.stringify({ scenario })
    });
  }

  // Admin Endpoints
  async getAdminOverview() {
    return this.request("/api/admin/overview");
  }

  async getAdminFarmers() {
    return this.request("/api/admin/farmers");
  }

  async createFarmer(farmerData) {
    return this.request("/api/admin/farmers", {
      method: "POST",
      body: JSON.stringify(farmerData)
    });
  }

  async deleteFarmer(farmerId) {
    return this.request(`/api/admin/farmers/${farmerId}`, {
      method: "DELETE"
    });
  }

  async updateThresholds(farmId, thresholds) {
    return this.request(`/api/admin/farms/${farmId}/thresholds`, {
      method: "PUT",
      body: JSON.stringify(thresholds)
    });
  }

  // WebSocket Live Stream
  connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/telemetry`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log("WebSocket connected to Areca IoT Telemetry Stream");
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.wsListeners.forEach(fn => fn(data));
        } catch (e) {
          console.error("Error parsing WS packet:", e);
        }
      };

      this.ws.onclose = () => {
        setTimeout(() => this.connectWebSocket(), 4000);
      };

      this.ws.onerror = (err) => {
        console.warn("WebSocket error, falling back:", err);
      };
    } catch (e) {
      console.warn("Could not initiate WebSocket:", e);
    }
  }

  onTelemetryUpdate(callback) {
    this.wsListeners.push(callback);
  }
}

const api = new ApiClient();
window.api = api;
