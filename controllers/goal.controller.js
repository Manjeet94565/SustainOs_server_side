const Goal = require("../models/Goal");
const { currentMonthKey, getGoalProgress, getGoalStreaks } = require("../services/goal.service");

exports.upsertGoal = async (req, res, next) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ msg: "Unauthorized" });

    const month = req.body.month || currentMonthKey();
    const targetWater = Number(req.body.targetWater);
    const targetEnergy = Number(req.body.targetEnergy);
    const notes = String(req.body.notes || "");

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ msg: "Month should be in YYYY-MM format" });
    }
    if (!Number.isFinite(targetWater) || !Number.isFinite(targetEnergy) || targetWater < 0 || targetEnergy < 0) {
      return res.status(400).json({ msg: "Target water and energy must be valid positive numbers" });
    }

    const goal = await Goal.findOneAndUpdate(
      { userId, month },
      { targetWater, targetEnergy, notes },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const progress = await getGoalProgress(userId, month);

    return res.json({ success: true, goal, progress });
  } catch (err) {
    return next(err);
  }
};

exports.getCurrentGoal = async (req, res, next) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ msg: "Unauthorized" });

    const month = req.query.month || currentMonthKey();
    const goal = await Goal.findOne({ userId, month });
    const progress = await getGoalProgress(userId, month);
    return res.json({ success: true, month, goal, progress });
  } catch (err) {
    return next(err);
  }
};

exports.listGoals = async (req, res, next) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ msg: "Unauthorized" });
    const goals = await Goal.find({ userId }).sort({ month: -1 }).limit(12);
    return res.json({ success: true, goals });
  } catch (err) {
    return next(err);
  }
};

exports.getStreaks = async (req, res, next) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ msg: "Unauthorized" });

    const month = req.query.month || currentMonthKey();
    const streaks = await getGoalStreaks(userId, month);
    return res.json({ success: true, month, streaks });
  } catch (err) {
    return next(err);
  }
};
