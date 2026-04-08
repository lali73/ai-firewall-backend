const app = require("./app");  // your app is imported
const connectDB = require("./config/db");
const env = require("./config/env");
const { startSubscriptionExpiryJob } = require("./services/subscriptionExpiryService");
const { syncDefaultPlans } = require("./services/planCatalogService");
const User = require("./models/user");
const {
  backfillProtectionProfilesFromUsers,
} = require("./services/protectionProfileService");

const startListening = () =>
  new Promise((resolve, reject) => {
    const server = app.listen(env.PORT, () => {
      console.log(`Server running on port ${env.PORT}`);
      resolve(server);
    });

    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        reject(
          new Error(
            `Port ${env.PORT} is already in use. Stop the existing backend process before restarting.`
          )
        );
        return;
      }

      reject(error);
    });
  });

const startServer = async () => {
  await connectDB();
  await syncDefaultPlans();
  await backfillProtectionProfilesFromUsers(User);
  startSubscriptionExpiryJob();
  await startListening();
};

startServer().catch((error) => {
  console.error("Failed to start server:", error.message);
  process.exit(1);
});
