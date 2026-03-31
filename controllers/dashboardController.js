const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const Alert = require("../models/Alert");
const { registerDashboardStream } = require("../services/dashboardNotificationService");

exports.getDashboardSummary = asyncHandler(async (req, res) => {
  const subscription = req.user?.subscription || {
    plan: "free",
    status: "inactive",
  };
  const recentAlerts = await Alert.find({ userId: req.user._id })
    .sort({ mitigatedAt: -1 })
    .limit(10)
    .lean();

  return sendSuccess(res, {
    user: {
      _id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
    },
    subscription,
    vpn: req.user.vpn || null,
    recentAlerts,
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
