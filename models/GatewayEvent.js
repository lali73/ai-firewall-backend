const mongoose = require("mongoose");

const gatewayEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    protectionProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProtectionProfile",
      required: true,
      index: true,
    },
    eventType: {
      type: String,
      enum: ["heartbeat", "attack_detected", "gateway_event"],
      required: true,
      index: true,
    },
    gatewayId: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },
    victimVpnIp: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },
    wireguardPublicKey: {
      type: String,
      default: null,
    },
    gatewayPeerRef: {
      type: String,
      default: null,
    },
    attackerIp: {
      type: String,
      default: null,
    },
    detectedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("GatewayEvent", gatewayEventSchema);
