# Frontend API

Base URL:

```text
https://ai-firewall-backend-dani-d3v8671-ooua5n91.leapcell.dev
```

Common headers:

```http
Content-Type: application/json
Authorization: Bearer <token>
```

Notes:

- Only protected routes need the `Authorization` header.
- All successful responses follow this shape:

```json
{
  "success": true,
  "data": {},
  "message": "optional"
}
```

- Error responses follow this shape:

```json
{
  "success": false,
  "message": "Error message"
}
```

- Subscription access is controlled by `subscription.isActive === true`.
- The product catalog is limited to three BRADSafe duration tiers:
  - 1 Month
  - 6 Months
  - 12 Months

## 1. Auth

### 1.1 Request registration OTP

Endpoint:

```http
POST /api/auth/register/request-otp
```

Headers:

```http
Content-Type: application/json
```

Body:

```json
{
  "name": "Daniel",
  "email": "daniel@example.com",
  "password": "secret123"
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "email": "daniel@example.com",
    "expiresAt": "2026-03-24T12:00:00.000Z"
  },
  "message": "OTP sent to email"
}
```

### 1.2 Register with OTP

Endpoint:

```http
POST /api/auth/register
```

Headers:

```http
Content-Type: application/json
```

Body:

```json
{
  "email": "daniel@example.com",
  "otp": "123456"
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "_id": "USER_ID",
    "name": "Daniel",
    "email": "daniel@example.com",
    "token": "JWT_TOKEN",
    "tokenExpiresAt": "2026-03-31T12:00:00.000Z"
  }
}
```

### 1.3 Login

Endpoint:

```http
POST /api/auth/login
```

Headers:

```http
Content-Type: application/json
```

Body:

```json
{
  "email": "daniel@example.com",
  "password": "secret123"
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "_id": "USER_ID",
    "name": "Daniel",
    "email": "daniel@example.com",
    "token": "JWT_TOKEN",
    "tokenExpiresAt": "2026-03-31T12:00:00.000Z"
  }
}
```

### 1.4 Forgot password

Endpoint:

```http
POST /api/auth/forgot-password
```

Headers:

```http
Content-Type: application/json
```

Body:

```json
{
  "email": "daniel@example.com"
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "email": "daniel@example.com",
    "expiresAt": "2026-03-24T12:00:00.000Z"
  },
  "message": "If an account exists, a reset OTP has been sent"
}
```

### 1.5 Reset password

Endpoint:

```http
POST /api/auth/reset-password
```

Headers:

```http
Content-Type: application/json
```

Body:

```json
{
  "email": "daniel@example.com",
  "otp": "123456",
  "password": "newSecret123"
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "_id": "USER_ID",
    "email": "daniel@example.com"
  },
  "message": "Password reset successful"
}
```

## 2. User

### 2.1 Get profile

Endpoint:

```http
GET /api/users/profile
```

Headers:

```http
Authorization: Bearer <token>
```

Success response:

```json
{
  "success": true,
  "data": {
    "_id": "USER_ID",
    "name": "Daniel",
    "email": "daniel@example.com",
    "role": "user",
    "subscription": {
      "planId": "PLAN_ID",
      "plan": "BRADSafe Autonomous - 1 Month",
      "price": 9.99,
      "status": "active",
      "startDate": "2026-03-25T12:00:00.000Z",
      "endDate": "2026-04-24T12:00:00.000Z",
      "transactionId": "SIM-1234567890-ABCDEFGH",
      "validUntil": "2026-04-24T12:00:00.000Z",
      "isActive": true
    },
    "vpn": {
      "publicKey": "USER_WIREGUARD_PUBKEY",
      "assignedIp": "10.0.0.12/32",
      "status": "active",
      "lastProvisionedAt": "2026-03-25T12:00:00.000Z"
    },
    "createdAt": "2026-03-24T10:00:00.000Z",
    "updatedAt": "2026-03-25T12:00:00.000Z"
  }
}
```

## 3. Dashboard

