const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const Alert = require("../models/Alert");
const GatewayEvent = require("../models/GatewayEvent");
const { registerDashboardStream } = require("../services/dashboardNotificationService");
const ProtectionProfile = require("../models/ProtectionProfile");

exports.getDashboardSummary = asyncHandler(async (req, res) => {
  const subscription = req.user?.subscription || {
    plan: "free",
    status: "inactive",
  };
  const [recentAlerts, recentGatewayEvents, protection] = await Promise.all([
    Alert.find({ userId: req.user._id }).sort({ mitigatedAt: -1 }).limit(10).lean(),
    GatewayEvent.find({ userId: req.user._id })
      .sort({ detectedAt: -1 })
      .limit(10)
      .lean(),
    ProtectionProfile.findOne({ userId: req.user._id }).lean(),
  ]);

  return sendSuccess(res, {
    user: {
      _id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
    },
    subscription,
    vpn: req.user.vpn || null,
    protection,
    recentAlerts,
    recentGatewayEvents,
    subscriptionHistoryCount: Array.isArray(req.user.subscriptionHistory)
      ? req.user.subscriptionHistory.length
      : 0,
  });
});

exports.streamDashboardAlerts = asyncHandler(async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  res.write(
    `event: connected\ndata: ${JSON.stringify({
      userId: req.user._id,
      connectedAt: new Date().toISOString(),
    })}\n\n`
  );

  registerDashboardStream(req.user._id, res);
});
