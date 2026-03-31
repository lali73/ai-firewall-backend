const nodemailer = require("nodemailer");

let transporter;

const getTransporter = () => {
  if (transporter) {
    return transporter;
  }

  const requiredVars = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASS",
    "EMAIL_FROM",
  ];

  const missingVars = requiredVars.filter((key) => !process.env[key]?.trim());

  if (missingVars.length > 0) {
    const error = new Error(
      `Missing email configuration: ${missingVars.join(", ")}`
    );
    error.statusCode = 500;
    throw error;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
};

const sendRegistrationOtpEmail = async ({
  email,
  name,
  otp,
  expiresInMinutes,
}) => {
  const mailTransporter = getTransporter();

  await mailTransporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Your registration verification code",
    text: `Hello ${name}, your verification code is ${otp}. It expires in ${expiresInMinutes} minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <p>Hello ${name},</p>
        <p>Use this verification code to finish creating your account:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">${otp}</p>
        <p>This code expires in ${expiresInMinutes} minutes.</p>
      </div>
    `,
  });
};

const sendPasswordResetOtpEmail = async ({
  email,
  name,
  otp,
  expiresInMinutes,
}) => {
  const mailTransporter = getTransporter();

  await mailTransporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Your password reset code",
    text: `Hello ${name}, your password reset code is ${otp}. It expires in ${expiresInMinutes} minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
        <p>Hello ${name},</p>
        <p>Use this verification code to reset your password:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">${otp}</p>
        <p>This code expires in ${expiresInMinutes} minutes.</p>
      </div>
    `,
  });
};

module.exports = { sendRegistrationOtpEmail, sendPasswordResetOtpEmail };
