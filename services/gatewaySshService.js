const fs = require("fs");
const { Client } = require("ssh2");
const env = require("../config/env");

const WG_INTERFACE = env.WIREGUARD_INTERFACE || "wg0";

const escapeShellValue = (value) => String(value).replace(/'/g, "'\\''");
const normalizeAllowedIp = (assignedIp) =>
  String(assignedIp).includes("/") ? String(assignedIp) : `${assignedIp}/32`;
const isSupportedPrivateKey = (value) =>
  typeof value === "string" &&
  (value.includes("BEGIN OPENSSH PRIVATE KEY") ||
    value.includes("BEGIN RSA PRIVATE KEY"));
const isPlaceholderValue = (value) =>
  typeof value === "string" &&
  value.trim().toLowerCase() === "base64-encoded-openssh-private-key";

const getPrivateKey = () => {
  const envKey = (env.GATEWAY_PRIVATE_KEY || "").trim();
  const envKeyBase64 = (env.GATEWAY_PRIVATE_KEY_BASE64 || "").trim();
  const keyPath = (env.GATEWAY_PRIVATE_KEY_PATH || "").trim();

  if (keyPath) {
    if (!fs.existsSync(keyPath)) {
      throw new Error(`GATEWAY_PRIVATE_KEY_PATH does not exist: ${keyPath}`);
    }

    return fs.readFileSync(keyPath, "utf8");
  }

  if (!envKey && !envKeyBase64) {
    throw new Error(
      "No SSH private key configured. Set GATEWAY_PRIVATE_KEY_BASE64, GATEWAY_PRIVATE_KEY, or GATEWAY_PRIVATE_KEY_PATH."
    );
  }

  const normalizedEnvKey = envKey.replace(/\\n/g, "\n");
  if (isSupportedPrivateKey(normalizedEnvKey)) {
    return normalizedEnvKey;
  }

  try {
    const decoded = Buffer.from(envKey, "base64").toString("utf-8");

    if (isSupportedPrivateKey(decoded)) {
      return decoded;
    }
  } catch (error) {
    console.error("SSH key decoding failed for GATEWAY_PRIVATE_KEY:", error.message);
  }

  if (envKeyBase64 && !isPlaceholderValue(envKeyBase64)) {
    try {
      const decoded = Buffer.from(envKeyBase64, "base64").toString("utf-8");

      if (isSupportedPrivateKey(decoded)) {
        return decoded;
      }

      throw new Error(
        "GATEWAY_PRIVATE_KEY_BASE64 did not decode into a supported private key."
      );
    } catch (error) {
      throw new Error(
        `Invalid GATEWAY_PRIVATE_KEY_BASE64 configuration: ${error.message}`
      );
    }
  }

  if (envKey) {
    return normalizedEnvKey;
  }

  throw new Error(
    "No supported SSH private key could be derived from GATEWAY_PRIVATE_KEY or GATEWAY_PRIVATE_KEY_BASE64."
  );
};

const runRemoteCommand = (command) =>
  new Promise((resolve, reject) => {
    const client = new Client();
    const connectionConfig = {
      host: env.GATEWAY_HOST,
      port: Number.parseInt(env.GATEWAY_PORT, 10) || 22,
      username: env.GATEWAY_USERNAME || "abrahamasrat44",
      privateKey: getPrivateKey(),
      readyTimeout: 20000,
    };

    client
      .on("ready", () => {
        client.exec(command, (error, stream) => {
          if (error) {
            client.end();
            reject(error);
            return;
          }

          let stdout = "";
          let stderr = "";

          stream
            .on("close", (code) => {
              client.end();
              if (code === 0) {
                resolve({ stdout, stderr });
                return;
              }

              reject(
                new Error(stderr.trim() || `Remote command failed (code ${code})`)
              );
            })
            .on("data", (data) => {
              stdout += data.toString();
            });

          stream.stderr.on("data", (data) => {
            stderr += data.toString();
          });
        });
      })
      .on("error", (error) => {
        if (error.message === "All configured authentication methods failed") {
          const authError = new Error(
            "Gateway SSH authentication failed. Check GATEWAY_USERNAME and the configured private key."
          );
          authError.cause = error;
          console.error("SSH Connection Error:", authError.message);
          reject(authError);
          return;
        }

        console.error("SSH Connection Error:", error.message);
        reject(error);
      })
      .connect(connectionConfig);
  });

const addWireGuardPeer = async (publicKey, assignedIp) => {
  const escapedKey = escapeShellValue(publicKey);
  const escapedIp = escapeShellValue(normalizeAllowedIp(assignedIp));
  const command = `sudo wg set ${WG_INTERFACE} peer '${escapedKey}' allowed-ips '${escapedIp}'`;

  console.log(`Adding peer ${publicKey} to gateway ${WG_INTERFACE}...`);
  return runRemoteCommand(command);
};

const createPeerProvisioningRequest = async ({
  userId,
  publicKey,
  assignedIp,
}) => {
  await addWireGuardPeer(publicKey, assignedIp);
  return `${WG_INTERFACE}:${userId}`;
};

const removeWireGuardPeer = async (publicKey) => {
  const escapedKey = escapeShellValue(publicKey);
  const command = `sudo wg set ${WG_INTERFACE} peer '${escapedKey}' remove`;

  console.log(`Removing expired peer from gateway: ${publicKey}`);
  return runRemoteCommand(command);
};

module.exports = {
  addWireGuardPeer,
  createPeerProvisioningRequest,
  removeWireGuardPeer,
  runRemoteCommand,
};
