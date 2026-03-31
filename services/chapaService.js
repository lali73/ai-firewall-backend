const https = require("https");

const env = require("../config/env");

const stringifyIfObject = (value) => {
  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return "[unserializable object]";
    }
  }

  return value;
};

const buildError = (message, statusCode, details) => {
  const normalizedMessage =
    typeof message === "string" && message.trim()
      ? message
      : stringifyIfObject(message) || "Chapa request failed.";
  const error = new Error(normalizedMessage);
  error.statusCode = statusCode;
  error.details = details;
  return error;
};

const requestJson = (method, path, payload) =>
  new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : null;
    const url = new URL(path, env.CHAPA_BASE_URL.endsWith("/") ? env.CHAPA_BASE_URL : `${env.CHAPA_BASE_URL}/`);

    const request = https.request(
      url,
      {
        method,
        headers: {
          Authorization: `Bearer ${env.CHAPA_SECRET_KEY}`,
          "Content-Type": "application/json",
          ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
        },
      },
      (response) => {
        let raw = "";

        response.on("data", (chunk) => {
          raw += chunk;
        });

        response.on("end", () => {
          let data = null;
          const normalizedRaw = raw.trim();

          try {
            data = normalizedRaw ? JSON.parse(normalizedRaw) : null;
          } catch (error) {
            if (response.statusCode >= 400) {
              reject(buildError(normalizedRaw || "Chapa request failed.", response.statusCode, normalizedRaw));
              return;
            }

            reject(buildError("Invalid response received from Chapa.", 502, normalizedRaw));
            return;
          }

          if (response.statusCode >= 400) {
            const errorMessage =
              data?.message ||
              data?.error ||
              data?.errors ||
              data ||
              "Chapa request failed.";

            reject(
              buildError(errorMessage, response.statusCode, data)
            );
            return;
          }

          resolve(data);
        });
      }
    );

    request.on("error", (error) => {
      reject(buildError(error.message || "Unable to reach Chapa.", 502));
    });

    request.setTimeout(15000, () => {
      request.destroy(buildError("Chapa request timed out.", 504));
    });

    if (body) {
      request.write(body);
    }

    request.end();
  });

const initializeTransaction = (payload) =>
  requestJson("POST", "transaction/initialize", payload);

const verifyTransaction = (txRef) =>
  requestJson("GET", `transaction/verify/${encodeURIComponent(txRef)}`);

module.exports = {
  initializeTransaction,
  verifyTransaction,
};
