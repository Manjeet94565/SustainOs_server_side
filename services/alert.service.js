const Alert = require("../models/Alert");

exports.createAlert = async ({ userId, building, message, severity }) => {
  try {
    const alert = await Alert.create({
      userId,
      building: building || "General",
      message,
      severity: (severity || "LOW").toUpperCase(),
    });

    return alert;

  } catch (err) {
    console.error("❌ Alert Service Error:", err.message);
    return null; // crash रोकने के लिए
  }
};
