const Payment = require("../models/Payment");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const User = require("../models/user");
const ProtectionProfile = require("../models/ProtectionProfile");

exports.getUserProfile = asyncHandler(async (req, res) => {
  const protection = await ProtectionProfile.findOne({ userId: req.user._id }).lean();

  return sendSuccess(res, {
    ...req.user.toObject(),
    protection,
  });
});


