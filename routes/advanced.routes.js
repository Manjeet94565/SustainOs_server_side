const router = require("express").Router();
const auth = require("../middleware/authMiddleware");
const ctrl = require("../controllers/advanced.controller");

router.use(auth);

router.get("/forecast", ctrl.forecast);
router.post("/embedding", ctrl.embedding);
router.get("/edge-anomaly", ctrl.edgeAnomaly);
router.get("/patterns", ctrl.patterns);
router.get("/causal", ctrl.causal);
router.get("/auto-thresholds", ctrl.autoThresholds);
router.get("/drift", ctrl.drift);
router.post("/scenario", ctrl.scenario);
router.post("/optimize", ctrl.optimize);
router.post("/rule", ctrl.saveRule);
router.get("/rule", ctrl.listRules);
router.get("/disagg", ctrl.disagg);
router.post("/rule/backtest", ctrl.backtestRule);
router.get("/persona", ctrl.persona);
router.get("/abnormal-days", ctrl.abnormalDays);
router.get("/baseline-calendar", ctrl.rollingBaseline);
router.get("/model-leaderboard", ctrl.modelLeaderboard);
router.get("/risk-engine", ctrl.riskEngine);

module.exports = router;
