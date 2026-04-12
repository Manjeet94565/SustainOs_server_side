const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const controller = require("../controllers/rag.controller");

router.post("/chat", auth, controller.chat);

module.exports = router;
