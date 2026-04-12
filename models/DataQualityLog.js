const mongoose = require("mongoose");

const issueSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    severity: { type: String, enum: ["LOW", "MEDIUM", "HIGH"], required: true },
    message: { type: String, required: true },
  },
  { _id: false }
);

const dataQualityLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    dataId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Data",
      required: true,
      index: true,
    },
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    status: {
      type: String,
      enum: ["GOOD", "WARNING", "CRITICAL"],
      required: true,
    },
    issues: {
      type: [issueSchema],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("DataQualityLog", dataQualityLogSchema);
