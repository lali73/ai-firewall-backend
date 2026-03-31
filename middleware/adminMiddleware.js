const admin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    return next();
  }

  const error = new Error("Admin access only");
  error.statusCode = 403;
  return next(error);
};

module.exports = { admin };
