const mongoose = require("mongoose");
const Subscription = require("../models/Subscription");
const User = require("../models/user");
const Payment = require("../models/Payment");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const {
  normalizePlanInput,
  escapeRegex,
  isValidWireGuardPrivateKey,
  isValidWireGuardPublicKey,
  normalizeWireGuardPrivateKey,
  normalizeWireGuardPublicKey,
} = require("../utils/validation");
const { markExpiredSubscriptionForUser } = require("../utils/subscriptionState");
const {
  createPeerProvisioningRequest,
  removeWireGuardPeer,
} = require("../services/gatewaySshService");
const { syncProtectionProfileForUser } = require("../services/protectionProfileService");
const {
  initializeTransaction,
  verifyTransaction,
} = require("../services/chapaService");
const env = require("../config/env");

const ALLOWED_PLAN_DURATIONS = [30, 180, 365];
const CHAPA_MAX_TX_REF_LENGTH = 50;
const CHAPA_MAX_TITLE_LENGTH = 16;
const CHAPA_CUSTOMIZATION_TITLE = "BRADSafe";

const buildError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const generateVpnQrCodeDataUri = async (configText) => {
  let QRCode;

  try {
    ({ default: QRCode } = await import("qrcode"));
  } catch (importError) {
    try {
      QRCode = require("qrcode");
    } catch (requireError) {
      throw buildError(
        "QR code generation is unavailable because the qrcode dependency is not installed.",
        500
      );
    }
  }

  return QRCode.toDataURL(configText, {
    errorCorrectionLevel: "M",
  });
};

const buildVpnConfigText = ({ assignedIp, clientPrivateKey, gatewayPublicKey }) => {
  const endpoint = `${env.GATEWAY_PUBLIC_IP}:${env.GATEWAY_WIREGUARD_PORT}`;

  return [
    "[Interface]",
    `PrivateKey = ${clientPrivateKey || "<YOUR_PRIVATE_KEY>"}`,
    `Address = ${assignedIp}`,
    `DNS = ${env.WIREGUARD_DNS || "1.1.1.1"}`,
    "",
    "[Peer]",
    `PublicKey = ${gatewayPublicKey}`,
    `Endpoint = ${endpoint}`,
    `AllowedIPs = ${env.WIREGUARD_ALLOWED_IPS || "0.0.0.0/0, ::/0"}`,
    "PersistentKeepalive = 25",
  ].join("\n");
};

const extractWireGuardPrivateKeyFromRequest = (req) =>
  normalizeWireGuardPrivateKey(
    req.body?.privateKey ||
      req.body?.private_key ||
      req.query?.privateKey ||
      req.query?.private_key
  );

const ensureVpnProvisioned = (user) => {
  if (!user?.vpn?.assignedIp) {
    throw buildError("VPN configuration not found.", 404);
  }

  if (user.vpn.status !== "active") {
    const detail = user.vpn.lastSyncError
      ? ` Gateway sync error: ${user.vpn.lastSyncError}`
      : "";
    throw buildError(
      `VPN peer is not active on the gateway yet.${detail}`,
      409
    );
  }
};

const generateTransactionId = () =>
  `SIM-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

const generateChapaTransactionId = (userId) => {
  const compactUserId = String(userId || "").slice(-8).toUpperCase();
  const timeComponent = Date.now().toString(36).toUpperCase();
  const randomComponent = Math.random().toString(36).slice(2, 8).toUpperCase();
  const txRef = `CHP-${compactUserId}-${timeComponent}-${randomComponent}`;

  return txRef.slice(0, CHAPA_MAX_TX_REF_LENGTH);
};

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

const parseUserName = (name) => {
  const trimmed = String(name || "").trim();
  if (!trimmed) {
    return { firstName: "Customer", lastName: "User" };
  }

  const [firstName, ...rest] = trimmed.split(/\s+/);
  return {
    firstName,
    lastName: rest.join(" ") || "User",
  };
};

const getServerBaseUrl = (req) => {
  if (env.SERVER_PUBLIC_URL) {
    return env.SERVER_PUBLIC_URL.replace(/\/+$/, "");
  }

  return `${req.protocol}://${req.get("host")}`;
};

const normalizeReturnUrl = (returnUrl) => {
  const fallbackUrl = env.CHAPA_RETURN_URL || env.CLIENT_URL;

  if (!returnUrl) {
    return fallbackUrl;
  }

  try {
    if (returnUrl.startsWith("/")) {
      return new URL(returnUrl, env.CLIENT_URL).toString();
    }

    const requestedUrl = new URL(returnUrl);
    const allowedOrigin = new URL(env.CLIENT_URL).origin;

    if (requestedUrl.origin !== allowedOrigin) {
      throw buildError("returnUrl must match the configured frontend origin.", 400);
    }

    return requestedUrl.toString();
  } catch (error) {
    if (error.statusCode) {
      throw error;
    }

    throw buildError("Invalid returnUrl provided.", 400);
  }
};

