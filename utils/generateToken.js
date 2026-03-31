const jwt = require("jsonwebtoken");

const TOKEN_EXPIRES_IN = "7d";
const TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: TOKEN_EXPIRES_IN,
  });
};

const getTokenExpiresAt = () => new Date(Date.now() + TOKEN_EXPIRY_MS);

module.exports = generateToken;
module.exports.TOKEN_EXPIRES_IN = TOKEN_EXPIRES_IN;
module.exports.getTokenExpiresAt = getTokenExpiresAt;
