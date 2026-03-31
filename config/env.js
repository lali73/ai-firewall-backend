require("dotenv").config();

const requiredVars = ["MONGO_URI", "JWT_SECRET"];
const missingVars = requiredVars.filter((key) => !process.env[key]?.trim());

if (missingVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingVars.join(", ")}`
  );
}

const parsedPort = Number.parseInt(process.env.PORT, 10);

module.exports = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number.isInteger(parsedPort) ? parsedPort : 5000,
  CLIENT_URL: process.env.CLIENT_URL || "http://localhost:5173",
  MONGO_URI: process.env.MONGO_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_SECURE: process.env.SMTP_SECURE || "false",
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  EMAIL_FROM: process.env.EMAIL_FROM,
  GATEWAY_HOST: process.env.GATEWAY_HOST || "34.173.88.58",
  GATEWAY_PORT: Number.parseInt(process.env.GATEWAY_PORT || "22", 10),
  GATEWAY_USERNAME: process.env.GATEWAY_USERNAME,
  GATEWAY_PRIVATE_KEY: process.env.GATEWAY_PRIVATE_KEY,
  GATEWAY_PRIVATE_KEY_PATH: process.env.GATEWAY_PRIVATE_KEY_PATH,
  GATEWAY_PUBLIC_IP: process.env.GATEWAY_PUBLIC_IP || process.env.GATEWAY_HOST || "34.173.88.58",
  GATEWAY_WIREGUARD_PUBLIC_KEY: process.env.GATEWAY_WIREGUARD_PUBLIC_KEY,
  GATEWAY_WIREGUARD_PORT: Number.parseInt(
    process.env.GATEWAY_WIREGUARD_PORT || "51820",
    10
  ),
  WIREGUARD_INTERFACE: process.env.WIREGUARD_INTERFACE || "wg0",
  WIREGUARD_NETWORK_PREFIX: process.env.WIREGUARD_NETWORK_PREFIX || "10.0.0",
  WIREGUARD_START_HOST: Number.parseInt(
    process.env.WIREGUARD_START_HOST || "2",
    10
  ),
  WIREGUARD_END_HOST: Number.parseInt(
    process.env.WIREGUARD_END_HOST || "254",
    10
  ),
  WIREGUARD_DNS: process.env.WIREGUARD_DNS || "1.1.1.1",
  WIREGUARD_ALLOWED_IPS:
    process.env.WIREGUARD_ALLOWED_IPS || "0.0.0.0/0, ::/0",
  ALERT_WEBHOOK_SECRET: process.env.ALERT_WEBHOOK_SECRET,
};
