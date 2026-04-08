# AI Firewall Backend

Express + MongoDB backend for the AI Firewall system. This service handles:

- user authentication with email OTP verification
- password reset with OTP
- subscription and payment flows
- VPN subscription state and WireGuard gateway sync
- dedicated protection-profile mapping between user, peer, gateway, and VPN IP
- gateway heartbeat and attack-event ingestion
- admin operations for users, gateway sync, and audit logs
- dashboard data and real-time alert streaming

## Tech Stack

- Node.js
- Express
- MongoDB + Mongoose
- JWT authentication
- Nodemailer for email OTP delivery
- SSH2 for remote WireGuard gateway management
- Cloudflare Tunnel for temporary public access to a local backend

## What This Project Does

The backend supports a product where users can register, verify their email with an OTP, subscribe to a plan, receive VPN access, and get notified when the security gateway mitigates attacks against their assigned VPN connection.

The backend also supports admin tools for:

- listing users
- changing roles
- syncing a user's WireGuard peer to the remote gateway
- revoking a user's WireGuard peer
- looking up a protection profile by VPN IP, WireGuard key, or gateway peer reference
- viewing recent admin logs
- checking WireGuard gateway status

## Main Features

### Authentication

- `POST /api/auth/register/request-otp`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`

Registration and password reset both use email OTP codes. OTP values are hashed before storage. Pending registration documents expire automatically in MongoDB through a TTL index.

### Dashboard

- `GET /api/dashboard`
- `GET /api/dashboard/stream`

The dashboard summary returns:

- authenticated user info
- subscription info
- VPN info
- protection health and mapping info
- latest alerts
- latest gateway events
- subscription history count

The stream endpoint uses Server-Sent Events (SSE) for live alert updates.

### User

- `GET /api/users/profile`

Returns the authenticated user's profile and subscription-related state.

### Subscriptions and Payments

- `GET /api/subscriptions`
- `POST /api/subscriptions/simulate-payment`
- `POST /api/subscriptions/chapa/initialize`
- `GET /api/subscriptions/chapa/verify/:txRef`
- `GET /api/subscriptions/chapa/callback`
- `POST /api/subscriptions/buy`
- `PATCH /api/subscriptions/cancel`
- `POST /api/subscriptions/cancel`
- `GET /api/subscriptions/my-plan`
- `GET /api/subscriptions/history`
- `GET /api/subscriptions/vpn-access`
- `GET /api/subscriptions/download-config`
- `POST /api/subscriptions/download-config`
- `POST /api/subscriptions/admin/retry-sync/:userId`
- `POST /api/subscriptions/create`
- `PATCH /api/subscriptions/:planId`
- `DELETE /api/subscriptions/:planId`

On startup, the backend seeds three default plans:

- 1 month
- 6 months
- 12 months

Each default plan includes:

- `VPN Access`
- `Download Config`
- `AI Shield`

### Protection Profiles

The backend now keeps a first-class `ProtectionProfile` for every user. This is the gateway-facing record that maps:

- user
- subscription status
- VPN IP
- WireGuard public key
- gateway peer reference
- gateway ID
- provisioning/sync state
- health status and heartbeat state
- latest alert activity

The existing `user.subscription` and `user.vpn` fields still exist, but the protection profile is the explicit mapping layer used for gateway integration and alert resolution.

### VPN Config and QR Code

The backend can return both a WireGuard config string and a QR code Data URI for mobile import.

Routes:

- `GET /api/subscriptions/download-config`
- `POST /api/subscriptions/download-config`

Behavior:

- `POST /api/subscriptions/download-config` is the preferred route for mobile QR imports
- the frontend should send the device-generated WireGuard private key in the request body
- the backend builds the full config text and generates the QR code from that exact string
- if no private key is supplied, the backend returns `400` instead of generating a broken QR code

Example request:

```json
{
  "privateKey": "Z3ywHzo1s4BbgAAuN0C0RSFyNsYtlD2PYgwhhXpJQ5Q="
}
```

Example response:

```json
{
  "success": true,
  "data": {
    "configText": "[Interface]\nPrivateKey = Z3ywHzo1s4BbgAAuN0C0RSFyNsYtlD2PYgwhhXpJQ5Q=\nAddress = 10.0.0.3/32\nDNS = 1.1.1.1\n\n[Peer]\nPublicKey = 1xHJXB33U49imuP1vKk0ZnyXqB/+jjNcrBAbutpzGHQ=\nEndpoint = 34.173.88.58:51820\nAllowedIPs = 0.0.0.0/0, ::/0\nPersistentKeepalive = 25",
    "qrCodeDataUri": "data:image/png;base64,..."
  }
}
```

WireGuard config template used for QR generation:

```ini
[Interface]
PrivateKey = <Client_Private_Key>
Address = <Assigned_IP>/32
DNS = 1.1.1.1

