const mongoose = require("mongoose");

const subscriptionHistorySchema = new mongoose.Schema(
  {
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
    },
    planName: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    duration: {
      type: Number,
      required: true,
    },
    features: [
      {
        type: String,
      },
    ],
    status: {
      type: String,
      enum: ["active", "cancelled", "expired"],
      required: true,
    },
    startedAt: {
      type: Date,
      required: true,
    },
    endedAt: {
      type: Date,
      required: true,
    },
    cancelledAt: Date,
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
    },
    paymentMethod: String,
    paymentStatus: String,
    transactionId: String,
    validUntil: Date,
    isActive: {
      type: Boolean,
      default: false,
    },
  },
  {
    _id: true,
    timestamps: true,
  }
);

const vpnSchema = new mongoose.Schema(
  {
    publicKey: String,
    assignedIp: String,
    status: {
      type: String,
      enum: ["unassigned", "pending", "active", "revoked"],
      default: "unassigned",
    },
    lastProvisionedAt: Date,
    lastDeprovisionedAt: Date,
  },
  {
    _id: false,
  }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
    },

    password: {
      type: String,
      required: true,
    },

    passwordResetTokenHash: String,

    passwordResetExpiresAt: Date,

    passwordResetAttempts: {
      type: Number,
      default: 0,
    },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    subscription: {
      planId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Subscription",
      },
      plan: {
        type: String,
        default: "free",
      },
      price: {
        type: Number,
        default: 0,
      },
      status: {
        type: String,
        enum: ["active", "inactive", "cancelled", "expired"],
        default: "inactive",
      },
      startDate: Date,
      endDate: Date,
      cancelledAt: Date,
      paymentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Payment",
      },
      paymentMethod: String,
      paymentStatus: String,
      transactionId: String,
      validUntil: Date,
      isActive: {
        type: Boolean,
        default: false,
      },
    },
    subscriptionHistory: [subscriptionHistorySchema],
    vpn: {
      type: vpnSchema,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);
