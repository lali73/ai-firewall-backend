const Payment = require("../models/Payment");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const User = require("../models/user");

exports.getUserProfile = asyncHandler(async (req, res) => sendSuccess(res, req.user));