[Peer]
PublicKey = <Server_Public_Key>
Endpoint = <Gateway_Public_IP>:51820
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
```

### Security Gateway Alerts

- `POST /api/alerts`

This is the webhook endpoint the external security gateway calls for heartbeat and attack events.

Expected request behavior:

- include `X-Alert-Secret` header when `ALERT_WEBHOOK_SECRET` is set
- include `event_type` as `heartbeat` or `attack_detected`
- include at least one of `vpn_ip`, `victim_vpn_ip`, `wireguard_public_key`, or `gateway_peer_ref`
- include `detected_at` as an ISO timestamp when available
- optionally include `gateway_id`
- optionally include `attacker_ip`

The backend:

- validates the shared secret
- resolves the matching protection profile
- rejects conflicting identity combinations with `409`
- records gateway events for heartbeat and attack traffic
- creates an alert record for attack events
- updates protection health state
- pushes live dashboard events to the user over SSE
- accepts unknown VPN IP events with `202` and a warning instead of crashing the webhook flow

### Admin

- `GET /api/admin/users`
- `PATCH /api/admin/users/:userId/role`
- `DELETE /api/admin/users/:userId`
- `GET /api/admin/gateway/status`
- `GET /api/admin/protection/lookup`
- `POST /api/admin/protection/register`
- `POST /api/admin/gateway/sync/:userId`
- `POST /api/admin/gateway/revoke/:userId`
- `GET /api/admin/logs`

All admin endpoints require an authenticated admin user.

## Data Model Overview

### User

The user record stores:

- basic identity fields
- hashed password
- role: `user` or `admin`
- current subscription snapshot
- subscription history
- VPN state
- password reset OTP state

VPN state includes:

- `publicKey`
- `assignedIp`
- `status`
- `lastProvisionedAt`
- `lastDeprovisionedAt`
- `lastSyncedAt`
- `lastSyncError`

### Subscription

Subscription plans define:

- plan name
- price
- duration in days
- feature list

### Payment

Payments track:

- user
- plan
- amount
- provider
- payment status
- transaction ID
- optional Chapa verification metadata

### Alert

Alerts store:

- target user
- victim VPN IP
- attacker IP
- human-readable mitigation message
- raw gateway payload
- timestamps

### PendingRegistration

Stores pre-verification registration details and OTP hash until the user completes registration.

### ProtectionProfile

Stores the backend's protection mapping and gateway-facing identity:

- `userId`
- `subscriptionStatus`
- `protectionEnabled`
- `peerStatus`
- `vpnIp`
- `wireguardPublicKey`
- `gatewayPeerRef`
- `gatewayId`
- `isOnline`
- `lastSeen`
- `healthStatus`
- `lastHeartbeatAt`
- `lastEventType`
- `lastEventAt`
- sync timestamps and sync error
- alert count and last alert metadata

### GatewayEvent

Stores machine-oriented gateway event history such as:

- heartbeat events
- attack detection events
- source gateway ID
- resolved protection profile
- raw payload and detection timestamp

### AdminLog

Stores important admin actions for auditing.

## Startup Behavior

When `server.js` starts, the backend:

1. connects to MongoDB
2. syncs the default subscription plans
3. backfills protection profiles from existing users
4. starts the daily subscription expiry job
5. starts the HTTP server

The subscription expiry job automatically:

- marks expired subscriptions
- revokes WireGuard peers for expired users when applicable
- saves gateway sync errors to the user record if revocation fails

## Environment Variables

Use `.env.example` as the reference template.

Important variables:

### Core app

- `PORT`
- `NODE_ENV`
- `CLIENT_URL`
- `SERVER_PUBLIC_URL`
- `MONGO_URI`
- `JWT_SECRET`

### Email OTP

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `EMAIL_FROM`

### Gateway / WireGuard / SSH

- `GATEWAY_HOST`
- `GATEWAY_PORT`
- `GATEWAY_USERNAME`
- `GATEWAY_PRIVATE_KEY_BASE64`
- `GATEWAY_PRIVATE_KEY`
- `GATEWAY_PRIVATE_KEY_PATH`
- `GATEWAY_PUBLIC_IP`
- `GATEWAY_WIREGUARD_PUBLIC_KEY`
- `GATEWAY_WIREGUARD_PORT`
- `WIREGUARD_INTERFACE`
- `WIREGUARD_NETWORK_PREFIX`
- `WIREGUARD_START_HOST`
- `WIREGUARD_END_HOST`
- `WIREGUARD_DNS`
- `WIREGUARD_ALLOWED_IPS`

### Webhook security

- `ALERT_WEBHOOK_SECRET`

### Chapa payment integration

- `CHAPA_SECRET_KEY`
- `CHAPA_BASE_URL`
- `CHAPA_RETURN_URL`
- `CHAPA_CURRENCY`

## Local Development Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create local environment file

Copy `.env.example` into `.env` and set the values for your machine.

Recommended local values:

```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:3000
SERVER_PUBLIC_URL=http://localhost:5000
MONGO_URI=mongodb://localhost:27017/ai-firewallbackend
```

### 3. Start MongoDB locally

Make sure MongoDB is running on:

```text
mongodb://localhost:27017/ai-firewallbackend
```

### 4. Start the backend

```bash
npm run dev
```

### 5. Verify the API

Open:

```text
http://localhost:5000/
```

Expected response:

```json
{"success":true,"data":{"message":"API is running..."}}
```

## Email Setup

This project currently uses Nodemailer.

Example Gmail-style configuration:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=your-email@gmail.com
```

