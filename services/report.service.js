const Data = require("../models/Data");
const Alert = require("../models/Alert");
const scoreService = require("./sustainabilityScore.engine");
const forecastService = require("./forecast.service");
const { currentMonthKey, getGoalProgress } = require("./goal.service");
const dataQualityService = require("./dataQuality.service");

const toMonthLabel = (date) =>
  new Date(date).toLocaleDateString("en-IN", { month: "short", year: "numeric" });

const buildMonthly = (records) => {
  const map = new Map();
  records.forEach((r) => {
    const d = new Date(r.timestamp || r.createdAt || Date.now());
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!map.has(key)) {
      map.set(key, { key, month: toMonthLabel(d), water: 0, energy: 0, count: 0 });
    }
    const item = map.get(key);
    item.water += Number(r.water || 0);
    item.energy += Number(r.energy || 0);
    item.count += 1;
  });

  return [...map.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(-6)
    .map((m) => ({
      month: m.month,
      water: Math.round(m.water),
      energy: Math.round(m.energy),
      efficiency: Math.max(0, Math.round(100 - (m.energy / Math.max(1, m.count * 10) + m.water / Math.max(1, m.count * 40)))),
    }));
};

const executiveRecommendation = ({ score, quality, goalProgress, forecast }) => {
  const lines = [];

  if (score.score < 60) lines.push("Prioritize immediate reduction in peak usage windows.");
  else if (score.score < 80) lines.push("System is stable but efficiency opportunities remain.");
  else lines.push("Current sustainability posture is strong.");

  if (goalProgress.hasGoal) {
    if (goalProgress.overallProgress >= 100) lines.push("Monthly usage target reached. Tighten next month's target.");
    else lines.push(`Goal progress at ${goalProgress.overallProgress}%. Keep usage under control to meet target.`);
  } else {
    lines.push("Set a monthly water and energy target to enable goal tracking.");
  }

  if (quality.avgScore < 80) lines.push("Improve sensor/data quality checks before decisioning.");

  if (forecast?.tomorrow) {
    lines.push(
      `Tomorrow forecast: ${forecast.tomorrow.energy} kWh energy, ${forecast.tomorrow.water} L water.`
    );
  }

  return lines.join(" ");
};

exports.generateReportData = async (userId) => {
  const filter = userId ? { userId } : {};

  const data = await Data.find(filter).sort({ timestamp: 1 }).lean();
  const alerts = await Alert.find(filter).lean();

  const totalWater = Math.round(data.reduce((a, b) => a + Number(b.water || 0), 0));
  const totalEnergy = Math.round(data.reduce((a, b) => a + Number(b.energy || 0), 0));

  const cost = Number(((totalEnergy * 8) + (totalWater * 0.02)).toFixed(2));
  const carbon = Number((totalEnergy * 0.82).toFixed(2));

  const score = userId
    ? await scoreService.calculateScore(userId)
    : { score: 0, breakdown: { base: 100, penalties: { water: 0, energy: 0, alerts: 0, spikes: 0, trend: 0 }, final: 0 } };

  const forecast = userId
    ? await forecastService.generateForecast(userId, 7)
    : { hasData: false, horizonDays: 7, tomorrow: { water: 0, energy: 0 }, points: [], confidence: 0 };

  const goalProgress = userId
    ? await getGoalProgress(userId, currentMonthKey())
    : { hasGoal: false, overallProgress: 0, status: "NO_GOAL", month: currentMonthKey() };

  const quality = userId
    ? await dataQualityService.getQualitySummary(userId, 30)
    : { avgScore: 100, criticalCount: 0, warningCount: 0, recentIssues: [] };

  const monthly = buildMonthly(data);

  return {
    totalWater,
    totalEnergy,
    alerts: alerts.length,
    cost,
    carbon,
    monthly,
    score,
    forecast,
    goalProgress,
    quality,
    recommendation: executiveRecommendation({ score, quality, goalProgress, forecast }),
  };
};

exports.generateExecutiveSummaryText = async (userId) => {
  const report = await exports.generateReportData(userId);

  return [
    `Executive Summary for ${report.goalProgress.month}`,
    `Total Energy: ${report.totalEnergy} kWh, Total Water: ${report.totalWater} L, Carbon: ${report.carbon} kg CO2.`,
    `Sustainability Score: ${report.score.score}/100 (Risk: ${report.score.risk || "UNKNOWN"}).`,
    `Data Quality Score: ${report.quality.avgScore}/100 with ${report.quality.criticalCount} critical checks.`,
    report.goalProgress.hasGoal
      ? `Goal Progress: ${report.goalProgress.overallProgress}% (${report.goalProgress.status}).`
      : "No monthly goal configured.",
    report.forecast?.tomorrow
      ? `Tomorrow Forecast: Energy ${report.forecast.tomorrow.energy} kWh, Water ${report.forecast.tomorrow.water} L (confidence ${report.forecast.confidence}%).`
      : "Forecast unavailable.",
    `Recommendation: ${report.recommendation}`,
  ].join(" ");
};
