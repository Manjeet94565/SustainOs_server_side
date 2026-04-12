const PDFDocument = require("pdfkit");
const reportService = require("../services/report.service");

exports.getReportData = async (req, res, next) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ msg: "Unauthorized" });

    const report = await reportService.generateReportData(userId);
    res.json(report);
  } catch (err) {
    next(err);
  }
};

exports.downloadReport = async (req, res, next) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ msg: "Unauthorized" });

    const report = await reportService.generateReportData(userId);
    const summaryText = await reportService.generateExecutiveSummaryText(userId);

    const doc = new PDFDocument({ margin: 40 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=Executive_Sustainability_Report.pdf");

    doc.pipe(res);

    doc.fontSize(20).text("SustainOS Executive Sustainability Report", { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleString("en-IN")}`, { align: "right" });

    doc.moveDown();
    doc.fontSize(13).text("KPI Snapshot", { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(11).text(`Total Water Usage: ${report.totalWater} L`);
    doc.text(`Total Energy Usage: ${report.totalEnergy} kWh`);
    doc.text(`Alerts Triggered: ${report.alerts}`);
    doc.text(`Estimated Cost: Rs ${report.cost}`);
    doc.text(`Carbon Emission: ${report.carbon} kg CO2`);
    doc.text(`Data Quality Score: ${report.quality.avgScore}/100`);

    doc.moveDown();
    doc.fontSize(13).text("Sustainability Score Decomposition", { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(11).text(`Overall Score: ${report.score.score}/100`);
    doc.text(`Penalty - Water: ${report.score.breakdown?.penalties?.water ?? 0}`);
    doc.text(`Penalty - Energy: ${report.score.breakdown?.penalties?.energy ?? 0}`);
    doc.text(`Penalty - Alerts: ${report.score.breakdown?.penalties?.alerts ?? 0}`);
    doc.text(`Penalty - Spikes: ${report.score.breakdown?.penalties?.spikes ?? 0}`);
    doc.text(`Penalty - Trend: ${report.score.breakdown?.penalties?.trend ?? 0}`);

    doc.moveDown();
    doc.fontSize(13).text("Goal Tracking", { underline: true });
    doc.moveDown(0.3);
    if (report.goalProgress?.hasGoal) {
      doc.fontSize(11).text(`Month: ${report.goalProgress.month}`);
      doc.text(`Target Water: ${report.goalProgress.targetWater} L | Actual: ${report.goalProgress.actualWater} L`);
      doc.text(`Target Energy: ${report.goalProgress.targetEnergy} kWh | Actual: ${report.goalProgress.actualEnergy} kWh`);
      doc.text(`Overall Progress: ${report.goalProgress.overallProgress}% (${report.goalProgress.status})`);
    } else {
      doc.fontSize(11).text("No goal configured for current month.");
    }

    doc.moveDown();
    doc.fontSize(13).text("Forecast", { underline: true });
    doc.moveDown(0.3);
    if (report.forecast?.tomorrow) {
      doc.fontSize(11).text(`Tomorrow Energy Forecast: ${report.forecast.tomorrow.energy} kWh`);
      doc.text(`Tomorrow Water Forecast: ${report.forecast.tomorrow.water} L`);
      doc.text(`Confidence: ${report.forecast.confidence || 0}%`);
    } else {
      doc.fontSize(11).text("Forecast unavailable.");
    }

    doc.moveDown();
    doc.fontSize(13).text("Executive Recommendation", { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(11).text(report.recommendation || "No recommendation available.");

    doc.moveDown();
    doc.fontSize(13).text("Summary", { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(10).text(summaryText);

    doc.end();
  } catch (err) {
    next(err);
  }
};

exports.getExecutiveSummary = async (req, res, next) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ msg: "Unauthorized" });
    const summary = await reportService.generateExecutiveSummaryText(userId);
    return res.json({ success: true, summary });
  } catch (err) {
    return next(err);
  }
};