To verify SMTP configuration:

```bash
npm run email:verify
```

Notes:

- if the mail provider blocks SMTP access, OTP sending will fail
- for Gmail, use an app password rather than your normal login password
- local mode is easier to debug, but SMTP still depends on outbound network access

## Gateway / WireGuard Integration

This backend can provision and revoke WireGuard peers on a remote gateway over SSH.

The relevant service is based on:

- `ssh2` for SSH connectivity
- `wg set` commands on the remote host

It supports:

- adding a peer
- removing a peer
- querying current WireGuard state through admin routes
- exposing protection-profile lookup for debugging and integration verification
- syncing the assigned VPN IP into the protection profile after successful provisioning

Important:

- the backend may assign a VPN IP before the gateway peer is successfully provisioned
- a user should only try to connect when the VPN peer status is `active`
- if SSH provisioning fails, the backend records the failure in `lastSyncError`

The backend expects the remote server to have:

- SSH access enabled
- the configured user allowed to run `sudo wg ...`
- the target WireGuard interface available, usually `wg0`

## Cloudflare Tunnel For Local Public Access

When this backend runs locally, cloud-hosted systems cannot call `http://localhost:5000` directly. For that, use Cloudflare Tunnel.

This project includes a helper script:

```bash
npm run tunnel:cloudflare
```

That script starts a Cloudflare quick tunnel against:

```text
http://127.0.0.1:5000
```

`127.0.0.1` is used intentionally instead of `localhost` because Windows may resolve `localhost` through IPv6 (`::1`), which can break the tunnel if the backend is only listening on IPv4.

### Important quick tunnel behavior

- the generated `trycloudflare.com` URL is temporary
- the URL changes every time the tunnel is restarted
- this is good for development and demos, not for stable production webhooks

### How to get a public URL

1. Start the backend:

```bash
npm run dev
```

2. Start the tunnel:

```bash
npm run tunnel:cloudflare
```

3. Wait for output like this:

```text
https://something-random.trycloudflare.com
```

4. Use that public base URL for external integrations.

For the gateway webhook, the full callback URL becomes:

```text
https://something-random.trycloudflare.com/api/alerts
```

Recommended gateway payload:

```json
{
  "vpn_ip": "10.0.0.2",
  "victim_vpn_ip": "10.0.0.2",
  "wireguard_public_key": "client-public-key",
  "gateway_peer_ref": "wg0:<userId>",
  "gateway_id": "gateway-dev-1",
  "event_type": "attack_detected",
  "detected_at": "2026-04-08T12:00:05Z",
  "attacker_ip": "203.0.113.10"
}
```

