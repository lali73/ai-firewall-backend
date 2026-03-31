const express = require("express");
const router = express.Router();

const { getUserProfile, deleteMyAccount } = require("../controllers/userController");
const { protect } = require("../middleware/authMiddleware");
const { syncSubscriptionStatus } = require("../middleware/subscriptionMiddleware");

// Protected route
router.get("/profile", protect, syncSubscriptionStatus, getUserProfile);


module.exports = router;
