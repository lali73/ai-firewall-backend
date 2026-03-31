const markExpiredSubscriptionForUser = (user, now = new Date()) => {
  if (
    user.subscription?.isActive &&
    user.subscription?.validUntil &&
    now > new Date(user.subscription.validUntil)
  ) {
    user.subscription.status = "expired";
    user.subscription.isActive = false;
    user.subscription.validUntil = user.subscription.validUntil;

    const activeHistory = [...(user.subscriptionHistory || [])]
      .reverse()
      .find((entry) => entry.isActive);

    if (activeHistory) {
      activeHistory.status = "expired";
      activeHistory.isActive = false;
      activeHistory.endedAt = user.subscription.validUntil;
      activeHistory.validUntil = user.subscription.validUntil;
    }

    return true;
  }

  return false;
};

module.exports = { markExpiredSubscriptionForUser };