const validateChapaPayload = ({ txRef, customizationTitle }) => {
  if (!txRef || txRef.length > CHAPA_MAX_TX_REF_LENGTH) {
    throw buildError(
      `Generated Chapa tx_ref exceeds ${CHAPA_MAX_TX_REF_LENGTH} characters.`,
      500
    );
  }

  if (!customizationTitle || customizationTitle.length > CHAPA_MAX_TITLE_LENGTH) {
    throw buildError(
      `Chapa customization.title exceeds ${CHAPA_MAX_TITLE_LENGTH} characters.`,
      500
    );
  }
};

const getValidatedGatewayWireGuardPublicKey = () => {
  const gatewayPublicKey = normalizeWireGuardPublicKey(
    env.GATEWAY_WIREGUARD_PUBLIC_KEY
  );

  if (!isValidWireGuardPublicKey(gatewayPublicKey)) {
    throw buildError(
      "Invalid GATEWAY_WIREGUARD_PUBLIC_KEY. WireGuard public keys must be 44 characters long.",
      500
    );
  }

  return gatewayPublicKey;
};

const getVerificationStatus = (verificationData) =>
  String(
    verificationData?.status ||
      verificationData?.data?.status ||
      verificationData?.tx_status ||
      ""
  ).toLowerCase();

const extractReferenceId = (verificationData) =>
  verificationData?.data?.ref_id ||
  verificationData?.data?.reference ||
  verificationData?.ref_id ||
  null;

const syncVerifiedPayment = async (payment, verificationData) => {
  const verificationStatus = getVerificationStatus(verificationData);

  if (verificationStatus !== "success") {
    payment.status = "failed";
    payment.chapa = {
      ...(payment.chapa || {}),
      callbackStatus: verificationStatus || "failed",
      rawVerification: verificationData,
    };
    await payment.save();
    throw buildError("Chapa payment is not successful.", 400);
  }

  const verifiedAmount = Number.parseFloat(
    verificationData?.data?.amount ?? verificationData?.amount ?? payment.amount
  );
  const verifiedCurrency = String(
    verificationData?.data?.currency || verificationData?.currency || payment.currency
  ).toUpperCase();

  if (Number.isFinite(verifiedAmount) && Number(verifiedAmount.toFixed(2)) !== Number(payment.amount.toFixed(2))) {
    throw buildError("Verified payment amount does not match the selected plan.", 400);
  }

  if (verifiedCurrency !== String(payment.currency).toUpperCase()) {
    throw buildError("Verified payment currency does not match the selected plan.", 400);
  }

  payment.status = "completed";
  payment.simulated = false;
  payment.provider = "chapa";
  payment.paymentMethod = "chapa";
  payment.paidAt = new Date();
  payment.chapa = {
    ...(payment.chapa || {}),
    referenceId: extractReferenceId(verificationData),
    callbackStatus: verificationStatus,
    verifiedAt: new Date(),
    rawVerification: verificationData,
  };

  await payment.save();
  return payment;
};

/**
 * Builds the VPN response. 
 * Note: If hostPublicKey is missing, ensure GATEWAY_WIREGUARD_PUBLIC_KEY 
 * is set in your Leapcell Environment Variables.
 */
const buildVpnStatus = (user) => {
  const endpoint = `${env.GATEWAY_PUBLIC_IP}:${env.GATEWAY_WIREGUARD_PORT}`;
  const gatewayPublicKey = getValidatedGatewayWireGuardPublicKey();
  
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
      hostPublicKey: gatewayPublicKey,
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
  if (String(payment.planId) !== String(plan._id)) {
    throw buildError("Payment does not belong to the selected plan.", 400);
  }

  const startDate = new Date();
  const validUntil = new Date(startDate.getTime());
  validUntil.setDate(validUntil.getDate() + plan.duration);

  const normalizedPublicKey = normalizeWireGuardPublicKey(wireguardPublicKey);
  const assignedIp = await findNextAvailableVpnIp();
  let syncErrorMessage = null;
  let provisioningReference = null;

  // Provisioning via SSH to your Google Cloud VM
  try {
    provisioningReference = await createPeerProvisioningRequest({
      userId: user._id,
      publicKey: normalizedPublicKey,
      assignedIp,
    });
  } catch (error) {
    syncErrorMessage = error.message;
    console.error(
      `Failed to sync gateway peer for user ${user._id}:`,
      error.message
    );
  }

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
    status: syncErrorMessage ? "pending" : "active", 
    lastProvisionedAt: syncErrorMessage ? undefined : startDate,
    lastSyncedAt: syncErrorMessage ? undefined : startDate,
    lastSyncError: syncErrorMessage || undefined,
  };
  
  payment.status = "used";

  await Promise.all([payment.save(), user.save()]);
  const protectionProfile = await syncProtectionProfileForUser(user, {
    peerStatus: syncErrorMessage ? "pending" : "active",
    protectionEnabled: !syncErrorMessage,
    configIssuedAt: startDate,
    gatewayPeerRef: provisioningReference || undefined,
    lastProvisionedAt: syncErrorMessage ? undefined : startDate,
    lastSyncedAt: syncErrorMessage ? undefined : startDate,
    lastSyncError: syncErrorMessage || undefined,
  });

  return sendSuccess(
    res,
    {
      subscription: user.subscription,
      vpn: buildVpnStatus(user),
      protection: protectionProfile,
    },
    syncErrorMessage
      ? {
          message:
            "Payment verified and subscription activated, but gateway sync failed. An admin can retry sync.",
        }
      : {}
  );
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
    provider: "simulated",
    status: "completed", 
    simulated: true, 
    transactionId: generateTransactionId() 
  });
  return sendSuccess(res, payment, { statusCode: 201 });
});

