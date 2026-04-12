const AdaptiveThreshold = require("../models/AdaptiveThreshold");

const getThreshold = async (userId) => {
  if (!userId) return null;
  return AdaptiveThreshold.findOne({ userId });
};

module.exports = { getThreshold };
