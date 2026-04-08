const fs = require("fs");
const { Client } = require("ssh2");
const env = require("../config/env");

const WG_INTERFACE = env.WIREGUARD_INTERFACE || "wg0";
const isStrictHostKeyCheckingEnabled =
  String(env.GATEWAY_STRICT_HOST_KEY_CHECKING || "true").toLowerCase() !==
  "false";

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
const decodeBase64KeyToBuffer = (value) => {
  const decodedBuffer = Buffer.from(String(value || "").trim(), "base64");
  const decodedText = decodedBuffer.toString("utf-8");

  if (!isSupportedPrivateKey(decodedText)) {
    throw new Error("Decoded value is not a supported OpenSSH private key.");
  }

  return decodedBuffer;
};

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

  if (envKey) {
    try {
      return decodeBase64KeyToBuffer(envKey);
    } catch (error) {
      console.error(
        "SSH key decoding failed for GATEWAY_PRIVATE_KEY:",
        error.message
      );
    }
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
      return decodeBase64KeyToBuffer(envKeyBase64);
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

    if (!isStrictHostKeyCheckingEnabled) {
      connectionConfig.hostVerifier = () => true;
    }

    client
      .on("end", () => {
        console.log("SSH connection ended by remote host.");
      })
      .on("close", (hadError) => {
        console.log(`SSH connection closed. hadError=${Boolean(hadError)}`);
      })
      .on("ready", () => {
        console.log("SSH connection established successfully.");
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
        console.log("SSH client raw error object:", error);
        console.log("SSH client error details:", {
          message: error.message,
          level: error.level,
          code: error.code,
          name: error.name,
        });

        if (
          error.code === "EACCES" ||
          /connect EACCES/i.test(error.message || "")
        ) {
          const networkError = new Error(
            "Gateway SSH connection was blocked before authentication. Port 22 could not be reached from this environment."
          );
          networkError.cause = error;
          console.error("SSH Connection Error:", networkError.message);
          reject(networkError);
          return;
        }

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

const syncProvisionedVpnIp = async (userId, assignedIp) => {
  if (!userId || !assignedIp) {
    return null;
  }

  try {
    const User = require("../models/user");
    const {
      normalizeVpnIp,
      syncProtectionProfileForUser,
    } = require("./protectionProfileService");
    const user = await User.findById(userId);

    if (!user) {
      console.warn(
        `Skipping protection profile sync after gateway provisioning. User not found: ${userId}`
      );
      return null;
    }

    return syncProtectionProfileForUser(user, {
      vpnIp: normalizeVpnIp(assignedIp),
    });
  } catch (error) {
    console.warn(
      `Failed to sync protection profile after gateway provisioning for user ${userId}: ${error.message}`
    );
    return null;
  }
};

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
  await syncProvisionedVpnIp(userId, assignedIp);
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
