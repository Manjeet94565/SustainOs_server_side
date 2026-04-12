const router = require("express").Router();
const authMiddleware = require("../middleware/authMiddleware");
const controller = require("../controllers/goal.controller");

router.use(authMiddleware);

router.get("/current", controller.getCurrentGoal);
router.get("/streaks", controller.getStreaks);
router.get("/", controller.listGoals);
router.post("/upsert", controller.upsertGoal);

module.exports = router;
