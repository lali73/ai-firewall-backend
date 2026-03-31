const User = require("../models/user");
const { markExpiredSubscriptionForUser } = require("../utils/subscriptionState");
const { removeWireGuardPeer } = require("./gatewaySshService");

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const expireSubscriptions = async () => {
  const now = new Date();
  const users = await User.find({
    $or: [
      {
        "subscription.isActive": true,
        "subscription.validUntil": { $lt: now },
      },
      {
        "subscription.status": "expired",
        "vpn.publicKey": { $exists: true, $ne: null },
        "vpn.status": { $ne: "revoked" },
      },
    ],
  });

  let expiredCount = 0;

  for (const user of users) {
    try {
      if (user.vpn?.publicKey) {
        await removeWireGuardPeer(user.vpn.publicKey);
        user.vpn.status = "revoked";
        user.vpn.lastDeprovisionedAt = now;
      }

      const changed = markExpiredSubscriptionForUser(user, now);

      if (changed || user.isModified("vpn")) {
        await user.save();
        expiredCount += 1;
      }
    } catch (error) {
      console.error(
        `Failed to deprovision expired user ${user._id}:`,
        error.message
      );
    }
  }

  if (expiredCount > 0) {
    console.log(`Subscription expiry job updated ${expiredCount} user(s).`);
  }

  return expiredCount;
};

const startSubscriptionExpiryJob = () => {
  expireSubscriptions().catch((error) => {
    console.error("Initial subscription expiry job failed:", error.message);
  });

  const timer = setInterval(() => {
    expireSubscriptions().catch((error) => {
      console.error("Scheduled subscription expiry job failed:", error.message);
    });
  }, ONE_DAY_MS);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  return timer;
};

module.exports = {
  expireSubscriptions,
  startSubscriptionExpiryJob,
};
