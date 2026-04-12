const copilot = require("../services/projectCopilot.service");

exports.ask = async (req, res, next) => {
  try {
    const { question, sessionId } = req.body;
    if (!question) return res.status(400).json({ msg: "Question required" });

    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ msg: "Unauthorized" });

    const normalizedQuestion = String(question || "").toLowerCase();
    const shouldExport =
      normalizedQuestion.includes("export") ||
      normalizedQuestion.includes("download pdf") ||
      normalizedQuestion.includes("report");

    const result = await copilot.answerProjectQuestion({ userId, question, sessionId });

    return res.json({
      status: "success",
      intent: "project_copilot",
      answer: result.answer,
      provider: result.provider,
      sessionId: result.sessionId,
      contextSummary: result.contextSummary,
      action: shouldExport ? "export_report" : null,
    });
  } catch (err) {
    console.error("AI Controller Error:", err);
    next(err);
  }
};
