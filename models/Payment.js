const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "USD",
    },
    paymentMethod: {
      type: String,
      required: true,
    },
    provider: {
      type: String,
      enum: ["simulated", "chapa"],
      default: "simulated",
    },
    status: {
      type: String,
      enum: ["pending", "completed", "used", "failed"],
      default: "completed",
    },
    simulated: {
      type: Boolean,
      default: true,
    },
    transactionId: {
      type: String,
      required: true,
      unique: true,
    },
    paidAt: {
      type: Date,
      default: Date.now,
    },
    chapa: {
      checkoutUrl: String,
      referenceId: String,
      callbackStatus: String,
      verifiedAt: Date,
      rawVerification: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Payment", paymentSchema);
