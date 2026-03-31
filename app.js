const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const userRoutes = require("./routes/userRoutes");
const subscriptionRoutes = require("./routes/subscriptionRoutes");
const alertsRoutes = require("./routes/alertsRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");
const env = require("./config/env");

const app = express();

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  })
);
app.use(helmet());
app.use(morgan("dev"));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/users", userRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/alerts", alertsRoutes);

// Test Route
app.get("/", (req, res) => {
  res.json({
    success: true,
    data: {
      message: "API is running...",
    },
  });
});

// Not found + global error handlers
app.use(notFound);
app.use(errorHandler);

module.exports = app;
