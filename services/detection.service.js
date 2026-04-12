/**
 * SustainOS – Detection Service (Upgraded)
 * Calls Python AI service for Z-Score based detection
 */

const checkAnomaly = require("../detectionEngine/anomalyChecker");
const Data = require("../models/Data");
const { getThreshold } = require("./threshold.service");

/**
 * Main detection function.
 * Call this after saving a new reading to MongoDB.
 *
 * @param {number} water    - current water reading
 * @param {number} energy   - current energy reading
 * @param {string} userId   - user's MongoDB ID
 */
exports.detect = async (water, energy, userId) => {
  try {
    // Get last 30 readings from MongoDB for this user
    const history = await Data.find({ userId })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    // Call Python AI (Z-Score detection)
    const aiResult = await checkAnomaly({ water, energy }, history);

    // Adaptive threshold check
    const adaptive = await getThreshold(userId);
    let thresholdTriggered = false;
    let thresholdReason = null;
    if (adaptive) {
      if (Number(water) > Number(adaptive.waterLimit || 0)) {
        thresholdTriggered = true;
        thresholdReason = `Water crossed adaptive limit ${adaptive.waterLimit}`;
      }
      if (Number(energy) > Number(adaptive.energyLimit || 0)) {
        thresholdTriggered = true;
        thresholdReason = thresholdReason
          ? `${thresholdReason}; Energy crossed limit ${adaptive.energyLimit}`
          : `Energy crossed adaptive limit ${adaptive.energyLimit}`;
      }
    }

    const finalStatus = aiResult.alert_needed || thresholdTriggered;
    const reason = thresholdTriggered ? thresholdReason : _buildReason(aiResult);
    const severity = thresholdTriggered ? "high" : _getSeverity(aiResult);

    return {
      status: finalStatus,
      aiResult,
      reason,
      severity,
      threshold: adaptive || null,
    };

  } catch (err) {
    console.error("Detection Service Error:", err.message);
    // Safe fallback
    return { status: false, reason: "Detection unavailable", severity: "low" };
  }
};


// Helper – ek simple reason string banao existing code ke liye
function _buildReason(aiResult) {
  const reasons = [];

  if (aiResult.anomalies?.water?.detected) {
    reasons.push(aiResult.anomalies.water.reason);
  }
  if (aiResult.anomalies?.energy?.detected) {
    reasons.push(aiResult.anomalies.energy.reason);
  }

  return reasons.length > 0 ? reasons.join(" | ") : "Normal operation";
}

function _getSeverity(aiResult) {
  const wSev = aiResult.anomalies?.water?.severity  || "none";
  const eSev = aiResult.anomalies?.energy?.severity || "none";

  if (wSev === "HIGH"   || eSev === "HIGH")   return "high";
  if (wSev === "MEDIUM" || eSev === "MEDIUM") return "medium";
  return "low";
}
