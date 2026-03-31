const fs = require("fs");
const { Client } = require("ssh2");
const env = require("../config/env");

const PEER_DROP_DIR = "/home/abrahamasrat44/new_peers";
const WG_INTERFACE = "wg0";

const getPrivateKey = () => {
  const envKey = (env.GATEWAY_PRIVATE_KEY || "").trim();
  const keyPath = (env.GATEWAY_PRIVATE_KEY_PATH || "").trim();

  if (keyPath) {
    if (!fs.existsSync(keyPath)) {
      throw new Error(`GATEWAY_PRIVATE_KEY_PATH does not exist: ${keyPath}`);
    }

    return fs.readFileSync(keyPath, "utf8");
  }

  if (!envKey) {
    throw new Error(
      "No SSH private key configured. Set GATEWAY_PRIVATE_KEY or GATEWAY_PRIVATE_KEY_PATH."
    );
  }

  const normalizedEnvKey = envKey.replace(/\\n/g, "\n");
  if (
    normalizedEnvKey.includes("BEGIN OPENSSH PRIVATE KEY") ||
    normalizedEnvKey.includes("BEGIN RSA PRIVATE KEY")
  ) {
    return normalizedEnvKey;
  }

  try {
    const decoded = Buffer.from(envKey, "base64").toString("utf-8");

    if (
      decoded.includes("BEGIN OPENSSH PRIVATE KEY") ||
      decoded.includes("BEGIN RSA PRIVATE KEY")
    ) {
      return decoded;
    }

    return normalizedEnvKey;
  } catch (error) {
    console.error("SSH key decoding failed:", error.message);
    return normalizedEnvKey;
  }
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

const createPeerProvisioningRequest = async ({
  userId,
  publicKey,
  assignedIp,
}) => {
  const payload = JSON.stringify({
    public_key: publicKey,
    assigned_ip: assignedIp,
  });
  const remotePath = `${PEER_DROP_DIR}/user_${userId}.json`;
  const command = `cat <<'EOF' > ${remotePath}\n${payload}\nEOF`;

  console.log(
    `Sending provisioning request for user ${userId} to gateway...`
  );
  await runRemoteCommand(command);

  return remotePath;
};

const removeWireGuardPeer = async (publicKey) => {
  const escapedKey = String(publicKey).replace(/'/g, "'\\''");
  const command = `sudo wg set ${WG_INTERFACE} peer '${escapedKey}' remove`;

  console.log(`Removing expired peer from gateway: ${publicKey}`);
  return runRemoteCommand(command);
};

module.exports = {
  createPeerProvisioningRequest,
  removeWireGuardPeer,
  runRemoteCommand,
};
