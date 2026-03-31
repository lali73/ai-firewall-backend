const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const User = require("../models/user");
const PendingRegistration = require("../models/pendingRegistration");
const generateToken = require("../utils/generateToken");
const { getTokenExpiresAt } = require("../utils/generateToken");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const { isValidEmail } = require("../utils/validation");
const {
  sendRegistrationOtpEmail,
  sendPasswordResetOtpEmail,
} = require("../services/emailService");

const OTP_EXPIRY_MINUTES = 10;

const buildAuthPayload = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  token: generateToken(user._id),
  tokenExpiresAt: getTokenExpiresAt(),
});

const hashOtp = (otp) =>
  crypto.createHash("sha256").update(String(otp)).digest("hex");

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const validateEmailInput = (email) => {
  if (typeof email !== "string") {
    const error = new Error("Email is required");
    error.statusCode = 400;
    throw error;
  }

  const normalizedEmail = email.toLowerCase().trim();

  if (!normalizedEmail) {
    const error = new Error("Email is required");
    error.statusCode = 400;
    throw error;
  }

  if (!isValidEmail(normalizedEmail)) {
    const error = new Error("Please provide a valid email address");
    error.statusCode = 400;
    throw error;
  }

  return normalizedEmail;
};

exports.requestRegistrationOtp = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string"
  ) {
    const error = new Error("Name, email, and password are required");
    error.statusCode = 400;
    throw error;
  }

  const trimmedName = name.trim();
  const normalizedEmail = email.toLowerCase().trim();

  if (!trimmedName || !normalizedEmail || !password) {
    const error = new Error("Name, email, and password are required");
    error.statusCode = 400;
    throw error;
  }

  if (!isValidEmail(normalizedEmail)) {
    const error = new Error("Please provide a valid email address");
    error.statusCode = 400;
    throw error;
  }

  if (password.length < 6) {
    const error = new Error("Password must be at least 6 characters long");
    error.statusCode = 400;
    throw error;
  }

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    const error = new Error("User already exists");
    error.statusCode = 400;
    throw error;
  }

  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const passwordHash = await bcrypt.hash(password, 10);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await PendingRegistration.findOneAndUpdate(
    { email: normalizedEmail },
    {
      name: trimmedName,
      email: normalizedEmail,
      password: passwordHash,
      otpHash,
      expiresAt,
      otpAttempts: 0,
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  await sendRegistrationOtpEmail({
    email: normalizedEmail,
    name: trimmedName,
    otp,
    expiresInMinutes: OTP_EXPIRY_MINUTES,
  });

  return sendSuccess(
    res,
    {
      email: normalizedEmail,
      expiresAt,
    },
    {
      message: "OTP sent to email",
    }
  );
});

exports.registerUser = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (typeof email !== "string" || typeof otp !== "string") {
    const error = new Error("Email and OTP are required");
    error.statusCode = 400;
    throw error;
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedOtp = otp.trim();

  if (!normalizedEmail || !normalizedOtp) {
    const error = new Error("Email and OTP are required");
    error.statusCode = 400;
    throw error;
  }

  if (!isValidEmail(normalizedEmail)) {
    const error = new Error("Please provide a valid email address");
    error.statusCode = 400;
    throw error;
  }

  if (!/^\d{6}$/.test(normalizedOtp)) {
    const error = new Error("OTP must be a 6-digit code");
    error.statusCode = 400;
    throw error;
  }

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    const error = new Error("User already exists");
    error.statusCode = 400;
    throw error;
  }

  const pendingRegistration = await PendingRegistration.findOne({
    email: normalizedEmail,
  });

  if (!pendingRegistration) {
    const error = new Error("No pending registration found for this email");
    error.statusCode = 404;
    throw error;
  }

  if (pendingRegistration.expiresAt.getTime() < Date.now()) {
    await PendingRegistration.deleteOne({ _id: pendingRegistration._id });
    const error = new Error("OTP has expired. Please request a new one");
    error.statusCode = 400;
    throw error;
  }

  const isOtpValid = pendingRegistration.otpHash === hashOtp(normalizedOtp);

  if (!isOtpValid) {
    pendingRegistration.otpAttempts += 1;

    if (pendingRegistration.otpAttempts >= 5) {
      await PendingRegistration.deleteOne({ _id: pendingRegistration._id });
      const error = new Error(
        "Too many invalid OTP attempts. Please request a new one"
      );
      error.statusCode = 400;
      throw error;
    }

    await pendingRegistration.save();
    const error = new Error("Invalid OTP");
    error.statusCode = 400;
    throw error;
  }

  const user = await User.create({
    name: pendingRegistration.name,
    email: pendingRegistration.email,
    password: pendingRegistration.password,
  });

  await PendingRegistration.deleteOne({ _id: pendingRegistration._id });

  return sendSuccess(res, buildAuthPayload(user), { statusCode: 201 });
});

