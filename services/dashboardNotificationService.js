const clientsByUserId = new Map();

const registerDashboardStream = (userId, res) => {
  const key = String(userId);
  const existing = clientsByUserId.get(key) || new Set();
  existing.add(res);
  clientsByUserId.set(key, existing);

  const heartbeat = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 30000);

  if (typeof heartbeat.unref === "function") {
    heartbeat.unref();
  }

  const cleanup = () => {
    clearInterval(heartbeat);
    const clients = clientsByUserId.get(key);

    if (!clients) {
      return;
    }

    clients.delete(res);

    if (clients.size === 0) {
      clientsByUserId.delete(key);
    }
  };

  res.on("close", cleanup);
  res.on("finish", cleanup);
};

const publishUserEvent = (userId, eventName, payload) => {
  const clients = clientsByUserId.get(String(userId));

  if (!clients?.size) {
    return;
  }

  const body = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;

  for (const client of clients) {
    client.write(body);
  }
};

module.exports = {
  publishUserEvent,
  registerDashboardStream,
};
