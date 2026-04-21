const ProtectionProfile = require("../models/ProtectionProfile");
const env = require("../config/env");
const { normalizeWireGuardPublicKey } = require("../utils/validation");

const sanitizeVpnIp = (value) => {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    return "";
  }

  return raw.split("/")[0].trim();
};

const normalizeVpnIp = (value) => sanitizeVpnIp(value);

const normalizeGatewayPeerRef = (value) =>
  typeof value === "string" ? value.trim() : "";

const normalizeGatewayId = (value) =>
  typeof value === "string" ? value.trim() : "";

const buildGatewayPeerRef = (userId) =>
  `${env.WIREGUARD_INTERFACE || "wg0"}:${String(userId)}`;

const buildVpnIpVariants = (value) => {
  const sanitizedVpnIp = sanitizeVpnIp(value);

  if (!sanitizedVpnIp) {
    return [];
  }

  return [...new Set([sanitizedVpnIp, `${sanitizedVpnIp}/32`])];
};

const buildProtectionProfilePayload = (user, overrides = {}) => {
  const vpnIp = normalizeVpnIp(overrides.vpnIp ?? user.vpn?.assignedIp);
  const wireguardPublicKey = normalizeWireGuardPublicKey(
    overrides.wireguardPublicKey ?? user.vpn?.publicKey
  );
  const peerStatus = overrides.peerStatus ?? user.vpn?.status ?? "unassigned";
  const subscriptionStatus =
    overrides.subscriptionStatus ??
    user.subscription?.status ??
    "inactive";
  const gatewayPeerRef =
    normalizeGatewayPeerRef(overrides.gatewayPeerRef) ||
    (user._id ? buildGatewayPeerRef(user._id) : "");
  const protectionEnabled =
    overrides.protectionEnabled ??
    (subscriptionStatus === "active" && peerStatus === "active");

  return {
    userId: user._id,
    email: user.email,
    name: user.name,
    subscriptionStatus,
    protectionEnabled: Boolean(protectionEnabled),
    peerStatus,
    vpnIp: vpnIp || null,
    wireguardPublicKey: wireguardPublicKey || null,
    gatewayPeerRef: gatewayPeerRef || null,
    gatewayId:
      overrides.gatewayId !== undefined
        ? normalizeGatewayId(overrides.gatewayId) || null
        : undefined,
    gatewayInterface: env.WIREGUARD_INTERFACE || "wg0",
    configIssuedAt: overrides.configIssuedAt ?? undefined,
    lastProvisionedAt:
      overrides.lastProvisionedAt ?? user.vpn?.lastProvisionedAt ?? undefined,
    lastDeprovisionedAt:
      overrides.lastDeprovisionedAt ??
      user.vpn?.lastDeprovisionedAt ??
      undefined,
    lastSyncedAt: overrides.lastSyncedAt ?? user.vpn?.lastSyncedAt ?? undefined,
    lastSyncError:
      overrides.lastSyncError !== undefined
        ? overrides.lastSyncError
        : user.vpn?.lastSyncError,
    isOnline:
      overrides.isOnline !== undefined ? Boolean(overrides.isOnline) : undefined,
    lastSeen: overrides.lastSeen ?? undefined,
    healthStatus: overrides.healthStatus ?? undefined,
    lastHeartbeatAt: overrides.lastHeartbeatAt ?? undefined,
    lastEventType: overrides.lastEventType ?? undefined,
    lastEventAt: overrides.lastEventAt ?? undefined,
    lastEventPayload: overrides.lastEventPayload ?? undefined,
  };
};

const syncProtectionProfileForUser = async (user, overrides = {}) => {
  if (!user?._id) {
    throw new Error("Cannot sync protection profile without a user.");
  }

  const payload = buildProtectionProfilePayload(user, overrides);

  return ProtectionProfile.findOneAndUpdate(
    { userId: user._id },
    payload,
    {
      returnDocument: "after",
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    }
  );
};

const buildGatewayVpnMismatchError = ({
  gatewayId,
  vpnIp,
  claimedByGatewayId,
  claimedByUserId,
  claimedByProfileId,
}) => {
  const error = new Error(
    `VPN IP ${vpnIp} is already registered to gateway ${claimedByGatewayId || "unknown"}.`
  );
  error.statusCode = 409;
  error.details = {
    code: "VPN_IP_GATEWAY_MISMATCH",
    message:
      "The provided VPN IP is already claimed by a different gateway mapping.",
    requested: {
      gatewayId,
      vpnIp,
    },
    existing: {
      profileId: claimedByProfileId || null,
      userId: claimedByUserId || null,
      gatewayId: claimedByGatewayId || null,
      vpnIp,
    },
  };
  return error;
};