exports.initializeChapaPayment = asyncHandler(async (req, res) => {
  if (!env.CHAPA_SECRET_KEY) {
    throw buildError("Chapa is not configured on the server.", 500);
  }

  const { planId, returnUrl } = req.body;
  const [plan, user] = await Promise.all([Subscription.findById(planId), User.findById(req.user._id)]);
  if (!plan || !user) throw buildError("Plan or User not found", 404);

  markExpiredSubscriptionForUser(user);
  ensureNoActiveSubscription(user);

  const txRef = generateChapaTransactionId(user._id);
  const { firstName, lastName } = parseUserName(user.name);
  const finalReturnUrl = normalizeReturnUrl(returnUrl);
  const callbackUrl = `${getServerBaseUrl(req)}/api/subscriptions/chapa/callback`;
  const customizationTitle = CHAPA_CUSTOMIZATION_TITLE;

  validateChapaPayload({ txRef, customizationTitle });

  const chapaResponse = await initializeTransaction({
    amount: String(plan.price),
    currency: env.CHAPA_CURRENCY,
    email: user.email,
    first_name: firstName,
    last_name: lastName,
    tx_ref: txRef,
    callback_url: callbackUrl,
    return_url: finalReturnUrl,
    customization: {
      title: customizationTitle,
      description: `Payment for ${plan.name}`,
    },
  });

  const checkoutUrl = chapaResponse?.data?.checkout_url;
  if (!checkoutUrl) {
    throw buildError("Chapa did not return a checkout URL.", 502);
  }

  const payment = await Payment.create({
    userId: user._id,
    planId: plan._id,
    amount: plan.price,
    currency: env.CHAPA_CURRENCY,
    paymentMethod: "chapa",
    provider: "chapa",
    status: "pending",
    simulated: false,
    transactionId: txRef,
    chapa: {
      checkoutUrl,
      rawVerification: chapaResponse,
    },
  });

  return sendSuccess(
    res,
    {
      paymentId: payment._id,
      planId: plan._id,
      txRef,
      checkoutUrl,
      callbackUrl,
      returnUrl: finalReturnUrl,
      status: payment.status,
    },
    { statusCode: 201 }
  );
});

exports.verifyChapaPayment = asyncHandler(async (req, res) => {
  if (!env.CHAPA_SECRET_KEY) {
    throw buildError("Chapa is not configured on the server.", 500);
  }

  const txRef = req.params.txRef;
  const payment = await Payment.findOne({
    transactionId: txRef,
    userId: req.user._id,
    provider: "chapa",
  });

  if (!payment) {
    throw buildError("Payment not found for this user.", 404);
  }

  if (payment.status !== "completed") {
    const verificationData = await verifyTransaction(txRef);
    await syncVerifiedPayment(payment, verificationData);
  }

  return sendSuccess(res, payment);
});

exports.handleChapaCallback = asyncHandler(async (req, res) => {
  if (!env.CHAPA_SECRET_KEY) {
    throw buildError("Chapa is not configured on the server.", 500);
  }

  const txRef = req.query.trx_ref || req.query.tx_ref;
  if (!txRef) {
    throw buildError("Missing Chapa transaction reference.", 400);
  }

  const payment = await Payment.findOne({
    transactionId: txRef,
    provider: "chapa",
  });

  if (!payment) {
    throw buildError("Payment not found.", 404);
  }

  if (payment.status !== "completed") {
    const verificationData = await verifyTransaction(txRef);
    await syncVerifiedPayment(payment, verificationData);
  }

  return sendSuccess(res, {
    txRef,
    status: payment.status,
    paymentId: payment._id,
  });
});

