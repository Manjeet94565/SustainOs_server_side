const express=require("express");
const router=express.Router();
const controller=require("../controllers/report.controller");
const authMiddleware = require("../middleware/authMiddleware");

router.use(authMiddleware);
router.get("/data",controller.getReportData); 
router.get("/pdf",controller.downloadReport);
router.get("/summary", controller.getExecutiveSummary);

module.exports=router;