exports.loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (typeof email !== "string" || typeof password !== "string") {
    const error = new Error("Email and password are required");
    error.statusCode = 400;
    throw error;
  }

  const normalizedEmail = email.toLowerCase().trim();

  if (!normalizedEmail || !password) {
    const error = new Error("Email and password are required");
    error.statusCode = 400;
    throw error;
  }

  if (!isValidEmail(normalizedEmail)) {
    const error = new Error("Please provide a valid email address");
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findOne({ email: normalizedEmail });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    throw error;
  }

  return sendSuccess(res, buildAuthPayload(user));
});

exports.forgotPassword = asyncHandler(async (req, res) => {
  const normalizedEmail = validateEmailInput(req.body.email);
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    return sendSuccess(
      res,
      { email: normalizedEmail },
      { message: "If an account exists, a reset OTP has been sent" }
    );
  }

  const otp = generateOtp();

  user.passwordResetTokenHash = hashOtp(otp);
  user.passwordResetExpiresAt = new Date(
    Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000
  );
  user.passwordResetAttempts = 0;

  await user.save();

  await sendPasswordResetOtpEmail({
    email: user.email,
    name: user.name,
    otp,
    expiresInMinutes: OTP_EXPIRY_MINUTES,
  });

  return sendSuccess(
    res,
    {
      email: normalizedEmail,
      expiresAt: user.passwordResetExpiresAt,
    },
    { message: "If an account exists, a reset OTP has been sent" }
  );
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, password } = req.body;
  const normalizedEmail = validateEmailInput(email);
  const normalizedOtp = typeof otp === "string" ? otp.trim() : "";

  if (!normalizedOtp || typeof password !== "string" || !password) {
    const error = new Error("Email, OTP, and new password are required");
    error.statusCode = 400;
    throw error;
  }

  if (!/^\d{6}$/.test(normalizedOtp)) {
    const error = new Error("OTP must be a 6-digit code");
    error.statusCode = 400;
    throw error;
  }

  if (password.length < 6) {
    const error = new Error("Password must be at least 6 characters long");
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findOne({ email: normalizedEmail });

  if (!user || !user.passwordResetTokenHash || !user.passwordResetExpiresAt) {
    const error = new Error("Invalid or expired reset request");
    error.statusCode = 400;
    throw error;
  }

  if (user.passwordResetExpiresAt.getTime() < Date.now()) {
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;
    user.passwordResetAttempts = 0;
    await user.save();

    const error = new Error("Reset OTP has expired. Please request a new one");
    error.statusCode = 400;
    throw error;
  }

  if (user.passwordResetTokenHash !== hashOtp(normalizedOtp)) {
    user.passwordResetAttempts += 1;

    if (user.passwordResetAttempts >= 5) {
      user.passwordResetTokenHash = undefined;
      user.passwordResetExpiresAt = undefined;
      user.passwordResetAttempts = 0;
      await user.save();

      const error = new Error(
        "Too many invalid OTP attempts. Please request a new one"
      );
      error.statusCode = 400;
      throw error;
    }

    await user.save();

    const error = new Error("Invalid OTP");
    error.statusCode = 400;
    throw error;
  }

  user.password = await bcrypt.hash(password, 10);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  user.passwordResetAttempts = 0;

  await user.save();

  return sendSuccess(
    res,
    {
      email: user.email,
    },
    { message: "Password reset successful" }
  );
});
