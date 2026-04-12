const mongoose = require("mongoose");
const Data = require("../models/Data");
const Alert = require("../models/Alert");

exports.calculateScore = async (userId) => {
  try {
    if (!userId) {
      return {
        score: 0,
        status: "No User",
        risk: "UNKNOWN",
        alerts: 0,
        usage: { water: 0, energy: 0 },
        breakdown: {
          base: 100,
          penalties: { water: 0, energy: 0, alerts: 0, spikes: 0, trend: 0 },
          final: 0,
        },
        message: "User not found",
      };
    }

    const objectUserId = new mongoose.Types.ObjectId(userId);

    const latest = await Data.findOne({ userId: objectUserId }).sort({ timestamp: -1 });

    const stats = await Data.aggregate([
      { $match: { userId: objectUserId } },
      {
        $group: {
          _id: null,
          avgWater: { $avg: "$water" },
          avgEnergy: { $avg: "$energy" },
          maxWater: { $max: "$water" },
          maxEnergy: { $max: "$energy" },
        },
      },
    ]);

    const alertCount = await Alert.countDocuments({ userId: objectUserId });

    if (!latest || !stats.length) {
      return {
        score: 0,
        status: "No Data",
        risk: "LOW",
        alerts: 0,
        usage: { water: 0, energy: 0 },
        breakdown: {
          base: 100,
          penalties: { water: 0, energy: 0, alerts: 0, spikes: 0, trend: 0 },
          final: 0,
        },
        message: "No sufficient data available",
      };
    }

    const avgWater = stats[0].avgWater || 1;
    const avgEnergy = stats[0].avgEnergy || 1;
    const maxWater = stats[0].maxWater || latest.water;
    const maxEnergy = stats[0].maxEnergy || latest.energy;

    const penalties = {
      water: 0,
      energy: 0,
      alerts: 0,
      spikes: 0,
      trend: 0,
    };

    const waterRatio = latest.water / avgWater;
    if (waterRatio > 1) penalties.water = Math.min((waterRatio - 1) * 30, 30);

    const energyRatio = latest.energy / avgEnergy;
    if (energyRatio > 1) penalties.energy = Math.min((energyRatio - 1) * 30, 30);

    penalties.alerts = Math.min(alertCount * 4, 20);

    if (latest.water >= maxWater * 0.95) penalties.spikes += 10;
    if (latest.energy >= maxEnergy * 0.95) penalties.spikes += 10;

    const recent = await Data.find({ userId: objectUserId })
      .sort({ timestamp: -1 })
      .limit(14)
      .lean();

    if (recent.length >= 8) {
      const latestHalf = recent.slice(0, 7);
      const previousHalf = recent.slice(7, 14);

      const latestWaterAvg = latestHalf.reduce((s, r) => s + Number(r.water || 0), 0) / latestHalf.length;
      const previousWaterAvg = previousHalf.reduce((s, r) => s + Number(r.water || 0), 0) / previousHalf.length;
      const latestEnergyAvg = latestHalf.reduce((s, r) => s + Number(r.energy || 0), 0) / latestHalf.length;
      const previousEnergyAvg = previousHalf.reduce((s, r) => s + Number(r.energy || 0), 0) / previousHalf.length;

      const waterGrowth = previousWaterAvg > 0 ? (latestWaterAvg - previousWaterAvg) / previousWaterAvg : 0;
      const energyGrowth = previousEnergyAvg > 0 ? (latestEnergyAvg - previousEnergyAvg) / previousEnergyAvg : 0;

      if (waterGrowth > 0.1 || energyGrowth > 0.1) {
        penalties.trend = Math.min(10, Math.round((Math.max(waterGrowth, energyGrowth) * 100) / 5));
      }
    }

    const totalPenalty = Object.values(penalties).reduce((sum, p) => sum + p, 0);
    const score = Math.max(0, Math.round(100 - totalPenalty));

    let status = "Excellent";
    let riskLevel = "LOW";
    if (score < 85) {
      status = "Good";
      riskLevel = "MEDIUM";
    }
    if (score < 65) {
      status = "Moderate";
      riskLevel = "HIGH";
    }
    if (score < 45) {
      status = "Critical";
      riskLevel = "SEVERE";
    }

    let message = "All systems optimal.";
    if (riskLevel === "MEDIUM") message = "Minor inefficiencies detected.";
    if (riskLevel === "HIGH") message = "Resource usage above optimal range.";
    if (riskLevel === "SEVERE") message = "Immediate optimization required.";

    return {
      score,
      status,
      risk: riskLevel,
      alerts: alertCount,
      usage: {
        water: latest.water,
        energy: latest.energy,
      },
      breakdown: {
        base: 100,
        penalties: {
          water: Math.round(penalties.water),
          energy: Math.round(penalties.energy),
          alerts: Math.round(penalties.alerts),
          spikes: Math.round(penalties.spikes),
          trend: Math.round(penalties.trend),
        },
        final: score,
      },
      message,
    };
  } catch (err) {
    console.error("Score Engine Error:", err);

    return {
      score: 0,
      status: "Error",
      risk: "UNKNOWN",
      alerts: 0,
      usage: { water: 0, energy: 0 },
      breakdown: {
        base: 100,
        penalties: { water: 0, energy: 0, alerts: 0, spikes: 0, trend: 0 },
        final: 0,
      },
      message: "Score calculation failed",
    };
  }
};
