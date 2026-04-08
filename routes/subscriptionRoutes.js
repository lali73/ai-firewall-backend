const express = require("express");

const {
  getPlans,
  buyPlan,
  getMyPlan,
  getSubscriptionHistory,
  simulatePayment,
  initializeChapaPayment,
  verifyChapaPayment,
  handleChapaCallback,
  cancelMySubscription,
  getVpnAccess,
  downloadVpnConfig,
  retrySubscriptionGatewaySync,
  createPlan,
  updatePlan,
  deletePlan,
} = require("../controllers/subscriptionController");
const { protect } = require("../middleware/authMiddleware");
const { admin } = require("../middleware/adminMiddleware");
const {
  syncSubscriptionStatus,
  requireActiveSubscription,
} = require("../middleware/subscriptionMiddleware");

const router = express.Router();

router.get("/", getPlans);

router.post("/simulate-payment", protect, syncSubscriptionStatus, simulatePayment);
router.post("/chapa/initialize", protect, syncSubscriptionStatus, initializeChapaPayment);
router.get("/chapa/verify/:txRef", protect, syncSubscriptionStatus, verifyChapaPayment);
router.get("/chapa/callback", handleChapaCallback);
router.post("/buy", protect, syncSubscriptionStatus, buyPlan);
router.patch("/cancel", protect, syncSubscriptionStatus, cancelMySubscription);
router.post("/cancel", protect, syncSubscriptionStatus, cancelMySubscription);
router.get("/my-plan", protect, syncSubscriptionStatus, getMyPlan);
router.get("/history", protect, syncSubscriptionStatus, getSubscriptionHistory);
router.get(
  "/vpn-access",
  protect,
  syncSubscriptionStatus,
  requireActiveSubscription,
  getVpnAccess
);
router.get(
  "/download-config",
  protect,
  syncSubscriptionStatus,
  requireActiveSubscription,
  downloadVpnConfig
);
router.post(
  "/download-config",
  protect,
  syncSubscriptionStatus,
  requireActiveSubscription,
  downloadVpnConfig
);
router.post("/admin/retry-sync/:userId", protect, admin, retrySubscriptionGatewaySync);
router.post("/create", protect, admin, createPlan);
router.patch("/:planId", protect, admin, updatePlan);
router.delete("/:planId", protect, admin, deletePlan);

module.exports = router;
