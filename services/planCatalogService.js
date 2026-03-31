const Subscription = require("../models/Subscription");

const DEFAULT_PLAN_FEATURES = ["VPN Access", "Download Config", "AI Shield"];

const DEFAULT_PLANS = [
  {
    name: "BRADSafe Autonomous - 1 Month",
    price: 9.99,
    duration: 30,
    features: DEFAULT_PLAN_FEATURES,
  },
  {
    name: "BRADSafe Autonomous - 6 Months",
    price: 49.99,
    duration: 180,
    features: DEFAULT_PLAN_FEATURES,
  },
  {
    name: "BRADSafe Autonomous - 12 Months",
    price: 89.99,
    duration: 365,
    features: DEFAULT_PLAN_FEATURES,
  },
];

const syncDefaultPlans = async () => {
  for (const plan of DEFAULT_PLANS) {
    await Subscription.findOneAndUpdate(
      { duration: plan.duration },
      plan,
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );
  }

  await Subscription.deleteMany({
    duration: { $nin: DEFAULT_PLANS.map((plan) => plan.duration) },
  });
};

module.exports = {
  DEFAULT_PLANS,
  syncDefaultPlans,
};
