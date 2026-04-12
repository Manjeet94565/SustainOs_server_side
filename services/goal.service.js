const Data = require("../models/Data");
const Goal = require("../models/Goal");

const currentMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const parseMonthRange = (month) => {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const end = new Date(y, m, 1, 0, 0, 0, 0);
  return { start, end };
};

const groupDailyUsage = (records) => {
  const map = new Map();
  records.forEach((r) => {
    const d = new Date(r.timestamp || r.createdAt || Date.now());
    const key = d.toISOString().slice(0, 10);
    const prev = map.get(key) || { date: key, water: 0, energy: 0 };
    prev.water += Number(r.water || 0);
    prev.energy += Number(r.energy || 0);
    map.set(key, prev);
  });
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
};

const getGoalProgress = async (userId, month = currentMonthKey()) => {
  const goal = await Goal.findOne({ userId, month }).lean();
  if (!goal) {
    return {
      month,
      hasGoal: false,
      targetWater: 0,
      targetEnergy: 0,
      actualWater: 0,
      actualEnergy: 0,
      waterProgress: 0,
      energyProgress: 0,
      overallProgress: 0,
      status: "NO_GOAL",
    };
  }

  const { start, end } = parseMonthRange(month);

  const agg = await Data.aggregate([
    {
      $match: {
        userId: goal.userId,
        timestamp: { $gte: start, $lt: end },
      },
    },
    {
      $group: {
        _id: null,
        totalWater: { $sum: "$water" },
        totalEnergy: { $sum: "$energy" },
      },
    },
  ]);

  const actualWater = Number(agg[0]?.totalWater || 0);
  const actualEnergy = Number(agg[0]?.totalEnergy || 0);

  const waterProgress = goal.targetWater > 0 ? Math.min(100, (actualWater / goal.targetWater) * 100) : 0;
  const energyProgress = goal.targetEnergy > 0 ? Math.min(100, (actualEnergy / goal.targetEnergy) * 100) : 0;
  const overallProgress = Math.round((waterProgress + energyProgress) / 2);
  const status = overallProgress >= 100 ? "LIMIT_REACHED" : overallProgress >= 75 ? "ON_TRACK" : "IN_PROGRESS";

  return {
    month,
    hasGoal: true,
    targetWater: goal.targetWater,
    targetEnergy: goal.targetEnergy,
    actualWater: Math.round(actualWater),
    actualEnergy: Math.round(actualEnergy),
    waterProgress: Math.round(waterProgress),
    energyProgress: Math.round(energyProgress),
    overallProgress,
    status,
    notes: goal.notes || "",
  };
};

const getGoalStreaks = async (userId, month = currentMonthKey()) => {
  const goal = await Goal.findOne({ userId, month }).lean();
  if (!goal) {
    return {
      hasGoal: false,
      month,
      streakDays: 0,
      bestStreak: 0,
      nudges: ["Set a monthly goal to unlock streak tracking and daily nudges."],
      series: [],
      pace: null,
    };
  }

  const { start, end } = parseMonthRange(month);
  const records = await Data.find({
    userId,
    timestamp: { $gte: start, $lt: end },
  })
    .sort({ timestamp: 1 })
    .lean();

  const series = groupDailyUsage(records);
  const monthDays = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const elapsedDays = Math.max(
    1,
    Math.min(
      monthDays,
      Math.floor((Math.min(Date.now(), end.getTime()) - start.getTime()) / (24 * 60 * 60 * 1000)) + 1
    )
  );

  const dailyWaterTarget = goal.targetWater / monthDays;
  const dailyEnergyTarget = goal.targetEnergy / monthDays;
  const tolerance = 1.05;

  const evaluatedSeries = series.map((day) => ({
    ...day,
    metGoal:
      day.water <= dailyWaterTarget * tolerance &&
      day.energy <= dailyEnergyTarget * tolerance,
  }));

  let streakDays = 0;
  for (let i = evaluatedSeries.length - 1; i >= 0; i -= 1) {
    if (!evaluatedSeries[i].metGoal) break;
    streakDays += 1;
  }

  let bestStreak = 0;
  let current = 0;
  evaluatedSeries.forEach((day) => {
    if (day.metGoal) {
      current += 1;
      bestStreak = Math.max(bestStreak, current);
    } else {
      current = 0;
    }
  });

  const totals = evaluatedSeries.reduce(
    (acc, day) => ({
      water: acc.water + day.water,
      energy: acc.energy + day.energy,
    }),
    { water: 0, energy: 0 }
  );

  const expectedWater = dailyWaterTarget * elapsedDays;
  const expectedEnergy = dailyEnergyTarget * elapsedDays;
  const waterRatio = expectedWater ? totals.water / expectedWater : 0;
  const energyRatio = expectedEnergy ? totals.energy / expectedEnergy : 0;

  const nudges = [];
  if (energyRatio > 1.05) nudges.push("Energy is above its daily pace. Shift heavy loads away from your busiest hours.");
  if (waterRatio > 1.05) nudges.push("Water usage is ahead of target. Check for repeated high-use routines or leaks.");
  if (streakDays >= 3) nudges.push(`You are on a ${streakDays}-day streak. Keep today's usage close to your daily pace target.`);
  if (!nudges.length) nudges.push("You are tracking well. Small daily savings will protect the streak.");

  return {
    hasGoal: true,
    month,
    streakDays,
    bestStreak,
    nudges,
    pace: {
      dailyWaterTarget: Math.round(dailyWaterTarget),
      dailyEnergyTarget: Math.round(dailyEnergyTarget),
      expectedWater: Math.round(expectedWater),
      expectedEnergy: Math.round(expectedEnergy),
      actualWater: Math.round(totals.water),
      actualEnergy: Math.round(totals.energy),
      waterRatio: Number(waterRatio.toFixed(2)),
      energyRatio: Number(energyRatio.toFixed(2)),
    },
    series: evaluatedSeries.slice(-7),
  };
};

module.exports = {
  currentMonthKey,
  parseMonthRange,
  getGoalProgress,
  getGoalStreaks,
};