const upsertProtectionProfileGatewayMapping = async ({
  user,
  gatewayId,
  vpnIp,
}) => {
  if (!user?._id) {
    throw new Error("Cannot upsert gateway mapping without a user.");
  }

  const normalizedGatewayId = normalizeGatewayId(gatewayId);
  const normalizedVpnIp = normalizeVpnIp(vpnIp);

  if (!normalizedGatewayId) {
    const error = new Error("gatewayId is required.");
    error.statusCode = 400;
    throw error;
  }

  if (!normalizedVpnIp) {
    const error = new Error("vpnIp is required.");
    error.statusCode = 400;
    throw error;
  }

  const [existingByUserId, existingByGatewayId, existingByVpnIp] =
    await Promise.all([
      ProtectionProfile.findOne({ userId: user._id }),
      ProtectionProfile.findOne({ gatewayId: normalizedGatewayId }),
      ProtectionProfile.findOne({ vpnIp: normalizedVpnIp }),
    ]);

  if (
    existingByVpnIp &&
    (!existingByGatewayId ||
      String(existingByVpnIp._id) !== String(existingByGatewayId._id)) &&
    normalizeGatewayId(existingByVpnIp.gatewayId) !== normalizedGatewayId
  ) {
    throw buildGatewayVpnMismatchError({
      gatewayId: normalizedGatewayId,
      vpnIp: normalizedVpnIp,
      claimedByGatewayId: existingByVpnIp.gatewayId,
      claimedByUserId: existingByVpnIp.userId ? String(existingByVpnIp.userId) : null,
      claimedByProfileId: String(existingByVpnIp._id),
    });
  }

  if (
    existingByGatewayId &&
    String(existingByGatewayId.userId) !== String(user._id)
  ) {
    const error = new Error(
      `Gateway ID ${normalizedGatewayId} is already registered to another user.`
    );
    error.statusCode = 409;
    error.details = {
      code: "GATEWAY_ID_ALREADY_REGISTERED",
      message:
        "The provided gateway ID is already associated with a different protection profile.",
      requested: {
        gatewayId: normalizedGatewayId,
        vpnIp: normalizedVpnIp,
        userId: String(user._id),
      },
      existing: {
        profileId: String(existingByGatewayId._id),
        userId: String(existingByGatewayId.userId),
        gatewayId: existingByGatewayId.gatewayId || null,
        vpnIp: existingByGatewayId.vpnIp || null,
      },
    };
    throw error;
  }

  const targetProfile = existingByGatewayId || existingByUserId;

  const profile = await syncProtectionProfileForUser(user, {
    gatewayId: normalizedGatewayId,
    vpnIp: normalizedVpnIp,
    gatewayPeerRef:
      targetProfile?.gatewayPeerRef ||
      (user._id ? buildGatewayPeerRef(user._id) : undefined),
  });

  return {
    created: !targetProfile,
    updated: Boolean(targetProfile),
    profile,
  };
};

const backfillProtectionProfilesFromUsers = async (UserModel) => {
  const users = await UserModel.find({})
    .select("name email subscription vpn")
    .lean(false);

  for (const user of users) {
    await syncProtectionProfileForUser(user);
  }

  return users.length;
};

const resolveProtectionProfile = async ({
  victimVpnIp,
  wireguardPublicKey,
  gatewayPeerRef,
  gatewayId,
  requireActiveProtection = false,
}) => {
  const normalizedVpnIp = normalizeVpnIp(victimVpnIp);
  const vpnIpVariants = buildVpnIpVariants(normalizedVpnIp);
  const normalizedPublicKey = normalizeWireGuardPublicKey(wireguardPublicKey);
  const normalizedPeerRef = normalizeGatewayPeerRef(gatewayPeerRef);
  const normalizedGatewayId = normalizeGatewayId(gatewayId);

  const clauses = [];

  if (normalizedPeerRef) {
    clauses.push({ gatewayPeerRef: normalizedPeerRef });
  }

  if (normalizedGatewayId) {
    clauses.push({ gatewayId: normalizedGatewayId });
  }

  if (vpnIpVariants.length && normalizedPublicKey) {
    clauses.push({
      vpnIp: { $in: vpnIpVariants },
      wireguardPublicKey: normalizedPublicKey,
    });
  }

  if (vpnIpVariants.length) {
    clauses.push({ vpnIp: { $in: vpnIpVariants } });
  }

  if (normalizedPublicKey) {
    clauses.push({ wireguardPublicKey: normalizedPublicKey });
  }

  if (!clauses.length) {
    return null;
  }

  const query = clauses.length === 1 ? clauses[0] : { $or: clauses };

  if (requireActiveProtection) {
    query.subscriptionStatus = "active";
    query.protectionEnabled = true;
  }

  return ProtectionProfile.findOne(query);
};

