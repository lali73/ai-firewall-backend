require("dotenv").config();

const fs = require("fs");
const { execFileSync } = require("child_process");
const { Client } = require("ssh2");

const isSupportedPrivateKey = (value) =>
  typeof value === "string" &&
  (value.includes("BEGIN OPENSSH PRIVATE KEY") ||
    value.includes("BEGIN RSA PRIVATE KEY"));

const decodeBase64KeyToBuffer = (value) => {
  const decodedBuffer = Buffer.from(String(value || "").trim(), "base64");
  const decodedText = decodedBuffer.toString("utf-8");

  if (!isSupportedPrivateKey(decodedText)) {
    throw new Error("Decoded value is not a supported OpenSSH private key.");
  }

  return decodedBuffer;
};

const getPrivateKey = () => {
  const envKey = (process.env.GATEWAY_PRIVATE_KEY || "").trim();
  const envKeyBase64 = (process.env.GATEWAY_PRIVATE_KEY_BASE64 || "").trim();
  const keyPath = (process.env.GATEWAY_PRIVATE_KEY_PATH || "").trim();

  if (keyPath) {
    if (!fs.existsSync(keyPath)) {
      throw new Error(`GATEWAY_PRIVATE_KEY_PATH does not exist: ${keyPath}`);
    }

    return fs.readFileSync(keyPath, "utf8");
  }

  if (envKey) {
    try {
      return decodeBase64KeyToBuffer(envKey);
    } catch (error) {
      console.error("Failed to decode GATEWAY_PRIVATE_KEY as base64:", error.message);
    }

    const normalizedEnvKey = envKey.replace(/\\n/g, "\n");
    if (isSupportedPrivateKey(normalizedEnvKey)) {
      return normalizedEnvKey;
    }
  }

  if (envKeyBase64) {
    return decodeBase64KeyToBuffer(envKeyBase64);
  }

  throw new Error(
    "No supported SSH private key found in GATEWAY_PRIVATE_KEY, GATEWAY_PRIVATE_KEY_BASE64, or GATEWAY_PRIVATE_KEY_PATH."
  );
};

const isWindowsAdmin = () => {
  if (process.platform !== "win32") {
    return null;
  }

  try {
    const output = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "[bool](([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))",
      ],
      { encoding: "utf8" }
    );

    return output.trim().toLowerCase() === "true";
  } catch (error) {
    console.error("Failed to detect Windows admin status:", error.message);
    return null;
  }
};

const privateKey = getPrivateKey();
const isStrictHostKeyCheckingEnabled =
  String(process.env.GATEWAY_STRICT_HOST_KEY_CHECKING || "true").toLowerCase() !==
  "false";

const connectionConfig = {
  host: process.env.GATEWAY_HOST,
  port: Number.parseInt(process.env.GATEWAY_PORT || "22", 10),
  username: process.env.GATEWAY_USERNAME || "abrahamasrat44",
  privateKey,
  readyTimeout: 20000,
};

if (!isStrictHostKeyCheckingEnabled) {
  connectionConfig.hostVerifier = () => true;
}

console.log("SSH diagnostic starting...");
console.log("Environment summary:", {
  username: process.env.USERNAME || null,
  isWindowsAdmin: isWindowsAdmin(),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  cwd: process.cwd(),
  gatewayHost: connectionConfig.host,
  gatewayPort: connectionConfig.port,
  gatewayUsername: connectionConfig.username,
  strictHostKeyChecking: isStrictHostKeyCheckingEnabled,
  privateKeyType: Buffer.isBuffer(privateKey) ? "buffer" : typeof privateKey,
});

const client = new Client();

client
  .on("ready", () => {
    console.log("SSH ready event fired. Authentication succeeded.");

    client.exec("echo ssh-ok", (error, stream) => {
      if (error) {
        console.error("SSH exec error:", error);
        client.end();
        process.exitCode = 1;
        return;
      }

      let stdout = "";
      let stderr = "";

      stream
        .on("close", (code, signal) => {
          console.log("SSH exec close:", { code, signal, stdout, stderr });
          client.end();
          process.exitCode = code === 0 ? 0 : 1;
        })
        .on("data", (data) => {
          stdout += data.toString();
        });

      stream.stderr.on("data", (data) => {
        stderr += data.toString();
      });
    });
  })
  .on("end", () => {
    console.log("SSH connection ended.");
  })
  .on("close", (hadError) => {
    console.log("SSH connection closed.", { hadError: Boolean(hadError) });
  })
  .on("error", (error) => {
    console.error("SSH client error object:", error);
    process.exitCode = 1;
  })
  .connect(connectionConfig);
