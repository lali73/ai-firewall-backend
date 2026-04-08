const express = require("express");

const {
  getAdminUsers,
  updateUserRole,
  deleteUser,
  getGatewayStatus,
  syncGatewayUser,
  revokeGatewayUser,
  getAdminLogs,
  lookupProtectionProfile,
} = require("../controllers/adminController");
const { protect } = require("../middleware/authMiddleware");
const { isAdmin } = require("../middleware/adminMiddleware");

const router = express.Router();

router.use(protect, isAdmin);

router.get("/users", getAdminUsers);
router.patch("/users/:userId/role", updateUserRole);
router.delete("/users/:userId", deleteUser);
router.get("/gateway/status", getGatewayStatus);
router.get("/protection/lookup", lookupProtectionProfile);
router.post("/gateway/sync/:userId", syncGatewayUser);
router.post("/gateway/revoke/:userId", revokeGatewayUser);
router.get("/logs", getAdminLogs);

module.exports = router;
