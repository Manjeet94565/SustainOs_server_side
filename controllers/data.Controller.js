const Data = require('../models/Data');
const detectionService = require('../services/detection.service');
const alertService = require('../services/alert.service');
const dataQualityService = require("../services/dataQuality.service");

const sendData = async (req, res) => {
  try {
    if (!req.user?._id)
      return res.status(401).json({ success: false, msg: "Unauthorized" });

    const { building, water, energy } = req.body;
    const numericWater = Number(water);
    const numericEnergy = Number(energy);

    if (!building || water == null || energy == null)
      return res.status(400).json({ success: false, msg: "All fields required" });

    const recentRecords = await Data.find({ userId: req.user._id })
      .sort({ timestamp: -1 })
      .limit(20)
      .lean();

    const quality = dataQualityService.evaluateIncomingData({
      building,
      water: numericWater,
      energy: numericEnergy,
      recentRecords,
    });

    if (quality.status === "CRITICAL") {
      return res.status(400).json({
        success: false,
        msg: "Data quality check failed. Please verify reading values.",
        quality,
      });
    }

    const saved = await Data.create({
      userId: req.user._id,
      building,
      water: numericWater,
      energy: numericEnergy,
      timestamp: new Date(),
    });

    await dataQualityService.saveQualityLog({
      userId: req.user._id,
      dataId: saved._id,
      quality,
    });

    if (global.io) global.io.emit("newData", saved);

    const aiResult = await detectionService.detect(
      numericWater,
      numericEnergy,
      req.user._id
    );

    if (aiResult.status) {
      await alertService.createAlert({
        userId: req.user._id,
        message: aiResult.reason,
        severity: aiResult.severity,
      });
      if (global.io) global.io.emit("newAlert", aiResult);
    }

    return res.status(201).json({
      success: true,
      data: saved,
      ai: aiResult.aiResult,
      quality,
    });

  } catch (err) {
    console.error("Send Data Error:", err);
    res.status(500).json({ success: false, msg: "Server Error" });
  }
};

const getHistory = async (req, res) => {
  try {
    const history = await Data.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ success: false, msg: "Server Error" });
  }
};

module.exports = { sendData, getHistory };