### 3.1 Get dashboard summary

Endpoint:

```http
GET /api/dashboard
```

Headers:

```http
Authorization: Bearer <token>
```

Success response:

```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "USER_ID",
      "name": "Daniel",
      "email": "daniel@example.com",
      "role": "user"
    },
    "subscription": {
      "planId": "PLAN_ID",
      "plan": "BRADSafe Autonomous - 1 Month",
      "price": 9.99,
      "status": "active",
      "startDate": "2026-03-25T12:00:00.000Z",
      "endDate": "2026-04-24T12:00:00.000Z",
      "transactionId": "SIM-1234567890-ABCDEFGH",
      "validUntil": "2026-04-24T12:00:00.000Z",
      "isActive": true
    },
    "vpn": {
      "publicKey": "USER_WIREGUARD_PUBKEY",
      "assignedIp": "10.0.0.12/32",
      "status": "active",
      "lastProvisionedAt": "2026-03-25T12:00:00.000Z"
    },
    "recentAlerts": [],
    "subscriptionHistoryCount": 0
  }
}
```

### 3.2 Stream live dashboard alerts

Endpoint:

```http
GET /api/dashboard/stream
```

Headers:

```http
Authorization: Bearer <token>
```

Notes:

- This is a Server-Sent Events stream.
- The backend sends an initial `connected` event.
- Listen for the `alert` event to show live AI mitigation notifications.

Example `alert` event payload:

```json
{
  "_id": "ALERT_ID",
  "message": "AI Shield Active: A DDoS attack from 198.51.100.24 was just mitigated for your connection.",
  "attackerIp": "198.51.100.24",
  "victimVpnIp": "10.0.0.12/32",
  "mitigatedAt": "2026-03-25T12:00:00.000Z"
}
```

## 4. Subscriptions

### 4.1 Get all plans

Endpoint:

```http
GET /api/subscriptions
```

Headers:

```http
Content-Type: application/json
```

Notes:

- Returns the three BRADSafe tiers only.

Example response:

```json
{
  "success": true,
  "data": [
    {
      "_id": "PLAN_ID_1M",
      "name": "BRADSafe Autonomous - 1 Month",
      "price": 9.99,
      "duration": 30,
      "features": ["VPN Access", "Download Config", "AI Shield"]
    },
    {
      "_id": "PLAN_ID_6M",
      "name": "BRADSafe Autonomous - 6 Months",
      "price": 49.99,
      "duration": 180,
      "features": ["VPN Access", "Download Config", "AI Shield"]
    },
    {
      "_id": "PLAN_ID_12M",
      "name": "BRADSafe Autonomous - 12 Months",
      "price": 89.99,
      "duration": 365,
      "features": ["VPN Access", "Download Config", "AI Shield"]
    }
  ]
}
```

### 4.2 Simulate payment

Endpoint:

```http
POST /api/subscriptions/simulate-payment
```

Headers:

```http
Authorization: Bearer <token>
Content-Type: application/json
```

Body:

```json
{
  "planId": "PLAN_ID",
  "paymentMethod": "telebirr"
}
```

Success response:

```json
{
  "success": true,
  "data": {
    "_id": "PAYMENT_ID",
    "userId": "USER_ID",
    "planId": "PLAN_ID",
    "transactionId": "SIM-1234567890-ABCDEFGH",
    "amount": 9.99,
    "currency": "USD",
    "paymentMethod": "telebirr",
    "status": "completed",
    "simulated": true,
    "paidAt": "2026-03-25T12:00:00.000Z",
    "createdAt": "2026-03-25T12:00:00.000Z",
    "updatedAt": "2026-03-25T12:00:00.000Z"
  }
}
```

### 4.3 Buy plan

Endpoint:

```http
POST /api/subscriptions/buy
```

Headers:

```http
Authorization: Bearer <token>
Content-Type: application/json
```

Body:

```json
{
  "planId": "PLAN_ID",
  "paymentId": "PAYMENT_ID",
  "wireguardPublicKey": "USER_WIREGUARD_PUBKEY"
}
```

