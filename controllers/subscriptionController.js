const mongoose = require("mongoose");
const Subscription = require("../models/Subscription");
const User = require("../models/user");
const Payment = require("../models/Payment");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const {
  normalizePlanInput,
  escapeRegex,
  isValidWireGuardPublicKey,
  normalizeWireGuardPublicKey,
} = require("../utils/validation");
const { markExpiredSubscriptionForUser } = require("../utils/subscriptionState");
const { createPeerProvisioningRequest } = require("../services/gatewaySshService");
const env = require("../config/env");

const ALLOWED_PLAN_DURATIONS = [30, 180, 365];

const buildError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const generateTransactionId = () =>
  `SIM-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

const ensureNoActiveSubscription = (user) => {
  if (user.subscription?.isActive) {
    throw buildError("Active subscription already exists.", 409);
  }
};

const ensureAllowedDuration = (duration) => {
  if (!ALLOWED_PLAN_DURATIONS.includes(duration)) {
    throw buildError("Unsupported plan duration.", 400);
  }
};

/**
 * Builds the VPN response. 
 * Note: If hostPublicKey is missing, ensure GATEWAY_WIREGUARD_PUBLIC_KEY 
 * is set in your Leapcell Environment Variables.
 */
const buildVpnStatus = (user) => {
  const endpoint = `${env.GATEWAY_PUBLIC_IP}:${env.GATEWAY_WIREGUARD_PORT}`;
  
  return {
    isActive: Boolean(user.subscription?.isActive),
    status: user.vpn?.status || "unassigned",
    validUntil: user.subscription?.validUntil || null,
    
    // User's specific tunnel settings
    clientConfiguration: {
      address: user.vpn?.assignedIp || null,
      dns: env.WIREGUARD_DNS || "1.1.1.1",
      userPublicKey: user.vpn?.publicKey || null,
    },

    // The Gateway (Host Machine) details the user needs for the [Peer] section
    gatewayConfiguration: {
      hostPublicKey: env.GATEWAY_WIREGUARD_PUBLIC_KEY || "MISSING_FROM_ENV",
      endpoint: endpoint,
      allowedIps: env.WIREGUARD_ALLOWED_IPS || "0.0.0.0/0, ::/0",
      persistentKeepalive: 25,
    }
  };
};

const findNextAvailableVpnIp = async () => {
  const users = await User.find({ "vpn.assignedIp": { $exists: true, $ne: null } }, "vpn.assignedIp").lean();
  const assignedHosts = new Set(
    users.map((u) => u.vpn?.assignedIp).filter(Boolean).map((ip) => Number(ip.split("/")[0].split(".")[3]))
  );
  for (let host = env.WIREGUARD_START_HOST; host <= env.WIREGUARD_END_HOST; host += 1) {
    if (!assignedHosts.has(host)) return `${env.WIREGUARD_NETWORK_PREFIX}.${host}/32`;
  }
  throw buildError("No WireGuard IPs available.", 503);
};

// --- Exported Actions ---

exports.getPlans = asyncHandler(async (req, res) => {
  const plans = await Subscription.find({ duration: { $in: ALLOWED_PLAN_DURATIONS } }).sort({ duration: 1 });
  return sendSuccess(res, plans);
});

exports.buyPlan = asyncHandler(async (req, res) => {
  const { planId, paymentId, wireguardPublicKey } = req.body;
  if (!isValidWireGuardPublicKey(wireguardPublicKey)) throw buildError("Invalid WG Public Key", 400);

  const [plan, user] = await Promise.all([Subscription.findById(planId), User.findById(req.user._id)]);
  if (!plan || !user) throw buildError("Plan or User not found", 404);

  markExpiredSubscriptionForUser(user);
  ensureNoActiveSubscription(user);

  const payment = await Payment.findOne({ _id: paymentId, userId: user._id, status: "completed" });
  if (!payment) throw buildError("Valid payment not found.", 400);

  const startDate = new Date();
  const validUntil = new Date(startDate.getTime());
  validUntil.setDate(validUntil.getDate() + plan.duration);

  const normalizedPublicKey = normalizeWireGuardPublicKey(wireguardPublicKey);
  const assignedIp = await findNextAvailableVpnIp();

  // Provisioning via SSH to your Google Cloud VM
  await createPeerProvisioningRequest({ userId: user._id, publicKey: normalizedPublicKey, assignedIp });

  user.subscription = { 
    planId: plan._id, 
    plan: plan.name, 
    price: plan.price, 
    status: "active", 
    startDate, 
    endDate: validUntil, 
    transactionId: payment.transactionId, 
    isActive: true, 
    validUntil 
  };
  
  user.vpn = { 
    publicKey: normalizedPublicKey, 
    assignedIp, 
    status: "active", 
    lastProvisionedAt: startDate 
  };
  
  payment.status = "used";

  await Promise.all([payment.save(), user.save()]);
  return sendSuccess(res, { subscription: user.subscription, vpn: buildVpnStatus(user) });
});

exports.getMyPlan = asyncHandler(async (req, res) => sendSuccess(res, req.user.subscription));

exports.getSubscriptionHistory = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("subscriptionHistory");
  return sendSuccess(res, [...(user.subscriptionHistory || [])].reverse());
});

exports.simulatePayment = asyncHandler(async (req, res) => {
  const { planId, paymentMethod } = req.body;
  const plan = await Subscription.findById(planId);
  if (!plan) throw buildError("Plan not found", 404);
  const payment = await Payment.create({ 
    userId: req.user._id, 
    planId: plan._id, 
    amount: plan.price, 
    paymentMethod: paymentMethod || "telebirr", 
    status: "completed", 
    simulated: true, 
    transactionId: generateTransactionId() 
  });
  return sendSuccess(res, payment, { statusCode: 201 });
});

exports.cancelMySubscription = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (user.subscription) user.subscription.isActive = false;
  if (user.vpn) user.vpn.status = "revoked";
  await user.save();
  return sendSuccess(res, { message: "Subscription cancelled" });
});

exports.getVpnAccess = asyncHandler(async (req, res) => sendSuccess(res, buildVpnStatus(req.user)));

exports.downloadVpnConfig = asyncHandler(async (req, res) => {
  if (!req.user.vpn || !req.user.vpn.assignedIp) {
    throw buildError("VPN configuration not found.", 404);
  }
  
  const endpoint = `${env.GATEWAY_PUBLIC_IP}:${env.GATEWAY_WIREGUARD_PORT}`;
  const config = [
    "[Interface]",
    "PrivateKey = <YOUR_PRIVATE_KEY>",
    `Address = ${req.user.vpn.assignedIp}`,
    `DNS = ${env.WIREGUARD_DNS || "1.1.1.1"}`,
    "",
    "[Peer]",
    `PublicKey = ${env.GATEWAY_WIREGUARD_PUBLIC_KEY || "REPLACE_WITH_SERVER_PUBLIC_KEY"}`,
    `Endpoint = ${endpoint}`,
    `AllowedIPs = ${env.WIREGUARD_ALLOWED_IPS || "0.0.0.0/0, ::/0"}`,
    "PersistentKeepalive = 25"
  ].join("\n");
  
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Content-Disposition", 'attachment; filename="vectraflow.conf"');
  return res.status(200).send(config);
});

// Admin Controllers
exports.createPlan = asyncHandler(async (req, res) => {
  const plan = await Subscription.create(normalizePlanInput(req.body));
  return sendSuccess(res, plan, { statusCode: 201 });
});

exports.updatePlan = asyncHandler(async (req, res) => {
  const plan = await Subscription.findByIdAndUpdate(req.params.planId, normalizePlanInput(req.body), { new: true });
  return sendSuccess(res, plan);
});

exports.deletePlan = asyncHandler(async (req, res) => {
  await Subscription.findByIdAndDelete(req.params.planId);
  return sendSuccess(res, { message: "Plan deleted" });
});