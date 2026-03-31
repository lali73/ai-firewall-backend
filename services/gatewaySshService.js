const fs = require("fs");
const { Client } = require("ssh2");
const env = require("../config/env");

// Update this line at the top of your gatewaySshService.js
const PEER_DROP_DIR = "/home/abrahamasrat44/new_peers";
const WG_INTERFACE = "wg0"; // Matches your Gateway setup

/**
 * Decodes and formats the Private Key for the ssh2 library.
 * Handles Base64, flattened strings, and file paths.
 */
const getPrivateKey = () => {
  const envKey = (env.GATEWAY_PRIVATE_KEY || "").trim();

  if (!envKey) {
    throw new Error("GATEWAY_PRIVATE_KEY is missing in Leapcell Env.");
  }

  // FORCE DECODE: Treat the env variable as a Base64 blob
  // This ignores all formatting issues and restores the original file
  try {
    const decoded = Buffer.from(envKey, "base64").toString("utf-8");
    
    // Safety check: Does it look like a key now?
    if (decoded.includes("BEGIN OPENSSH PRIVATE KEY")) {
      return decoded;
    }
    
    // Fallback: If it's already plain text, return it
    return envKey;
  } catch (err) {
    console.error("❌ Key decoding failed:", err.message);
    return envKey;
  }
};

/**
 * Executes a command on the Remote Gateway VM via SSH
 */
const runRemoteCommand = (command) =>
  new Promise((resolve, reject) => {
    const client = new Client();
    
    // Use the variable names exactly as defined in your env config
    const connectionConfig = {
      host: env.GATEWAY_HOST,
      port: parseInt(env.GATEWAY_PORT) || 22,
      username: env.GATEWAY_USERNAME || "abrahamasrat44",
      privateKey: getPrivateKey(),
      readyTimeout: 20000,
    };

    client
      .on("ready", () => {
        client.exec(command, (error, stream) => {
          if (error) {
            client.end();
            return reject(error);
          }

          let stdout = "";
          let stderr = "";

          stream
            .on("close", (code) => {
              client.end();
              if (code === 0) {
                resolve({ stdout, stderr });
              } else {
                reject(new Error(stderr.trim() || `Remote command failed (code ${code})`));
              }
            })
            .on("data", (data) => {
              stdout += data.toString();
            });

          stream.stderr.on("data", (data) => {
            stderr += data.toString();
          });
        });
      })
      .on("error", (err) => {
        console.error("❌ SSH Connection Error:", err.message);
        reject(err);
      })
      .connect(connectionConfig);
  });

/**
 * Provisions a new WireGuard peer by writing a JSON file to the Gateway
 */
const createPeerProvisioningRequest = async ({ userId, publicKey, assignedIp }) => {
  const payload = JSON.stringify({
    public_key: publicKey,
    assigned_ip: assignedIp,
  });

  // Target the specific file inside the folder you already gave permissions to
  const remotePath = `${PEER_DROP_DIR}/user_${userId}.json`;

  // REMOVED 'mkdir -p /etc/wireguard' because it triggers permission errors.
  // We only 'cat' the file now since the directory is already created.
 const command = `cat <<'EOF' > ${remotePath}\n${payload}\nEOF`;

  console.log(`📡 Sending provisioning request for User ${userId} to Gateway...`);
  await runRemoteCommand(command);
  
  return remotePath;
};

/**
 * Removes a WireGuard peer from the live interface
 */
const removeWireGuardPeer = async (publicKey) => {
  // Escaping the key to prevent command injection
  const escapedKey = String(publicKey).replace(/'/g, "'\\''");
  const command = `sudo wg set ${WG_INTERFACE} peer '${escapedKey}' remove`;
  
  console.log(`🗑️ Removing expired peer from Gateway: ${publicKey}`);
  return runRemoteCommand(command);
};

module.exports = {
  createPeerProvisioningRequest,
  removeWireGuardPeer,
  runRemoteCommand,
};