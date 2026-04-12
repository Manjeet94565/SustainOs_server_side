const mongoose = require("mongoose");
const { MONGO_URI } = require("./env");

module.exports = async () => {
  if (!MONGO_URI) {
    throw new Error("MONGO_URI is missing in environment variables");
  }

  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log("MongoDB Connected");
  } catch (err) {
    console.error("DB Error:", err.message);
    throw err;
  }
};
