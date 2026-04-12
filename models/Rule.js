const mongoose = require("mongoose");

const conditionSchema = new mongoose.Schema(
  {
    field: { type: String, required: true }, // water, energy, time, day
    operator: { type: String, required: true }, // >, <, >=, <=, between
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    extra: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const ruleSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    conditions: { type: [conditionSchema], default: [] },
    action: { type: String, default: "alert" },
  },
  { timestamps: true }
);

ruleSchema.index({ userId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Rule", ruleSchema);
