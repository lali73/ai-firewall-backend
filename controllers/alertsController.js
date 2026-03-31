const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const Alert = require("../models/Alert");
const User = require("../models/user");
const env = require("../config/env");
const { publishUserEvent } = require("../services/dashboardNotificationService");

const normalizeVpnIp = (value) => {
  const raw = typeof value === "string" ? value.trim() : "";

  if (!raw) {
    return "";
  }

  return raw.includes("/") ? raw : `${raw}/32`;
};

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

  if (!victimVpnIp) {
    const error = new Error("victim_vpn_ip is required");
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findOne({ "vpn.assignedIp": victimVpnIp });

  if (!user) {
    const error = new Error("No user is assigned to the provided VPN IP");
    error.statusCode = 404;
    throw error;
  }

  const message = attackerIp
    ? `AI Shield Active: A DDoS attack from ${attackerIp} was just mitigated for your connection.`
    : "AI Shield Active: A malicious attack was just mitigated for your connection.";

  const alert = await Alert.create({
    userId: user._id,
    victimVpnIp,
    attackerIp,
    message,
    rawPayload: req.body,
  });

  publishUserEvent(user._id, "alert", {
    _id: alert._id,
    message: alert.message,
    attackerIp: alert.attackerIp || null,
    victimVpnIp: alert.victimVpnIp,
    mitigatedAt: alert.mitigatedAt,
  });

  return sendSuccess(
    res,
    {
      alertId: alert._id,
      userId: user._id,
    },
    {
      statusCode: 201,
      message: "Alert received",
    }
  );
});
