/**
 * SustainOS AI Intent Detection Engine
 */

const intents = {
  water: ["water", "leak", "usage", "litre", "liter", "consumption", "pipeline", "tank", "flow"],
  energy: ["energy", "electricity", "power", "kwh", "current", "voltage", "load", "units"],
  alert: ["alert", "warning", "issue", "problem", "fault", "error", "notification"],
  cost: ["cost", "bill", "expense", "price", "money", "charge", "payment"],
  carbon: ["carbon", "co2", "emission", "pollution", "footprint", "environment"],
  prediction: ["predict", "prediction", "forecast", "tomorrow", "next", "future", "estimate"],
  score: ["score", "rating", "efficiency", "performance", "sustainability"],
  history: ["history", "previous", "past", "last", "records", "log", "data"],
  cause: ["cause", "reason", "why", "root"],
  suggestion: ["suggest", "tip", "improve", "optimize", "save", "recommend"],
  report: ["report", "pdf", "executive", "download", "export"],
  summary: ["summary", "overall", "status"],
  forecast: ["forecast", "predict"],
  embedding: ["similar", "like", "related"],
  anomaly: ["anomaly", "outlier"],
  patterns: ["pattern", "sequence"],
  threshold: ["threshold", "limit"],
  drift: ["drift", "distribution"],
};

exports.detectIntent = (question) => {
  if (!question || typeof question !== "string") return "unknown";
  const q = question.toLowerCase();
  let detected = "unknown";
  let maxMatch = 0;
  for (const intent in intents) {
    const keywords = intents[intent];
    let score = 0;
    keywords.forEach((word) => {
      if (q.includes(word)) score += 1;
    });
    if (score > maxMatch) {
      maxMatch = score;
      detected = intent;
    }
  }
  return detected;
};
