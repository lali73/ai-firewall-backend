const AdminLog = require("../models/AdminLog");

const createAdminLog = async ({
  adminUser,
  action,
  targetUser = null,
  details = {},
}) =>
  AdminLog.create({
    adminId: adminUser._id,
    adminEmail: adminUser.email,
    action,
    targetUserId: targetUser?._id,
    targetUserEmail: targetUser?.email,
    details,
  });

module.exports = { createAdminLog };
