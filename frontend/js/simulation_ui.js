/**
 * Simulation Control Layer UI
 * Allows farmer or tester to inject conditions (Dry-Run, Low Water, Acidic Soil, High Heat)
 */

class SimulationUI {
  constructor() {
    this.scenarioSelect = document.getElementById("demoScenarioSelect");
    this.bindEvents();
  }

  bindEvents() {
    if (this.scenarioSelect) {
      this.scenarioSelect.addEventListener("change", async (e) => {
        const scenario = e.target.value;
        try {
          await api.setSimulationScenario(scenario);
          console.log("Simulation scenario switched to:", scenario);
          // Highlight visual feedback
          if (scenario === "dry_run") {
            alert(i18n.t("dry_run_injected_alert"));
          } else if (scenario === "low_water") {
            alert(i18n.t("low_water_injected_alert"));
          }
        } catch (err) {
          console.error("Failed to set scenario:", err);
        }
      });
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.simulationUI = new SimulationUI();
});
