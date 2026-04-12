const intentEngine = require("./intent.engine");
const advanced = require("../services/advanced.service");
const scoreService = require("../services/sustainabilityScore.engine");
const { generateExecutiveSummaryText } = require("../services/report.service");
const Data = require("../models/Data");

exports.generateDecision = async (intent, context = {}, userId) => {
  try {
    if (!userId) return "Unauthorized: user context missing.";

    const latest = await Data.findOne({ userId }).sort({ createdAt: -1 });
    const score = await scoreService.calculateScore(userId);

    switch (intent) {
      case "summary": {
        const summary = await generateExecutiveSummaryText(userId);
        return summary;
      }
      case "report": {
        return "To export report, use Export Executive PDF in Reports page or ask 'export report'.";
      }
      case "forecast": {
        const f = await advanced.generateForecast(userId, 7);
        return `Tomorrow: energy ${f?.tomorrow?.energy || 0} kWh, water ${f?.tomorrow?.water || 0} L (confidence ${f?.confidence || 0}%).`;
      }
      case "embedding": {
        const matches = await advanced.embeddingSearch(userId, context.question || "alert", 3);
        if (!matches.length) return "No similar alerts found.";
        return matches.map((m) => `• ${m.severity}: ${m.message}`).join("\n");
      }
      case "anomaly": {
        const res = await advanced.edgeAnomaly(userId);
        return `Edge anomaly score: ${res.score}/100.`;
      }
      case "patterns": {
        const pat = await advanced.patternMine(userId);
        return pat.length ? pat.map((p) => `${p.transition} (${p.count})`).join(", ") : "No alert pattern yet.";
      }
      case "causal": {
        const c = await advanced.causalHint(userId);
        return `${c.hint} (strength ${c.strength || 0})`;
      }
      case "threshold": {
        const t = await advanced.autoThresholds(userId);
        return `Suggested thresholds -> water: ${t.water}, energy: ${t.energy}`;
      }
      case "drift": {
        const d = await advanced.driftCheck(userId);
        return d.drift ? "Data drift detected." : "No drift detected.";
      }
      case "score":
        return `Sustainability Score: ${score.score}/100 (water penalty ${score.breakdown?.penalties?.water || 0}, energy penalty ${score.breakdown?.penalties?.energy || 0}).`;
      default: {
        return "I can answer summary, report, forecast, embedding, anomaly, patterns, causal, threshold, drift, score.";
      }
    }
  } catch (err) {
    console.log("Decision Engine Error:", err);
    return "AI system error while analyzing data.";
  }
};
