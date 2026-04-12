/**
 * SustainOS – Anomaly Checker (Upgraded)
 * Ab hardcoded nahi – Python AI service se Z-Score leta hai
 */

const axios = require("axios");

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

/**
 * @param {Object} data        - { water, energy }
 * @param {Array}  history     - last 30 MongoDB readings
 */
module.exports = async (data, history = []) => {
  try {
    const water_history  = history.map((r) => r.water  || 0);
    const energy_history = history.map((r) => r.energy || 0);

    const response = await axios.post(`${AI_SERVICE_URL}/analyze`, {
      water_current:  data.water,
      energy_current: data.energy,
      water_history,
      energy_history,
    });

    return response.data;

  } catch (err) {
    // Fallback – Python service down ho toh simple check
    console.warn("⚠️  AI Service unavailable, using fallback detection.");
    return _fallbackCheck(data);
  }
};


// Fallback – simple check agar Python service nahi chal raha
function _fallbackCheck(data) {
  // ✅ Safe fallback – NO hardcoded thresholds (per Task 2 requirement)
  // Just acknowledge service unavailable, no false alerts
  
  return {
    anomalies: {
      water:  { detected: false, type: "normal", severity: "none", z_score: 0, reason: "AI service unavailable" },
      energy: { detected: false, type: "normal", severity: "none", z_score: 0, reason: "AI service unavailable" },
    },
    score: { score: 50, grade: "Pending AI", message: "Service temporarily unavailable" },
    suggestions: {
      water:    { message: "⏳ Awaiting AI analysis", action_needed: false },
      energy:   { message: "⏳ Awaiting AI analysis", action_needed: false },
      combined: "AI service restart needed",
    },
    alert_needed: false,  // No alerts on fallback
  };
}
