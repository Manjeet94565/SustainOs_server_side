const express = require("express");
const router = express.Router();
const { getScore } = require("../controllers/score.controller"); // ✅ fix
const auth = require("../middleware/authMiddleware");

router.get("/", auth, getScore);

module.exports = router;