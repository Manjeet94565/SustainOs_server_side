const axios = require("axios");
const Data = require("../models/Data");
const Alert = require("../models/Alert");
const Rule = require("../models/Rule");
const ChatSession = require("../models/ChatSession");
const advancedService = require("./advanced.service");
const reportService = require("./report.service");
const { currentMonthKey, getGoalProgress, getGoalStreaks } = require("./goal.service");

const AI_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_API_URL = process.env.GEMINI_API_URL || "https://generativelanguage.googleapis.com/v1beta";
const MAX_SESSION_MESSAGES = 10;

const isProjectDocQuestion = (question = "") =>
  /sop|document|doc|policy|process|procedure|report/i.test(String(question));

const compactText = (value = "", limit = 900) => {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
};

const formatRules = (rules = []) =>
  rules.slice(0, 5).map((rule) => ({
    name: rule.name,
    action: rule.action,
    conditions: (rule.conditions || []).map((condition) => ({
      field: condition.field,
      operator: condition.operator || condition.op || "",
      value: condition.value,
    })),
  }));

const getOrCreateSession = async (userId, sessionId, question) => {
  if (sessionId) {
    const existing = await ChatSession.findOne({ _id: sessionId, userId });
    if (existing) return existing;
  }

  return ChatSession.create({
    userId,
    title: compactText(question || "Project Copilot Session", 60),
    messages: [],
  });
};

const appendSessionMessage = async (session, role, text) => {
  session.messages.push({ role, text: compactText(text, 4000), createdAt: new Date() });
  if (session.messages.length > MAX_SESSION_MESSAGES) {
    session.messages = session.messages.slice(-MAX_SESSION_MESSAGES);
  }
  await session.save();
};

const getSopContext = async (question) => {
  if (!isProjectDocQuestion(question)) return null;

  try {
    const response = await axios.post(`${AI_URL}/chat`, { question }, { timeout: 10000 });
    return compactText(response.data?.answer || response.data?.response || "", 1400);
  } catch (err) {
    return null;
  }
};

const buildProjectContext = async (userId, question) => {
  const [latest, recentHistory, recentAlerts, recentRules, reportSummary, forecast, anomaly, persona, baseline, goalProgress, goalStreaks, sopContext] =
    await Promise.all([
      Data.findOne({ userId }).sort({ timestamp: -1, createdAt: -1 }).lean(),
      Data.find({ userId }).sort({ timestamp: -1, createdAt: -1 }).limit(8).lean(),
      Alert.find({ userId }).sort({ createdAt: -1, time: -1 }).limit(5).lean(),
      Rule.find({ userId, enabled: true }).sort({ updatedAt: -1, createdAt: -1 }).limit(5).lean(),
      reportService.generateExecutiveSummaryText(userId),
      advancedService.generateForecast(userId, 3),
      advancedService.edgeAnomaly(userId),
      advancedService.personaCluster(userId),
      advancedService.rollingBaseline(userId, 30),
      getGoalProgress(userId, currentMonthKey()),
      getGoalStreaks(userId, currentMonthKey()),
      getSopContext(question),
    ]);

  return {
    latest: latest
      ? {
          water: Number(latest.water || 0),
          energy: Number(latest.energy || 0),
          timestamp: latest.timestamp || latest.createdAt,
          building: latest.building || "Unknown",
        }
      : null,
    recentHistory: recentHistory.map((item) => ({
      time: item.timestamp || item.createdAt,
      water: Number(item.water || 0),
      energy: Number(item.energy || 0),
    })),
    recentAlerts: recentAlerts.map((item) => ({
      severity: item.severity,
      message: item.message,
      time: item.time || item.createdAt,
    })),
    activeRules: formatRules(recentRules),
    reportSummary: compactText(reportSummary, 1200),
    forecast: forecast?.tomorrow ? forecast : null,
    anomaly: anomaly || null,
    persona: persona || null,
    baseline: baseline || null,
    goalProgress: goalProgress || null,
    goalStreaks: goalStreaks || null,
    sopContext,
  };
};

