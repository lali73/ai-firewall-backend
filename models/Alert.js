const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    victimVpnIp: {
      type: String,
      required: true,
      index: true,
    },
    attackerIp: String,
    message: {
      type: String,
      required: true,
    },
    mitigatedAt: {
      type: Date,
      default: Date.now,
    },
    rawPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    readAt: Date,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Alert", alertSchema);
