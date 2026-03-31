const express = require("express");

const {
  getDashboardSummary,
  streamDashboardAlerts,
} = require("../controllers/dashboardController");
const { protect } = require("../middleware/authMiddleware");
const { syncSubscriptionStatus } = require("../middleware/subscriptionMiddleware");

const router = express.Router();

router.get("/", protect, syncSubscriptionStatus, getDashboardSummary);
router.get("/stream", protect, syncSubscriptionStatus, streamDashboardAlerts);

module.exports = router;
