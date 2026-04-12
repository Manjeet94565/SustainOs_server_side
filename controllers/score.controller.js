const scoreService = require("../services/sustainabilityScore.engine");

exports.getScore = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) {
      return res.status(401).json({ score: 0, msg: "Unauthorized" });
    }

    const result = await scoreService.calculateScore(userId);
    res.json(result);
  } catch (err) {
    console.error("Score Error:", err);
    res.status(500).json({ msg: "Score calculation error" });
  }
};
