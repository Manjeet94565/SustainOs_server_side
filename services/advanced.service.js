const Data = require("../models/Data");
const Alert = require("../models/Alert");
const Rule = require("../models/Rule");
const { generateForecast } = require("./forecast.service");
const { getGoalProgress, getGoalStreaks, currentMonthKey } = require("./goal.service");
const dataQualityService = require("./dataQuality.service");

const simpleBoW = (text = "") =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

const cosine = (a, b) => {
  const map = new Map();
  a.forEach((w) => map.set(w, (map.get(w) || 0) + 1));
  const mapB = new Map();
  b.forEach((w) => mapB.set(w, (mapB.get(w) || 0) + 1));
  let dot = 0;
  let normA = 0;
  let normB = 0;
  map.forEach((v, k) => {
    normA += v * v;
    if (mapB.has(k)) dot += v * mapB.get(k);
  });
  mapB.forEach((v) => (normB += v * v));
  if (!normA || !normB) return 0;
  return dot / Math.sqrt(normA * normB);
};

const embeddingSearch = async (userId, query, limit = 3) => {
  const docs = await Alert.find({ userId }).sort({ createdAt: -1 }).limit(50).lean();
  const qTokens = simpleBoW(query);
  const scored = docs
    .map((d) => ({
      ...d,
      score: cosine(qTokens, simpleBoW(`${d.message} ${d.severity}`)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored;
};

const isolationScore = (value, history) => {
  if (!history.length) return 0;
  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  const std = Math.sqrt(history.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / history.length) || 1;
  return Math.min(1, Math.abs((value - mean) / std) / 6); // normalized 0-1
};

const edgeAnomaly = async (userId) => {
  const records = await Data.find({ userId }).sort({ timestamp: -1 }).limit(50).lean();
  if (!records.length) return { score: 0, latest: null };
  const latest = records[0];
  const history = records.slice(1);
  const wHist = history.map((r) => Number(r.water || 0));
  const eHist = history.map((r) => Number(r.energy || 0));
  const score =
    (isolationScore(Number(latest.water || 0), wHist) + isolationScore(Number(latest.energy || 0), eHist)) / 2;
  return { score: Math.round(score * 100), latest };
};

const patternMine = async (userId) => {
  const alerts = await Alert.find({ userId }).sort({ createdAt: -1 }).limit(200).lean();
  const pairs = new Map();
  for (let i = 0; i < alerts.length - 1; i += 1) {
    const key = `${alerts[i].severity}->${alerts[i + 1].severity}`;
    pairs.set(key, (pairs.get(key) || 0) + 1);
  }
  const top = [...pairs.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => ({ transition: k, count: v }));
  return top;
};

const causalHint = async (userId) => {
  const records = await Data.find({ userId }).sort({ timestamp: 1 }).limit(120).lean();
  if (records.length < 10) return { hint: "Not enough data for causal hint." };
  const water = records.map((r) => Number(r.water || 0));
  const energy = records.map((r) => Number(r.energy || 0));
  let leadCorr = 0;
  for (let lag = 1; lag <= 6; lag += 1) {
    let num = 0;
    let denA = 0;
    let denB = 0;
    for (let i = lag; i < water.length; i += 1) {
      const a = water[i];
      const b = energy[i - lag];
      num += a * b;
      denA += a * a;
      denB += b * b;
    }
    const corr = denA && denB ? num / Math.sqrt(denA * denB) : 0;
    leadCorr = Math.max(leadCorr, corr);
  }
  return {
    hint:
      leadCorr > 0.5
        ? "Energy spikes often follow water spikes within a short window."
        : "No strong lead-lag relation detected.",
    strength: Number(leadCorr.toFixed(2)),
  };
};

const autoThresholds = async (userId) => {
  const records = await Data.find({ userId }).sort({ timestamp: -1 }).limit(90).lean();
  if (!records.length) return { water: 0, energy: 0 };
  const water = records.map((r) => Number(r.water || 0));
  const energy = records.map((r) => Number(r.energy || 0));
  const p90 = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    const idx = Math.floor(0.9 * (s.length - 1));
    return s[idx];
  };
  return { water: p90(water), energy: p90(energy) };
};

const driftCheck = async (userId) => {
  const recent = await Data.find({ userId }).sort({ timestamp: -1 }).limit(60).lean();
  if (recent.length < 20) return { drift: false, reason: "Not enough data." };
  const half = Math.floor(recent.length / 2);
  const a = recent.slice(0, half);
  const b = recent.slice(half);
  const avg = (arr, key) => arr.reduce((s, r) => s + Number(r[key] || 0), 0) / arr.length;
  const wa = avg(a, "water");
  const wb = avg(b, "water");
  const ea = avg(a, "energy");
  const eb = avg(b, "energy");
  const drift =
    Math.abs(wa - wb) / Math.max(1, wb) > 0.25 || Math.abs(ea - eb) / Math.max(1, eb) > 0.25;
  return { drift, detail: { water: { prev: wb, recent: wa }, energy: { prev: eb, recent: ea } } };
};

const scenarioSim = (latest, reductions = { energy: 0, water: 0 }) => {
  if (!latest) return { impact: "No data" };
  const energy = Math.max(0, Number(latest.energy || 0) * (1 - reductions.energy / 100));
  const water = Math.max(0, Number(latest.water || 0) * (1 - reductions.water / 100));
  const scoreGain = Math.round((reductions.energy + reductions.water) / 2);
  return { projected: { energy, water }, scoreGain };
};

const optimizer = (actions = []) => {
  // actions: [{name, cost, scoreGain}]
  const budget = 100;
  const sorted = [...actions].sort((a, b) => b.scoreGain / Math.max(1, b.cost) - a.scoreGain / Math.max(1, a.cost));
  let spent = 0;
  const chosen = [];
  sorted.forEach((a) => {
    if (spent + a.cost <= budget) {
      chosen.push(a);
      spent += a.cost;
    }
  });
  const totalGain = chosen.reduce((s, a) => s + a.scoreGain, 0);
  return { chosen, totalGain, spent, budget };
};

const saveRule = async (userId, name, conditions, action = "alert") =>
  Rule.findOneAndUpdate({ userId, name }, { conditions, action, enabled: true }, { upsert: true, new: true });

const listRules = (userId) => Rule.find({ userId }).sort({ createdAt: -1 });

const disaggregate = async (userId) => {
  const records = await Data.find({ userId }).sort({ timestamp: -1 }).limit(400).lean();
  if (!records.length) return { shares: [], actions: [] };

  const buckets = [
    { key: "base", label: "Base Load", min: 0, max: 300 },
    { key: "hvac", label: "HVAC / Motors", min: 300, max: 900 },
    { key: "appliances", label: "Appliances", min: 900, max: 1600 },
    { key: "heavy", label: "Heavy / EV", min: 1600, max: Infinity },
  ];

  const totals = new Map(buckets.map((b) => [b.key, 0]));
  records.forEach((r) => {
    const val = Number(r.energy || 0);
    const bucket = buckets.find((b) => val >= b.min && val < b.max) || buckets[buckets.length - 1];
    totals.set(bucket.key, totals.get(bucket.key) + val);
  });

  const sum = Array.from(totals.values()).reduce((a, b) => a + b, 0) || 1;
  const shares = buckets.map((b) => ({
    key: b.key,
    label: b.label,
    percent: Number(((totals.get(b.key) / sum) * 100).toFixed(1)),
  }));

  const actions = [
    { title: "Stagger HVAC cycles", appliesTo: "hvac", impact: "5-10% energy drop", priority: "high" },
    { title: "Shift laundry/dishwasher", appliesTo: "appliances", impact: "2-5% drop", priority: "medium" },
    { title: "Schedule EV/night charging", appliesTo: "heavy", impact: "10-15% drop", priority: "high" },
    { title: "Reduce phantom loads", appliesTo: "base", impact: "1-3% drop", priority: "low" },
  ];

  return { shares, actions };
};

const ruleBacktest = async (userId, rule) => {
  const { conditions = [] } = rule || {};
  if (!conditions.length) return { hits: 0, evaluated: 0 };
  const records = await Data.find({ userId }).sort({ timestamp: -1 }).limit(200).lean();
  let hits = 0;
  records.forEach((r) => {
    const ok = conditions.every((c) => {
      const val = Number(r[c.field] || 0);
      if (c.op === ">") return val > c.value;
      if (c.op === "<") return val < c.value;
      if (c.op === ">=") return val >= c.value;
      if (c.op === "<=") return val <= c.value;
      return false;
    });
    if (ok) hits += 1;
  });
  return { hits, evaluated: records.length };
};

const personaCluster = async (userId) => {
  const records = await Data.find({ userId }).sort({ timestamp: -1 }).limit(14 * 96).lean(); // up to 14 days @15m
  if (!records.length) return { persona: "Unknown", detail: {}, tips: ["Need more data to classify."] };

  const buckets = { day: 0, night: 0, weekend: 0, weekday: 0 };
  records.forEach((r) => {
    const ts = new Date(r.timestamp || r.createdAt || Date.now());
    const hour = ts.getHours();
    const isWeekend = ts.getDay() === 0 || ts.getDay() === 6;
    const val = Number(r.energy || 0);
    const isDay = hour >= 7 && hour < 19;
    buckets[isDay ? "day" : "night"] += val;
    buckets[isWeekend ? "weekend" : "weekday"] += val;
  });

  const dayAvg = buckets.day;
  const nightAvg = buckets.night;
  const weekendAvg = buckets.weekend;
  const weekdayAvg = buckets.weekday;

  let persona = "Flat";
  if (weekendAvg > weekdayAvg * 1.2) persona = "Weekend Spike";
  else if (nightAvg > dayAvg * 1.15) persona = "Night Owl";
  else if (dayAvg > nightAvg * 1.15) persona = "Peak Daytime";

  const tipsMap = {
    "Night Owl": [
      "Shift some night loads to off-peak early morning to reduce spikes.",
      "Check for standby loads left on overnight.",
    ],
    "Peak Daytime": [
      "Pre-cool or pre-heat before peak tariffs.",
      "Stagger HVAC and appliance use during noon peaks.",
    ],
    "Weekend Spike": [
      "Plan heavy chores earlier in the weekend day to avoid clustered peaks.",
      "Use EV/night charging schedules on weekends.",
    ],
    Flat: ["Great consistency. Enable adaptive thresholds to catch subtle drift."],
  };

  return {
    persona,
    detail: { dayAvg, nightAvg, weekendAvg, weekdayAvg },
    tips: tipsMap[persona] || tipsMap.Flat,
  };
};

const abnormalDays = async (userId) => {
  const records = await Data.find({ userId }).sort({ timestamp: -1 }).limit(35 * 96).lean();
  if (!records.length) return { recent: [], latest: null };

  const dayMap = new Map();
  records.forEach((r) => {
    const d = new Date(r.timestamp || r.createdAt || Date.now());
    const key = d.toISOString().slice(0, 10);
    const prev = dayMap.get(key) || { water: 0, energy: 0, weekday: d.getDay() };
    prev.water += Number(r.water || 0);
    prev.energy += Number(r.energy || 0);
    dayMap.set(key, prev);
  });

  const days = [...dayMap.entries()]
    .map(([date, vals]) => ({ date, ...vals }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const baselineByWeekday = {};
  days.forEach((d) => {
    const w = d.weekday;
    if (!baselineByWeekday[w]) baselineByWeekday[w] = [];
    baselineByWeekday[w].push(d);
  });

  const recent = [];
  const consider = days.slice(-7); // last 7 days
  consider.forEach((d) => {
    const pool = (baselineByWeekday[d.weekday] || []).filter((x) => x.date !== d.date);
    if (!pool.length) return;
    const avg = (key) => pool.reduce((s, x) => s + x[key], 0) / pool.length;
    const wAvg = avg("water");
    const eAvg = avg("energy");
    const wDev = wAvg ? (d.water - wAvg) / wAvg : 0;
    const eDev = eAvg ? (d.energy - eAvg) / eAvg : 0;
    const abnormal = Math.abs(wDev) > 0.3 || Math.abs(eDev) > 0.3;
    if (abnormal) {
      recent.push({
        date: d.date,
        waterDev: Number((wDev * 100).toFixed(1)),
        energyDev: Number((eDev * 100).toFixed(1)),
      });
    }
  });

  const latest = recent[recent.length - 1] || null;
  return { recent, latest };
};

const rollingBaseline = async (userId, thresholdPct = 30) => {
  const records = await Data.find({ userId }).sort({ timestamp: -1 }).limit(42 * 96).lean();
  if (!records.length) {
    return {
      calendar: [],
      yesterday: null,
      explainer: "Not enough historical data to build a weekday-hour baseline yet.",
    };
  }

  const dayHourMap = new Map();
  records.forEach((r) => {
    const ts = new Date(r.timestamp || r.createdAt || Date.now());
    const date = ts.toISOString().slice(0, 10);
    const hour = ts.getHours();
    const weekday = ts.getDay();
    const key = `${date}-${hour}`;
    const prev = dayHourMap.get(key) || { date, hour, weekday, water: 0, energy: 0 };
    prev.water += Number(r.water || 0);
    prev.energy += Number(r.energy || 0);
    dayHourMap.set(key, prev);
  });

  const entries = [...dayHourMap.values()].sort((a, b) => {
    const aKey = `${a.date}-${String(a.hour).padStart(2, "0")}`;
    const bKey = `${b.date}-${String(b.hour).padStart(2, "0")}`;
    return aKey.localeCompare(bKey);
  });

  const baselineBySlot = new Map();
  entries.forEach((entry) => {
    const slot = `${entry.weekday}-${entry.hour}`;
    if (!baselineBySlot.has(slot)) baselineBySlot.set(slot, []);
    baselineBySlot.get(slot).push(entry);
  });

  const daySummary = new Map();
  entries.forEach((entry) => {
    const slot = `${entry.weekday}-${entry.hour}`;
    const peers = (baselineBySlot.get(slot) || []).filter((x) => x.date !== entry.date);
    const waterBase = peers.length ? peers.reduce((s, x) => s + x.water, 0) / peers.length : 0;
    const energyBase = peers.length ? peers.reduce((s, x) => s + x.energy, 0) / peers.length : 0;
    const waterDev = waterBase ? (entry.water - waterBase) / waterBase : 0;
    const energyDev = energyBase ? (entry.energy - energyBase) / energyBase : 0;
    const prev = daySummary.get(entry.date) || {
      date: entry.date,
      weekday: entry.weekday,
      energyDeviationAbs: 0,
      waterDeviationAbs: 0,
      hourly: [],
    };
    prev.energyDeviationAbs += Math.abs(energyDev);
    prev.waterDeviationAbs += Math.abs(waterDev);
    prev.hourly.push({
      hour: entry.hour,
      energyDeviation: Number((energyDev * 100).toFixed(1)),
      waterDeviation: Number((waterDev * 100).toFixed(1)),
      energy: Math.round(entry.energy),
      water: Math.round(entry.water),
      baselineEnergy: Math.round(energyBase),
      baselineWater: Math.round(waterBase),
    });
    daySummary.set(entry.date, prev);
  });

  const days = [...daySummary.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14)
    .map((day) => {
      const sampleCount = Math.max(1, day.hourly.length);
      const avgPct = ((day.energyDeviationAbs + day.waterDeviationAbs) / 2 / sampleCount) * 100;
      let status = "green";
      if (avgPct >= thresholdPct) status = "red";
      else if (avgPct >= thresholdPct / 2) status = "amber";
      return {
        date: day.date,
        status,
        deviationPct: Number(avgPct.toFixed(1)),
        hourly: day.hourly.sort((a, b) => a.hour - b.hour),
      };
    });

  const yesterday = days[days.length - 2] || days[days.length - 1] || null;
  let explainer = "Yesterday stayed close to its normal weekday-hour pattern.";

  if (yesterday) {
    const topHour = [...yesterday.hourly].sort(
      (a, b) =>
        Math.max(Math.abs(b.energyDeviation), Math.abs(b.waterDeviation)) -
        Math.max(Math.abs(a.energyDeviation), Math.abs(a.waterDeviation))
    )[0];

    if (topHour && yesterday.status !== "green") {
      const period =
        topHour.hour < 6 ? "overnight" :
        topHour.hour < 12 ? "morning" :
        topHour.hour < 18 ? "afternoon" :
        "evening";
      const dominantMetric =
        Math.abs(topHour.energyDeviation) >= Math.abs(topHour.waterDeviation) ? "energy" : "water";
      const dominantPct = dominantMetric === "energy" ? topHour.energyDeviation : topHour.waterDeviation;
      explainer = `Yesterday was high because ${dominantMetric} usage ran ${Math.abs(dominantPct)}% away from its normal ${period} baseline around ${String(topHour.hour).padStart(2, "0")}:00.`;
    }
  }

  return {
    calendar: days,
    yesterday,
    explainer,
  };
};

const modelLeaderboard = async (userId) => {
  const records = await Data.find({ userId }).sort({ timestamp: 1 }).limit(180).lean();
  if (records.length < 20) {
    return {
      winner: "insufficient_data",
      models: [],
      summary: "Need more historical data before ranking forecasting models.",
    };
  }

  const grouped = new Map();
  records.forEach((record) => {
    const date = new Date(record.timestamp || record.createdAt || Date.now()).toISOString().slice(0, 10);
    grouped.set(date, (grouped.get(date) || 0) + Number(record.energy || 0));
  });

  const series = [...grouped.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, energy]) => energy);

  if (series.length < 10) {
    return {
      winner: "insufficient_data",
      models: [],
      summary: "Daily energy series is too short for benchmark ranking.",
    };
  }

  const holdout = Math.min(5, Math.max(2, Math.floor(series.length * 0.2)));
  const train = series.slice(0, -holdout);
  const test = series.slice(-holdout);

  const movingAveragePredict = (arr, window = 3) => {
    const slice = arr.slice(-window);
    return slice.reduce((sum, value) => sum + value, 0) / Math.max(1, slice.length);
  };

  const trendPredict = (arr) => {
    if (arr.length < 2) return arr[arr.length - 1] || 0;
    const recent = arr.slice(-6);
    const slope = (recent[recent.length - 1] - recent[0]) / Math.max(1, recent.length - 1);
    return recent[recent.length - 1] + slope;
  };

  const evaluate = (label, predictor) => {
    const history = [...train];
    const errors = [];
    test.forEach((actual) => {
      const predicted = predictor(history);
      errors.push(Math.abs(actual - predicted));
      history.push(actual);
    });
    const mae = errors.reduce((sum, value) => sum + value, 0) / Math.max(1, errors.length);
    return {
      model: label,
      mae: Number(mae.toFixed(2)),
      accuracy: Number(Math.max(0, 100 - mae / Math.max(1, train[train.length - 1]) * 100).toFixed(1)),
    };
  };

  const models = [
    evaluate("Naive Last Value", (history) => history[history.length - 1] || 0),
    evaluate("Moving Average", (history) => movingAveragePredict(history, 4)),
    evaluate("Trend Line", (history) => trendPredict(history)),
  ].sort((a, b) => a.mae - b.mae);

  return {
    winner: models[0].model,
    models,
    summary: `${models[0].model} is currently the most stable local forecaster on recent holdout data.`,
  };
};

const riskEngine = async (userId) => {
  const [anomaly, drift, baseline, goalStreaks, alerts] = await Promise.all([
    edgeAnomaly(userId),
    driftCheck(userId),
    rollingBaseline(userId, 30),
    getGoalStreaks(userId, currentMonthKey()),
    Alert.find({ userId }).sort({ createdAt: -1, time: -1 }).limit(8).lean(),
  ]);

  let score = 0;
  const factors = [];

  if (anomaly?.score) {
    const contribution = Math.round(anomaly.score * 0.35);
    score += contribution;
    if (contribution > 10) factors.push({ label: "Anomaly pressure", impact: contribution });
  }

  if (drift?.drift) {
    score += 20;
    factors.push({ label: "Data drift detected", impact: 20 });
  }

  if (baseline?.yesterday?.status === "red") {
    score += 18;
    factors.push({ label: "Yesterday baseline breach", impact: 18 });
  } else if (baseline?.yesterday?.status === "amber") {
    score += 10;
    factors.push({ label: "Yesterday usage drifted", impact: 10 });
  }

  const alertImpact = alerts.reduce((sum, alert) => {
    if (alert.severity === "HIGH") return sum + 6;
    if (alert.severity === "MEDIUM") return sum + 3;
    return sum + 1;
  }, 0);
  score += Math.min(18, alertImpact);
  if (alertImpact) factors.push({ label: "Recent alert load", impact: Math.min(18, alertImpact) });

  if (goalStreaks?.hasGoal && goalStreaks?.pace) {
    const overPace = Math.max(goalStreaks.pace.energyRatio || 0, goalStreaks.pace.waterRatio || 0);
    if (overPace > 1.05) {
      const contribution = Math.min(14, Math.round((overPace - 1) * 40));
      score += contribution;
      factors.push({ label: "Goal pace slippage", impact: contribution });
    }
  }

  score = Math.min(100, Math.round(score));

  return {
    score,
    band: score >= 70 ? "high" : score >= 40 ? "medium" : "low",
    factors: factors.sort((a, b) => b.impact - a.impact).slice(0, 5),
    explanation:
      score >= 70
        ? "System risk is elevated. Prioritize immediate load stabilization and alert follow-up."
        : score >= 40
          ? "System risk is moderate. Watch anomalies and baseline drift closely."
          : "System risk is low. Continue current efficiency behavior and monitoring.",
  };
};

module.exports = {
  embeddingSearch,
  edgeAnomaly,
  patternMine,
  causalHint,
  autoThresholds,
  driftCheck,
  scenarioSim,
  optimizer,
  generateForecast,
  getGoalProgress,
  dataQualityService,
  saveRule,
  listRules,
  disaggregate,
  ruleBacktest,
  personaCluster,
  abnormalDays,
  rollingBaseline,
  modelLeaderboard,
  riskEngine,
};
