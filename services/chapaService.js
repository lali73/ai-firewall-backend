const https = require("https");

const env = require("../config/env");

const buildError = (message, statusCode, details) => {
  const error = new Error(message);
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

          try {
            data = raw ? JSON.parse(raw) : null;
          } catch (error) {
            reject(buildError("Invalid response received from Chapa.", 502, raw));
            return;
          }

          if (response.statusCode >= 400) {
            reject(
              buildError(
                data?.message || "Chapa request failed.",
                response.statusCode,
                data
              )
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
