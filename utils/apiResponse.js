const sendSuccess = (res, data, options = {}) => {
  const { statusCode = 200, message } = options;
  const body = {
    success: true,
    data,
  };

  if (message) {
    body.message = message;
  }

  return res.status(statusCode).json(body);
};

module.exports = { sendSuccess };
