const axios = require("axios");

const AI_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

exports.chat = async (req, res, next) => {
  try {
    const { question } = req.body;
    if (!question) return res.status(400).json({ msg: "Question required" });
    const response = await axios.post(`${AI_URL}/chat`, { question });
    res.json(response.data);
  } catch (err) {
    console.error("RAG chat error:", err.message);
    next(err);
  }
};
