const mongoose = require("mongoose");

const protectionProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    subscriptionStatus: {
      type: String,
      enum: ["active", "inactive", "cancelled", "expired"],
      default: "inactive",
      index: true,
    },
    protectionEnabled: {
      type: Boolean,
      default: false,
      index: true,
    },
    peerStatus: {
      type: String,
      enum: ["unassigned", "pending", "active", "revoked"],
      default: "unassigned",
      index: true,
    },
    vpnIp: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },
    wireguardPublicKey: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },
    gatewayPeerRef: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },
    gatewayId: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },
    gatewayInterface: {
      type: String,
      default: null,
    },
    configIssuedAt: Date,
    lastProvisionedAt: Date,
    lastDeprovisionedAt: Date,
    lastSyncedAt: Date,
    lastSyncError: String,
    isOnline: {
      type: Boolean,
      default: false,
      index: true,
    },
    lastSeen: {
      type: Date,
      default: null,
    },
    healthStatus: {
      type: String,
      enum: ["unknown", "healthy", "under_attack", "degraded"],
      default: "unknown",
    },
    lastHeartbeatAt: Date,
    lastEventType: String,
    lastEventAt: Date,
    lastEventPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    lastAlertAt: Date,
    lastAttackerIp: String,
    lastAlertPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    alertCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("ProtectionProfile", protectionProfileSchema);
