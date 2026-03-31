const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WIREGUARD_PUBLIC_KEY_REGEX = /^[A-Za-z0-9+/]{42,44}={0,2}$/;

const isValidEmail = (email) => EMAIL_REGEX.test(email);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const sanitizeFeatures = (features) => {
  if (!Array.isArray(features)) {
    return [];
  }

  return features
    .filter((feature) => typeof feature === "string")
    .map((feature) => feature.trim())
    .filter(Boolean);
};

const normalizePlanInput = ({ name, price, duration, features }) => ({
  normalizedName: typeof name === "string" ? name.trim() : "",
  normalizedPrice: Number(price),
  normalizedDuration: Number(duration),
  normalizedFeatures: sanitizeFeatures(features),
});

const normalizeWireGuardPublicKey = (value) =>
  typeof value === "string" ? value.trim() : "";

const isValidWireGuardPublicKey = (value) =>
  WIREGUARD_PUBLIC_KEY_REGEX.test(normalizeWireGuardPublicKey(value));

module.exports = {
  escapeRegex,
  isValidEmail,
  isValidWireGuardPublicKey,
  normalizeWireGuardPublicKey,
  sanitizeFeatures,
  normalizePlanInput,
};