Notes:

- `wireguardPublicKey` is required.
- On success, the backend writes `/etc/wireguard/new_peers/user_{userId}.json` on the Gateway VM over SSH.
- The frontend should treat this call as the activation point for VPN access.

Success response:

```json
{
  "success": true,
  "data": {
    "subscription": {
      "planId": "PLAN_ID",
      "plan": "BRADSafe Autonomous - 1 Month",
      "price": 9.99,
      "status": "active",
      "startDate": "2026-03-25T12:00:00.000Z",
      "endDate": "2026-04-24T12:00:00.000Z",
      "transactionId": "SIM-1234567890-ABCDEFGH",
      "validUntil": "2026-04-24T12:00:00.000Z",
      "isActive": true
    },
    "vpn": {
      "isActive": true,
      "status": "active",
      "validUntil": "2026-04-24T12:00:00.000Z",
      "clientConfiguration": {
        "address": "10.0.0.12/32",
        "dns": "1.1.1.1",
        "userPublicKey": "USER_WIREGUARD_PUBKEY"
      },
      "gatewayConfiguration": {
        "hostPublicKey": "GATEWAY_WIREGUARD_PUBLIC_KEY",
        "endpoint": "34.173.88.58:51820",
        "allowedIps": "0.0.0.0/0, ::/0",
        "persistentKeepalive": 25
      }
    }
  }
}
```

### 4.4 Get my current plan

Endpoint:

```http
GET /api/subscriptions/my-plan
```

Headers:

```http
Authorization: Bearer <token>
```

Success response:

```json
{
  "success": true,
  "data": {
    "planId": "PLAN_ID",
    "plan": "BRADSafe Autonomous - 1 Month",
    "price": 9.99,
    "status": "active",
    "startDate": "2026-03-25T12:00:00.000Z",
    "endDate": "2026-04-24T12:00:00.000Z",
    "transactionId": "SIM-1234567890-ABCDEFGH",
    "validUntil": "2026-04-24T12:00:00.000Z",
    "isActive": true
  }
}
```

### 4.5 Get subscription history

Endpoint:

```http
GET /api/subscriptions/history
```

Headers:

```http
Authorization: Bearer <token>
```

Notes:

- Returns `subscriptionHistory` in reverse chronological order.
- At the moment, the backend exposes this array but does not append new history entries during purchase or cancellation, so it may be empty.

Success response:

```json
{
  "success": true,
  "data": []
}
```

### 4.6 Cancel current subscription

Endpoint:

```http
PATCH /api/subscriptions/cancel
```

Headers:

```http
Authorization: Bearer <token>
```

Body:

```json
{}
```

Notes:

- This makes the subscription inactive in the backend immediately.
- The current controller also sets `vpn.status` to `revoked`.

Success response:

```json
{
  "success": true,
  "data": {
    "message": "Subscription cancelled"
  }
}
```

### 4.7 Get VPN access state

Endpoint:

```http
GET /api/subscriptions/vpn-access
```

Headers:

```http
Authorization: Bearer <token>
```

Notes:

- Requires an active subscription.
- Use this endpoint to decide whether "VPN Access" UI should be enabled.

Success response:

```json
{
  "success": true,
  "data": {
    "isActive": true,
    "status": "active",
    "validUntil": "2026-04-24T12:00:00.000Z",
    "clientConfiguration": {
      "address": "10.0.0.12/32",
      "dns": "1.1.1.1",
      "userPublicKey": "USER_WIREGUARD_PUBKEY"
    },
    "gatewayConfiguration": {
      "hostPublicKey": "GATEWAY_WIREGUARD_PUBLIC_KEY",
      "endpoint": "34.173.88.58:51820",
      "allowedIps": "0.0.0.0/0, ::/0",
      "persistentKeepalive": 25
    }
  }
}
```

### 4.8 Download WireGuard config template

Endpoint:

```http
GET /api/subscriptions/download-config
```