`vpn_ip` is the preferred primary lookup field for gateway events. `victim_vpn_ip` is still accepted for compatibility.

Sending multiple identifiers is preferred. The backend now cross-checks them and returns `409` if they point to different protection profiles.

`gateway_id` identifies the gateway instance for auditing and event tracing. It does not replace customer identity and should not be treated as the primary protected-user lookup key.

The backend accepts plain IP values such as `10.0.0.12` for `victim_vpn_ip`. Internally, it can normalize formats as needed, but integrations should send plain IP format consistently to avoid confusion.

### If another developer needs the tunnel

They should:

1. install `cloudflared`
2. run the backend locally on port `5000`
3. run `npm run tunnel:cloudflare`
4. copy the newly generated `trycloudflare.com` URL
5. update any external system that points to the old tunnel URL

### Cloudflare troubleshooting

If the tunnel starts but external requests fail:

- make sure the backend is actually running on port `5000`
- make sure the tunnel targets `http://127.0.0.1:5000`
- do not rely on an old quick-tunnel URL after restarting the tunnel
- if the gateway is getting `401`, verify the `X-Alert-Secret` header
- if the gateway is getting `404`, verify the path is `/api/alerts`

## Scripts

- `npm start` - start the server with Node
- `npm run dev` - start the server with Nodemon
- `npm run email:verify` - verify SMTP connectivity
- `npm run smtp:verify` - alias for the same email verification script
- `npm run tunnel:cloudflare` - start a Cloudflare quick tunnel to the local backend

## Gateway API Contract

`POST /api/alerts` returns machine-friendly JSON responses:

- `200` for accepted heartbeat events
- `201` for accepted attack events
- `202` when the event is well-formed but the VPN IP or identifiers are not registered
- `400` for malformed payloads
- `401` for wrong `X-Alert-Secret`
- `409` when multiple supplied identifiers conflict

Example conflict response:

```json
{
  "success": false,
  "message": "Provided gateway identifiers map to conflicting protection profiles"
}
```

Example unregistered-IP response:

```json
{
  "success": true,
  "message": "No registered protection profile matched this gateway event",
  "data": {
    "accepted": false,
    "eventType": "heartbeat",
    "vpnIp": "10.0.0.250/32"
  }
}
```

## Shared Secret Contract

The shared secret names differ by layer:

- gateway request header: `X-Alert-Secret`
- backend environment variable: `ALERT_WEBHOOK_SECRET`

The names are different, but the value must match exactly.

## Authentication Notes

- protected routes require `Authorization: Bearer <token>`
- admin routes require a user whose role is `admin`
- JWT signing uses `JWT_SECRET`

## Project Structure

```text
config/        environment and database setup
controllers/   route handlers
middleware/    auth, admin, and subscription guards
models/        Mongoose models
routes/        Express route definitions
scripts/       helper scripts for SMTP and Cloudflare tunnel
services/      email, gateway, alerts, plan sync, jobs, and integrations
utils/         shared helpers
server.js      backend entry point
app.js         Express app setup
```

## Operational Notes

- do not commit real secrets from `.env`
- rotate any secret that has ever been committed
- keep `.env.example` updated whenever configuration changes
- quick Cloudflare tunnels are not stable permanent URLs
- if a stable public URL is needed, use a named Cloudflare Tunnel or deploy the backend publicly
- the backend is multi-user capable, but the current gateway repo still sends one configured protected profile at a time

## Suggested Handover Checklist

When another developer takes over this project, they should confirm:

1. MongoDB is running locally
2. `.env` is populated
3. SMTP credentials are valid
4. the backend responds on `http://localhost:5000`
5. the Cloudflare tunnel produces a fresh public URL when needed
6. the gateway is configured to use `<public-url>/api/alerts`
7. the `X-Alert-Secret` value matches `ALERT_WEBHOOK_SECRET`

## Related Files

- `app.js`
- `server.js`
- `.env.example`
- `services/emailService.js`
- `services/gatewaySshService.js`
- `services/subscriptionExpiryService.js`
- `services/planCatalogService.js`
- `controllers/alertsController.js`
- `controllers/adminController.js`
- `controllers/dashboardController.js`
- `routes/subscriptionRoutes.js`
