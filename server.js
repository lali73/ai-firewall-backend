const app = require("./app");  // your app is imported
const connectDB = require("./config/db");
const env = require("./config/env");
const { startSubscriptionExpiryJob } = require("./services/subscriptionExpiryService");
const { syncDefaultPlans } = require("./services/planCatalogService");

const startServer = async () => {
  await connectDB();
  await syncDefaultPlans();
  startSubscriptionExpiryJob();

  app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`);
  });
};

startServer().catch((error) => {
  console.error("Failed to start server:", error.message);
  process.exit(1);
});