Headers:

```http
Authorization: Bearer <token>
```

Notes:

- Requires an active subscription.
- Use this endpoint to decide whether "Download Config" UI should be enabled.
- Response content type is `text/plain`.
- Response is a `.conf` template and still includes `PrivateKey = <YOUR_PRIVATE_KEY>`.
- Response header includes `Content-Disposition: attachment; filename="vectraflow.conf"`.

Example response body:

```ini
[Interface]
PrivateKey = <YOUR_PRIVATE_KEY>
Address = 10.0.0.12/32
DNS = 1.1.1.1

[Peer]
PublicKey = GATEWAY_WIREGUARD_PUBLIC_KEY
Endpoint = 34.173.88.58:51820
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
```

## 5. Admin subscription APIs

### 5.1 Create plan

Endpoint:

```http
POST /api/subscriptions/create
```

Headers:

```http
Authorization: Bearer <admin_token>
Content-Type: application/json
```

Body:

```json
{
  "name": "BRADSafe Autonomous - 1 Month",
  "price": 9.99,
  "duration": 30,
  "features": ["VPN Access", "Download Config", "AI Shield"]
}
```

Notes:

- Only `duration` values `30`, `180`, and `365` are accepted.

### 5.2 Update plan

Endpoint:

```http
PATCH /api/subscriptions/:planId
```

Headers:

```http
Authorization: Bearer <admin_token>
Content-Type: application/json
```

Body:

```json
{
  "name": "BRADSafe Autonomous - 6 Months",
  "price": 49.99,
  "duration": 180,
  "features": ["VPN Access", "Download Config", "AI Shield"]
}
```

### 5.3 Delete plan

Endpoint:

```http
DELETE /api/subscriptions/:planId
```

Headers:

```http
Authorization: Bearer <admin_token>
```

## 6. Gateway webhook

### 6.1 Receive mitigation alert

Endpoint:

```http
POST /api/alerts
```

Headers:

```http
Content-Type: application/json
X-Alert-Secret: <ALERT_WEBHOOK_SECRET>
```

Body:

```json
{
  "victim_vpn_ip": "10.0.0.12",
  "attacker_ip": "198.51.100.24"
}
```

Notes:

- `victim_vpn_ip` may be sent as `10.0.0.12` or `10.0.0.12/32`.
- The backend maps the IP to a user and pushes a live dashboard notification.

Success response:

```json
{
  "success": true,
  "data": {
    "alertId": "ALERT_ID",
    "userId": "USER_ID"
  },
  "message": "Alert received"
}
```

## 7. Frontend flow summary

### Register flow

1. Call `POST /api/auth/register/request-otp`.
2. Ask the user for the 6-digit OTP from email.
3. Call `POST /api/auth/register`.
4. Save the returned `token`.
5. Save the returned `tokenExpiresAt`.

### Login flow

1. Call `POST /api/auth/login`.
2. Save the returned `token`.
3. Save the returned `tokenExpiresAt`.

### Purchase and provisioning flow

1. Call `GET /api/subscriptions` and show only the three BRADSafe tiers.
2. Generate a WireGuard keypair on the client.
3. Call `POST /api/subscriptions/simulate-payment`.
4. Call `POST /api/subscriptions/buy` with `planId`, `paymentId`, and `wireguardPublicKey`.
5. Read the returned `vpn.clientConfiguration` and `vpn.gatewayConfiguration` object for the user-specific tunnel settings and gateway peer details.
6. After success, enable "VPN Access" and "Download Config" because `subscription.isActive` is now `true`.
7. Call `GET /api/subscriptions/download-config` and replace `PrivateKey = <YOUR_PRIVATE_KEY>` locally before importing into WireGuard.

### Live protection flow

1. Open an SSE connection to `GET /api/dashboard/stream` after login.
2. Listen for `alert` events.
3. Show the returned `message` in the user dashboard when mitigation happens.

### Protected requests

For every protected endpoint, send:

```http
Authorization: Bearer <token>
```
