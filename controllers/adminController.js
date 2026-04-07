const User = require("../models/user");
const Payment = require("../models/Payment");
const AdminLog = require("../models/AdminLog");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const {
  createPeerProvisioningRequest,
  removeWireGuardPeer,
  runRemoteCommand,
} = require("../services/gatewaySshService");
const { createAdminLog } = require("../services/adminLogService");
const env = require("../config/env");

const buildError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const parseWireGuardDump = (stdout) => {
  const lines = String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return {
      interface: null,
      peers: [],
    };
  }

  const [interfaceLine, ...peerLines] = lines;
  const [, publicKey, listenPort, fwmark] = interfaceLine.split("\t");

  const peers = peerLines.map((line) => {
    const [
      peerPublicKey,
      presharedKey,
      endpoint,
      allowedIps,
      latestHandshake,
      transferRx,
      transferTx,
      persistentKeepalive,
    ] = line.split("\t");

    return {
      publicKey: peerPublicKey || null,
      presharedKey: presharedKey || null,
      endpoint: endpoint || null,
      allowedIps: allowedIps
        ? allowedIps.split(",").map((item) => item.trim()).filter(Boolean)
        : [],
      latestHandshake: latestHandshake ? Number(latestHandshake) : 0,
      transferRx: transferRx ? Number(transferRx) : 0,
      transferTx: transferTx ? Number(transferTx) : 0,
      persistentKeepalive: persistentKeepalive
        ? Number(persistentKeepalive)
        : 0,
    };
  });

  return {
    interface: {
      publicKey: publicKey || null,
      listenPort: listenPort ? Number(listenPort) : null,
      fwmark: fwmark || null,
    },
    peers,
  };
};

const getUserOrThrow = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw buildError("User not found.", 404);
  }

  return user;
};

exports.getAdminUsers = asyncHandler(async (req, res) => {
  const users = await User.find({})
    .select(
      "_id name email role createdAt updatedAt subscription vpn"
    )
    .sort({ createdAt: -1 })
    .lean();

  const data = users.map((user) => ({
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastSyncedAt: user.vpn?.lastSyncedAt || null,
    lastSyncError: user.vpn?.lastSyncError || null,
    subscription: {
      plan: user.subscription?.plan || "free",
      status: user.subscription?.status || "inactive",
      isActive: Boolean(user.subscription?.isActive),
      validUntil: user.subscription?.validUntil || null,
    },
    vpn: {
      status: user.vpn?.status || "unassigned",
      assignedIp: user.vpn?.assignedIp || null,
      lastSyncedAt: user.vpn?.lastSyncedAt || null,
      lastSyncError: user.vpn?.lastSyncError || null,
    },
  }));

  return sendSuccess(res, data);
});

exports.updateUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  if (!["user", "admin"].includes(role)) {
    throw buildError("Role must be either 'user' or 'admin'.", 400);
  }

  const user = await getUserOrThrow(req.params.userId);
  const previousRole = user.role;
  user.role = role;
  await user.save();

  await createAdminLog({
    adminUser: req.user,
    action: "user.role.updated",
    targetUser: user,
    details: { previousRole, newRole: role },
  });

  return sendSuccess(res, {
    _id: user._id,
    email: user.email,
    role: user.role,
  });
});

exports.deleteUser = asyncHandler(async (req, res) => {
  const user = await getUserOrThrow(req.params.userId);

  if (user.vpn?.publicKey) {
    try {
      await removeWireGuardPeer(user.vpn.publicKey);
    } catch (error) {
      console.error(
        `Failed to revoke gateway peer before deleting user ${user._id}:`,
        error.message
      );
    }
  }

  await Promise.all([
    Payment.deleteMany({ userId: user._id }),
    User.findByIdAndDelete(user._id),
  ]);

  await createAdminLog({
    adminUser: req.user,
    action: "user.deleted",
    targetUser: user,
    details: { userId: String(user._id) },
  });

  return sendSuccess(res, { message: "User deleted." });
});

exports.getGatewayStatus = asyncHandler(async (req, res) => {
  const stdout = await runRemoteCommand(
    `sudo wg show ${env.WIREGUARD_INTERFACE || "wg0"} dump`
  );

  return sendSuccess(res, parseWireGuardDump(stdout.stdout));
});

exports.syncGatewayUser = asyncHandler(async (req, res) => {
  const user = await getUserOrThrow(req.params.userId);
  if (!user.vpn?.publicKey || !user.vpn?.assignedIp) {
    throw buildError("User is missing VPN public key or assigned IP.", 400);
  }

  await createPeerProvisioningRequest({
    userId: user._id,
    publicKey: user.vpn.publicKey,
    assignedIp: user.vpn.assignedIp,
  });

  const syncAt = new Date();
  user.vpn.status = "active";
  user.vpn.lastProvisionedAt = syncAt;
  user.vpn.lastSyncedAt = syncAt;
  user.vpn.lastSyncError = undefined;
  await user.save();

  await createAdminLog({
    adminUser: req.user,
    action: "gateway.peer.synced",
    targetUser: user,
    details: {
      publicKey: user.vpn.publicKey,
      assignedIp: user.vpn.assignedIp,
    },
  });

  return sendSuccess(res, {
    message: "Gateway sync completed.",
    vpn: user.vpn,
  });
});

exports.revokeGatewayUser = asyncHandler(async (req, res) => {
  const user = await getUserOrThrow(req.params.userId);
  if (!user.vpn?.publicKey) {
    throw buildError("User has no VPN public key to revoke.", 400);
  }

  await removeWireGuardPeer(user.vpn.publicKey);

  const syncAt = new Date();
  user.vpn.status = "revoked";
  user.vpn.lastDeprovisionedAt = syncAt;
  user.vpn.lastSyncedAt = syncAt;
  user.vpn.lastSyncError = undefined;
  await user.save();

  await createAdminLog({
    adminUser: req.user,
    action: "gateway.peer.revoked",
    targetUser: user,
    details: {
      publicKey: user.vpn.publicKey,
    },
  });

  return sendSuccess(res, {
    message: "Gateway revoke completed.",
    vpn: user.vpn,
  });
});

exports.getAdminLogs = asyncHandler(async (req, res) => {
  const logs = await AdminLog.find({})
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return sendSuccess(res, logs);
});
