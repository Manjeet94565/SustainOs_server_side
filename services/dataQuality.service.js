const DataQualityLog = require("../models/DataQualityLog");

const safeStd = (arr) => {
  if (!arr.length) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / arr.length;
  return Math.sqrt(variance);
};

const zScore = (current, history) => {
  if (history.length < 5) return 0;
  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  const std = safeStd(history);
  if (std === 0) return 0;
  return (current - mean) / std;
};

const evaluateIncomingData = ({ building, water, energy, recentRecords = [] }) => {
  const issues = [];
  let score = 100;

  const trimBuilding = String(building || "").trim();
  if (trimBuilding.length < 2) {
    issues.push({ code: "BUILDING_SHORT", severity: "MEDIUM", message: "Building name too short." });
    score -= 15;
  }

  if (!Number.isFinite(water) || !Number.isFinite(energy)) {
    issues.push({ code: "NON_NUMERIC", severity: "HIGH", message: "Water/Energy must be valid numbers." });
    score -= 50;
  }

  const waterHistory = recentRecords.map((r) => Number(r.water || 0)).filter(Number.isFinite);
  const energyHistory = recentRecords.map((r) => Number(r.energy || 0)).filter(Number.isFinite);

  const waterZ = Math.abs(zScore(Number(water), waterHistory));
  const energyZ = Math.abs(zScore(Number(energy), energyHistory));

  if (waterZ > 4) {
    issues.push({ code: "WATER_OUTLIER", severity: "HIGH", message: "Water reading is extreme compared to history." });
    score -= 30;
  } else if (waterZ > 3) {
    issues.push({ code: "WATER_SPIKE", severity: "MEDIUM", message: "Water reading significantly deviates from trend." });
    score -= 15;
  }

  if (energyZ > 4) {
    issues.push({ code: "ENERGY_OUTLIER", severity: "HIGH", message: "Energy reading is extreme compared to history." });
    score -= 30;
  } else if (energyZ > 3) {
    issues.push({ code: "ENERGY_SPIKE", severity: "MEDIUM", message: "Energy reading significantly deviates from trend." });
    score -= 15;
  }

  const latest = recentRecords[0];
  if (latest) {
    const sameReading = Number(latest.water) === Number(water) && Number(latest.energy) === Number(energy);
    const latestTime = new Date(latest.timestamp || latest.createdAt || Date.now()).getTime();
    const withinFiveMinutes = Date.now() - latestTime < 5 * 60 * 1000;

    if (sameReading && withinFiveMinutes) {
      issues.push({ code: "POSSIBLE_DUPLICATE", severity: "LOW", message: "Reading appears duplicated within short interval." });
      score -= 8;
    }
  }

  score = Math.max(0, Math.round(score));
  const status = score >= 80 ? "GOOD" : score >= 50 ? "WARNING" : "CRITICAL";

  return { score, status, issues };
};

const saveQualityLog = async ({ userId, dataId, quality }) => {
  return DataQualityLog.create({
    userId,
    dataId,
    score: quality.score,
    status: quality.status,
    issues: quality.issues,
  });
};

const getQualitySummary = async (userId, limit = 30) => {
  const logs = await DataQualityLog.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
  if (!logs.length) {
    return {
      avgScore: 100,
      criticalCount: 0,
      warningCount: 0,
      recentIssues: [],
    };
  }

  const avgScore = Math.round(logs.reduce((sum, l) => sum + Number(l.score || 0), 0) / logs.length);
  const criticalCount = logs.filter((l) => l.status === "CRITICAL").length;
  const warningCount = logs.filter((l) => l.status === "WARNING").length;
  const recentIssues = logs
    .flatMap((l) => l.issues || [])
    .slice(0, 5)
    .map((i) => i.message);

  return { avgScore, criticalCount, warningCount, recentIssues };
};

module.exports = {
  evaluateIncomingData,
  saveQualityLog,
  getQualitySummary,
};