exports.cancelMySubscription = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const cancelledAt = new Date();

  if (user.subscription) {
    user.subscription.isActive = false;
    user.subscription.status = "cancelled";
    user.subscription.cancelledAt = cancelledAt;
  }

  let syncWarning = null;

  if (user.vpn) {
    user.vpn.status = "revoked";
    user.vpn.lastDeprovisionedAt = cancelledAt;

    if (user.vpn.publicKey) {
      try {
        await removeWireGuardPeer(user.vpn.publicKey);
        user.vpn.lastSyncedAt = cancelledAt;
        user.vpn.lastSyncError = undefined;
      } catch (error) {
        syncWarning = error.message;
        user.vpn.lastSyncError = error.message;
        console.error(
          `Failed to revoke gateway peer for user ${user._id}:`,
          error.message
        );
      }
    }
  }

  await user.save();
  const protectionProfile = await syncProtectionProfileForUser(user, {
    peerStatus: "revoked",
    protectionEnabled: false,
    lastDeprovisionedAt: cancelledAt,
    lastSyncedAt: syncWarning ? undefined : cancelledAt,
    lastSyncError: syncWarning || user.vpn?.lastSyncError,
  });
  return sendSuccess(
    res,
    {
      message: "Subscription cancelled",
      subscription: user.subscription,
      vpn: user.vpn,
      protection: protectionProfile,
    },
    syncWarning
      ? {
          message:
            "Subscription cancelled in the database, but gateway revocation failed. An admin can retry sync.",
        }
      : {}
  );
});

exports.retrySubscriptionGatewaySync = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId);
  if (!user) {
    throw buildError("User not found.", 404);
  }

  const syncAt = new Date();

  if (user.subscription?.isActive) {
    if (!user.vpn?.publicKey || !user.vpn?.assignedIp) {
      throw buildError("User is missing VPN key or assigned IP.", 400);
    }

    const provisioningReference = await createPeerProvisioningRequest({
      userId: user._id,
      publicKey: user.vpn.publicKey,
      assignedIp: user.vpn.assignedIp,
    });

    user.vpn.status = "active";
    user.vpn.lastProvisionedAt = syncAt;
    user.vpn.lastSyncedAt = syncAt;
    user.vpn.lastSyncError = undefined;
    await user.save();
    const protectionProfile = await syncProtectionProfileForUser(user, {
      peerStatus: "active",
      protectionEnabled: true,
      gatewayPeerRef: provisioningReference || undefined,
      lastProvisionedAt: syncAt,
      lastSyncedAt: syncAt,
      lastSyncError: undefined,
    });

    return sendSuccess(res, {
      message: "Gateway peer sync retried successfully.",
      vpn: user.vpn,
      protection: protectionProfile,
    });
  }

  if (!user.vpn?.publicKey) {
    throw buildError("User has no VPN public key to revoke.", 400);
  }

  await removeWireGuardPeer(user.vpn.publicKey);
  user.vpn.status = "revoked";
  user.vpn.lastDeprovisionedAt = syncAt;
  user.vpn.lastSyncedAt = syncAt;
  user.vpn.lastSyncError = undefined;
  await user.save();
  const protectionProfile = await syncProtectionProfileForUser(user, {
    peerStatus: "revoked",
    protectionEnabled: false,
    lastDeprovisionedAt: syncAt,
    lastSyncedAt: syncAt,
    lastSyncError: undefined,
  });

  return sendSuccess(res, {
    message: "Gateway peer revocation retried successfully.",
    vpn: user.vpn,
    protection: protectionProfile,
  });
});

exports.getVpnAccess = asyncHandler(async (req, res) => {
  ensureVpnProvisioned(req.user);
  return sendSuccess(res, buildVpnStatus(req.user));
});

exports.downloadVpnConfig = asyncHandler(async (req, res) => {
  ensureVpnProvisioned(req.user);
  const gatewayPublicKey = getValidatedGatewayWireGuardPublicKey();
  const rawPrivateKey = extractWireGuardPrivateKeyFromRequest(req);

  if (!rawPrivateKey) {
    throw buildError(
      "A WireGuard private key is required to generate an importable config and QR code.",
      400
    );
  }

  if (!isValidWireGuardPrivateKey(rawPrivateKey)) {
    throw buildError("Invalid WireGuard private key.", 400);
  }

  const configText = buildVpnConfigText({
    assignedIp: req.user.vpn.assignedIp,
    clientPrivateKey: rawPrivateKey,
    gatewayPublicKey,
  });

  const qrCodeDataUri = await generateVpnQrCodeDataUri(configText);

  return sendSuccess(res, {
    configText,
    qrCodeDataUri,
  });
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
