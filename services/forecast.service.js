const Data = require("../models/Data");

const groupByDay = (records) => {
  const map = new Map();
  records.forEach((r) => {
    const d = new Date(r.timestamp || r.createdAt || Date.now());
    const key = d.toISOString().slice(0, 10);
    if (!map.has(key)) map.set(key, { water: 0, energy: 0 });
    const prev = map.get(key);
    prev.water += Number(r.water || 0);
    prev.energy += Number(r.energy || 0);
    map.set(key, prev);
  });
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, vals]) => ({ date, ...vals }));
};

const movingAverage = (arr, window = 3) => {
  if (!arr.length) return 0;
  const slice = arr.slice(-window);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
};

const linearSlope = (arr) => {
  if (arr.length < 2) return 0;
  const n = arr.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i += 1) {
    const x = i + 1;
    const y = Number(arr[i] || 0);
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
};

const generateForecast = async (userId, horizonDays = 7) => {
  const records = await Data.find({ userId }).sort({ timestamp: 1 }).limit(120).lean();
  if (!records.length) {
    return {
      hasData: false,
      horizonDays,
      tomorrow: { water: 0, energy: 0 },
      points: [],
      confidence: 0,
    };
  }

  const daily = groupByDay(records);
  const waterSeries = daily.map((d) => d.water);
  const energySeries = daily.map((d) => d.energy);

  const waterBase = movingAverage(waterSeries, 5);
  const energyBase = movingAverage(energySeries, 5);
  const waterSlope = linearSlope(waterSeries.slice(-14));
  const energySlope = linearSlope(energySeries.slice(-14));

  const points = [];
  const lastDate = new Date(daily[daily.length - 1].date);

  for (let i = 1; i <= horizonDays; i += 1) {
    const d = new Date(lastDate);
    d.setDate(lastDate.getDate() + i);
    const water = Math.max(0, Math.round(waterBase + waterSlope * i));
    const energy = Math.max(0, Math.round(energyBase + energySlope * i));
    points.push({
      day: d.toISOString().slice(0, 10),
      water,
      energy,
    });
  }

  const volatility = Math.abs(waterSlope) + Math.abs(energySlope);
  const confidence = Math.max(55, Math.min(95, Math.round(90 - volatility)));

  return {
    hasData: true,
    horizonDays,
    tomorrow: points[0],
    points,
    confidence,
  };
};

module.exports = { generateForecast };
