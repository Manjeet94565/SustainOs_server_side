const Data = require("../models/Data");
const advanced = require("../services/advanced.service");

exports.forecast = async (req, res, next) => {
  try {
    const userId = req.user && req.user._id;
    const days = Math.max(1, Math.min(14, Number(req.query.days) || 7));
    const result = await advanced.generateForecast(userId, days);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.embedding = async (req, res, next) => {
  try {
    const userId = req.user && req.user._id;
    const q = req.body.query || "usage alert";
    const result = await advanced.embeddingSearch(userId, q, 5);
    res.json({ matches: result });
  } catch (err) {
    next(err);
  }
};

exports.edgeAnomaly = async (req, res, next) => {
  try {
    const userId = req.user && req.user._id;
    const result = await advanced.edgeAnomaly(userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.patterns = async (req, res, next) => {
  try {
    const userId = req.user && req.user._id;
    const result = await advanced.patternMine(userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.causal = async (req, res, next) => {
  try {
    const userId = req.user && req.user._id;
    const result = await advanced.causalHint(userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.autoThresholds = async (req, res, next) => {
  try {
    const userId = req.user && req.user._id;
    const result = await advanced.autoThresholds(userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.drift = async (req, res, next) => {
  try {
    const userId = req.user && req.user._id;
    const result = await advanced.driftCheck(userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.scenario = async (req, res, next) => {
  try {
    const userId = req.user && req.user._id;
    const latest = await Data.findOne({ userId }).sort({ createdAt: -1 });
    const reductions = req.body.reductions || { energy: 0, water: 0 };
    const result = advanced.scenarioSim(latest, reductions);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.optimize = async (req, res, next) => {
  try {
    const actions = req.body.actions || [];
    const result = advanced.optimizer(actions);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.saveRule = async (req, res, next) => {
  try {
    const userId = req.user && req.user._id;
    const { name, conditions, action } = req.body;
    if (!name || !Array.isArray(conditions)) return res.status(400).json({ msg: "Invalid rule" });
    const rule = await advanced.saveRule(userId, name, conditions, action);
    res.json({ success: true, rule });
  } catch (err) {
    next(err);
  }
};

exports.listRules = async (req, res, next) => {
  try {
    const userId = req.user && req.user._id;
    const rules = await advanced.listRules(userId);
    res.json({ success: true, rules });
  } catch (err) {
    next(err);
  }
};

exports.disagg = async (req, res, next) => {
  try {
    const userId = req.user && req.user._id;
    const result = await advanced.disaggregate(userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.backtestRule = async (req, res, next) => {
  try {
    const userId = req.user && req.user._id;
    const result = await advanced.ruleBacktest(userId, req.body.rule);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.persona = async (req, res, next) => {
  try {
    const userId = req.user && req.user._id;
    const result = await advanced.personaCluster(userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.abnormalDays = async (req, res, next) => {
  try {
    const userId = req.user && req.user._id;
    const result = await advanced.abnormalDays(userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.rollingBaseline = async (req, res, next) => {
  try {
    const userId = req.user && req.user._id;
    const thresholdPct = Math.max(10, Math.min(100, Number(req.query.thresholdPct) || 30));
    const result = await advanced.rollingBaseline(userId, thresholdPct);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.modelLeaderboard = async (req, res, next) => {
  try {
    const userId = req.user && req.user._id;
    const result = await advanced.modelLeaderboard(userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

exports.riskEngine = async (req, res, next) => {
  try {
    const userId = req.user && req.user._id;
    const result = await advanced.riskEngine(userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
};
