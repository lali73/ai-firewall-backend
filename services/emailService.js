const RESEND_API_URL = "https://api.resend.com/emails";

const getEmailConfig = () => {
  const requiredVars = ["RESEND_API_KEY", "EMAIL_FROM"];
  const missingVars = requiredVars.filter((key) => !process.env[key]?.trim());

  if (missingVars.length > 0) {
    const error = new Error(
      `Missing email configuration: ${missingVars.join(", ")}`
    );
    error.statusCode = 500;
    throw error;
  }

  return {
    apiKey: process.env.RESEND_API_KEY.trim(),
    from: process.env.EMAIL_FROM.trim(),
  };
};

const sendEmail = async ({ to, subject, text, html }) => {
  const { apiKey, from } = getEmailConfig();

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      html,
    }),
  });

  const responseText = await response.text();
  let payload;

  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch (error) {
    payload = { message: responseText };
  }

  if (!response.ok) {
    const details =
      payload?.message ||
      payload?.error ||
      payload?.name ||
      `Resend request failed with status ${response.status}`;
    const sendError = new Error(details);
    sendError.statusCode = 502;
    sendError.provider = "resend";
    sendError.providerResponse = payload;
    throw sendError;
  }

  return payload;
};

const sendRegistrationOtpEmail = async ({
  email,
  name,
  otp,
  expiresInMinutes,
}) => {
  await sendEmail({
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
  await sendEmail({
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

const verifyEmailTransport = async () => {
  const { apiKey, from } = getEmailConfig();

  return {
    provider: "resend",
    apiKeyPrefix: apiKey.slice(0, 7),
    from,
  };
};

module.exports = {
  sendRegistrationOtpEmail,
  sendPasswordResetOtpEmail,
  verifyEmailTransport,
};