const buildGeminiPrompt = ({ question, context, session }) => {
  const historyText = (session.messages || [])
    .slice(-6)
    .map((message) => `${message.role.toUpperCase()}: ${compactText(message.text, 500)}`)
    .join("\n");

  return [
    "You are SustainOS Project Copilot.",
    "Answer only from the provided project context.",
    "If the context is missing, clearly say the data is unavailable instead of guessing.",
    "Reply in the same language style as the user's question. Hindi, English, and Hinglish are all allowed.",
    "Focus on this sustainability monitoring project only.",
    "",
    "PROJECT CONTEXT JSON:",
    JSON.stringify(context, null, 2),
    "",
    "RECENT CHAT HISTORY:",
    historyText || "No previous history.",
    "",
    `USER QUESTION: ${question}`,
    "",
    "Response format:",
    "1. Direct answer",
    "2. Reasoning based on project data",
    "3. If useful, 2-3 action points",
  ].join("\n");
};

const extractGeminiText = (payload) => {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  const text = parts
    .map((part) => part.text)
    .filter(Boolean)
    .join("\n")
    .trim();
  return text || null;
};

const queryGemini = async (prompt) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const response = await axios.post(
    `${GEMINI_API_URL}/models/${GEMINI_MODEL}:generateContent`,
    {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        topP: 0.9,
        maxOutputTokens: 900,
      },
    },
    {
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      timeout: 20000,
    }
  );

  return extractGeminiText(response.data);
};

const fallbackLocalAnswer = ({ question, context }) => {
  const parts = [];

  if (context.latest) {
    parts.push(
      `Latest reading: energy ${context.latest.energy} kWh, water ${context.latest.water} L at ${new Date(
        context.latest.timestamp
      ).toLocaleString()}.`
    );
  }

  if (context.forecast?.tomorrow) {
    parts.push(
      `Tomorrow forecast: energy ${context.forecast.tomorrow.energy} kWh, water ${context.forecast.tomorrow.water} L (confidence ${context.forecast.confidence || 0}%).`
    );
  }

  if (context.anomaly?.score) {
    parts.push(`Isolation Forest anomaly score: ${context.anomaly.score}.`);
  }

  if (context.persona?.persona) {
    parts.push(`Usage persona: ${context.persona.persona}. ${context.persona.tips?.[0] || ""}`.trim());
  }

  if (context.goalProgress?.hasGoal) {
    parts.push(
      `Goal progress: ${context.goalProgress.overallProgress || 0}% (status ${context.goalProgress.status || "UNKNOWN"}).`
    );
  }

  if (context.goalStreaks?.hasGoal) {
    parts.push(`Current goal streak: ${context.goalStreaks.streakDays} days; best streak ${context.goalStreaks.bestStreak}.`);
  }

  if (context.baseline?.explainer && /why|high|abnormal|baseline|kal|yesterday/i.test(question)) {
    parts.push(context.baseline.explainer);
  }

  if (context.sopContext) {
    parts.push(context.sopContext);
  }

  if (!parts.length) {
    return "I couldn't derive an answer from the local project data. Please check that data, goals, and ai-service are running.";
  }

  return parts.join(" ");
};

const answerProjectQuestion = async ({ userId, question, sessionId }) => {
  const session = await getOrCreateSession(userId, sessionId, question);
  const context = await buildProjectContext(userId, question);
  const prompt = buildGeminiPrompt({ question, context, session });

  let answer = null;
  let provider = "local-fallback";

  try {
    answer = await queryGemini(prompt);
    if (answer) provider = "gemini";
  } catch (err) {
    provider = "local-fallback";
  }

  if (!answer) {
    answer = fallbackLocalAnswer({ question, context });
  }

  await appendSessionMessage(session, "user", question);
  await appendSessionMessage(session, "assistant", answer);

  return {
    answer,
    provider,
    sessionId: String(session._id),
    contextSummary: {
      hasLatest: Boolean(context.latest),
      alertsUsed: context.recentAlerts.length,
      rulesUsed: context.activeRules.length,
      usedSopContext: Boolean(context.sopContext),
    },
  };
};

module.exports = {
  answerProjectQuestion,
};
