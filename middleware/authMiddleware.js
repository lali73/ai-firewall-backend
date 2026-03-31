const jwt = require("jsonwebtoken");
const User = require("../models/user");
const asyncHandler = require("../utils/asyncHandler");

const protect = asyncHandler(async (req, res, next) => {
  let token;

  // Check Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select("-password");
    } catch (error) {
      const authError = new Error("Not authorized, token failed");
      authError.statusCode = 401;
      throw authError;
    }

    if (!req.user) {
      const error = new Error("Not authorized, user not found");
      error.statusCode = 401;
      throw error;
    }

    return next();
  }

  if (!token) {
    const error = new Error("Not authorized, no token");
    error.statusCode = 401;
    throw error;
  }
});

module.exports = { protect };
