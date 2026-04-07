require("dotenv").config();

const { verifyEmailTransport } = require("../services/emailService");

const run = async () => {
  try {
    const config = await verifyEmailTransport();

    console.log("Email provider configuration looks valid.");
    console.log(JSON.stringify(config, null, 2));
    process.exit(0);
  } catch (error) {
    console.error("Email provider verification failed.");
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  }
};

run();
