const mongoose = require("mongoose");

const goalSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    month: {
      type: String,
      required: true, // YYYY-MM
    },
    targetWater: {
      type: Number,
      required: true,
      min: 0,
    },
    targetEnergy: {
      type: Number,
      required: true,
      min: 0,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

goalSchema.index({ userId: 1, month: 1 }, { unique: true });

module.exports = mongoose.model("Goal", goalSchema);