const resolveProtectionProfileIdentifiers = async ({
  victimVpnIp,
  wireguardPublicKey,
  gatewayPeerRef,
  gatewayId,
  requireActiveProtection = false,
}) => {
  const normalizedVpnIp = normalizeVpnIp(victimVpnIp);
  const vpnIpVariants = buildVpnIpVariants(normalizedVpnIp);
  const normalizedPublicKey = normalizeWireGuardPublicKey(wireguardPublicKey);
  const normalizedPeerRef = normalizeGatewayPeerRef(gatewayPeerRef);
  const normalizedGatewayId = normalizeGatewayId(gatewayId);
  const baseQuery = requireActiveProtection
    ? { subscriptionStatus: "active", protectionEnabled: true }
    : {};

  const checks = [
    vpnIpVariants.length
      ? {
          key: "victim_vpn_ip",
          value: normalizedVpnIp,
          query: { ...baseQuery, vpnIp: { $in: vpnIpVariants } },
        }
      : null,
    normalizedPublicKey
      ? {
          key: "wireguard_public_key",
          value: normalizedPublicKey,
          query: { ...baseQuery, wireguardPublicKey: normalizedPublicKey },
        }
      : null,
    normalizedPeerRef
      ? {
          key: "gateway_peer_ref",
          value: normalizedPeerRef,
          query: { ...baseQuery, gatewayPeerRef: normalizedPeerRef },
        }
      : null,
    normalizedGatewayId
      ? {
          key: "gateway_id",
          value: normalizedGatewayId,
          query: { ...baseQuery, gatewayId: normalizedGatewayId },
        }
      : null,
  ].filter(Boolean);

  if (!checks.length) {
    return {
      profile: null,
      conflict: false,
      matches: {},
    };
  }

  const results = await Promise.all(
    checks.map(async (check) => ({
      ...check,
      profile: await ProtectionProfile.findOne(check.query),
    }))
  );

  const matches = {};
  const matchedProfiles = [];

  for (const result of results) {
    matches[result.key] = {
      value: result.value,
      profileId: result.profile ? String(result.profile._id) : null,
      userId: result.profile ? String(result.profile.userId) : null,
    };

    if (result.profile) {
      matchedProfiles.push(result.profile);
    }
  }

  if (!matchedProfiles.length) {
    return {
      profile: null,
      conflict: false,
      matches,
    };
  }

  const distinctProfileIds = new Set(
    matchedProfiles.map((profile) => String(profile._id))
  );

  if (distinctProfileIds.size > 1) {
    return {
      profile: null,
      conflict: true,
      matches,
    };
  }

  const selectedProfile = matchedProfiles[0];

  for (const result of results) {
    if (result.profile) {
      continue;
    }

    if (
      result.key === "gateway_id" &&
      !normalizeGatewayId(selectedProfile.gatewayId)
    ) {
      continue;
    }

    return {
      profile: null,
      conflict: true,
      matches,
    };
  }

  return {
    profile: selectedProfile,
    conflict: false,
    matches,
  };
};

const recordProtectionAlert = async (
  profile,
  {
    attackerIp = "",
    rawPayload = null,
    occurredAt = new Date(),
    gatewayId = "",
  } = {}
) => {
  if (!profile?._id) {
    throw new Error("Cannot record a protection alert without a profile.");
  }

  profile.lastAlertAt = occurredAt;
  profile.lastAttackerIp = attackerIp || null;
  profile.lastAlertPayload = rawPayload;
  profile.alertCount = Number(profile.alertCount || 0) + 1;
  profile.healthStatus = "under_attack";
  profile.lastEventType = "attack_detected";
  profile.lastEventAt = occurredAt;
  profile.lastEventPayload = rawPayload;
  profile.gatewayId = normalizeGatewayId(gatewayId) || profile.gatewayId;

  await profile.save();
  return profile;
};

const recordProtectionHeartbeat = async (
  profile,
  { rawPayload = null, occurredAt = new Date(), gatewayId = "" } = {}
) => {
  if (!profile?._id) {
    throw new Error("Cannot record a protection heartbeat without a profile.");
  }

  profile.lastHeartbeatAt = occurredAt;
  profile.lastSeen = occurredAt;
  profile.isOnline = true;
  profile.lastEventType = "heartbeat";
  profile.lastEventAt = occurredAt;
  profile.lastEventPayload = rawPayload;
  profile.healthStatus = "healthy";
  profile.gatewayId = normalizeGatewayId(gatewayId) || profile.gatewayId;

  await profile.save();
  return profile;
};

const deleteProtectionProfileForUser = async (userId) =>
  ProtectionProfile.deleteOne({ userId });

module.exports = {
  backfillProtectionProfilesFromUsers,
  buildGatewayPeerRef,
  buildVpnIpVariants,
  deleteProtectionProfileForUser,
  normalizeGatewayId,
  normalizeGatewayPeerRef,
  normalizeVpnIp,
  recordProtectionHeartbeat,
  recordProtectionAlert,
  resolveProtectionProfileIdentifiers,
  resolveProtectionProfile,
  sanitizeVpnIp,
  syncProtectionProfileForUser,
  upsertProtectionProfileGatewayMapping,
};
