const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    cluster: { type: Number, default: 0 },
    energyLimit: { type: Number, default: 0 },
    waterLimit: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now },
    samples: { type: Number, default: 0 },
  },
  { timestamps: true }
);

schema.index({ userId: 1 }, { unique: true });

module.exports = mongoose.model("AdaptiveThreshold", schema);
