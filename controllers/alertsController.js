const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const Alert = require("../models/Alert");
const GatewayEvent = require("../models/GatewayEvent");
const env = require("../config/env");
const { publishUserEvent } = require("../services/dashboardNotificationService");
const {
  normalizeGatewayId,
  normalizeGatewayPeerRef,
  normalizeVpnIp,
  recordProtectionHeartbeat,
  recordProtectionAlert,
  resolveProtectionProfileIdentifiers,
} = require("../services/protectionProfileService");
const { normalizeWireGuardPublicKey } = require("../utils/validation");

exports.receiveGatewayAlert = asyncHandler(async (req, res) => {
  if (env.ALERT_WEBHOOK_SECRET) {
    const providedSecret = req.headers["x-alert-secret"];

    if (providedSecret !== env.ALERT_WEBHOOK_SECRET) {
      const error = new Error("Invalid alert webhook secret");
      error.statusCode = 401;
      throw error;
    }
  }

  const victimVpnIp = normalizeVpnIp(req.body.victim_vpn_ip);
  const attackerIp =
    typeof req.body.attacker_ip === "string" ? req.body.attacker_ip.trim() : "";
  const wireguardPublicKey = normalizeWireGuardPublicKey(
    req.body.wireguard_public_key || req.body.peer_public_key
  );
  const gatewayPeerRef = normalizeGatewayPeerRef(
    req.body.gateway_peer_ref || req.body.protection_id
  );
  const gatewayId = normalizeGatewayId(req.body.gateway_id);
  const eventType = String(req.body.event_type || "attack_detected")
    .trim()
    .toLowerCase();
  const detectedAt = req.body.detected_at ? new Date(req.body.detected_at) : new Date();

  if (!victimVpnIp && !wireguardPublicKey && !gatewayPeerRef) {
    const error = new Error(
      "victim_vpn_ip, wireguard_public_key, or gateway_peer_ref is required"
    );
    error.statusCode = 400;
    throw error;
  }

  if (Number.isNaN(detectedAt.getTime())) {
    const error = new Error("detected_at must be a valid ISO timestamp");
    error.statusCode = 400;
    throw error;
  }

  const resolution = await resolveProtectionProfileIdentifiers({
    victimVpnIp,
    wireguardPublicKey,
    gatewayPeerRef,
    gatewayId,
    requireActiveProtection: true,
  });

  if (resolution.conflict) {
    const error = new Error(
      "Provided gateway identifiers map to conflicting protection profiles"
    );
    error.statusCode = 409;
    error.details = resolution.matches;
    throw error;
  }

  const protectionProfile = resolution.profile;

  if (!protectionProfile) {
    const error = new Error(
      "No active protection profile matches the provided gateway identifiers"
    );
    error.statusCode = 404;
    throw error;
  }

  if (!["heartbeat", "attack_detected"].includes(eventType)) {
    const error = new Error("Unsupported event_type. Use heartbeat or attack_detected");
    error.statusCode = 400;
    throw error;
  }

  const gatewayEvent = await GatewayEvent.create({
    userId: protectionProfile.userId,
    protectionProfileId: protectionProfile._id,
    eventType,
    gatewayId: gatewayId || protectionProfile.gatewayId || null,
    victimVpnIp: victimVpnIp || protectionProfile.vpnIp,
    wireguardPublicKey: wireguardPublicKey || protectionProfile.wireguardPublicKey,
    gatewayPeerRef: gatewayPeerRef || protectionProfile.gatewayPeerRef,
    attackerIp: attackerIp || null,
    detectedAt,
    payload: req.body,
  });

  if (eventType === "heartbeat") {
    await recordProtectionHeartbeat(protectionProfile, {
      rawPayload: req.body,
      occurredAt: detectedAt,
      gatewayId,
    });

    publishUserEvent(protectionProfile.userId, "gateway-heartbeat", {
      protectionProfileId: protectionProfile._id,
      gatewayEventId: gatewayEvent._id,
      gatewayId: gatewayEvent.gatewayId,
      detectedAt: gatewayEvent.detectedAt,
      status: "healthy",
    });

    return sendSuccess(
      res,
      {
        eventId: gatewayEvent._id,
        eventType,
        userId: protectionProfile.userId,
        protectionProfileId: protectionProfile._id,
      },
      { message: "Heartbeat received" }
    );
  }

  const message = attackerIp
    ? `AI Shield Active: A DDoS attack from ${attackerIp} was just mitigated for your connection.`
    : "AI Shield Active: A malicious attack was just mitigated for your connection.";

  const alert = await Alert.create({
    userId: protectionProfile.userId,
    victimVpnIp: victimVpnIp || protectionProfile.vpnIp,
    attackerIp,
    message,
    rawPayload: req.body,
  });

  await recordProtectionAlert(protectionProfile, {
    attackerIp,
    rawPayload: req.body,
    occurredAt: detectedAt,
    gatewayId,
  });

  publishUserEvent(protectionProfile.userId, "alert", {
    _id: alert._id,
    gatewayEventId: gatewayEvent._id,
    message: alert.message,
    attackerIp: alert.attackerIp || null,
    victimVpnIp: alert.victimVpnIp,
    mitigatedAt: alert.mitigatedAt,
  });

  return sendSuccess(
    res,
    {
      alertId: alert._id,
      eventId: gatewayEvent._id,
      eventType,
      userId: protectionProfile.userId,
      protectionProfileId: protectionProfile._id,
    },
    {
      statusCode: 201,
      message: "Alert received",
    }
  );
});
