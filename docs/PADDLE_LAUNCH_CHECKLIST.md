# Paddle Launch Checklist — Blockers On Your End

> PURPOSE: The exact owner-side steps to take payments live (Paddle) plus
> every other launch blocker in your court. Code is fail-closed without
> these; nothing here needs a code change.
> OWNS: product owner. READ-WHEN: before selling anything, before deploying
> the marketplace server, when a checkout/license step fails in prod.
> KEY-FILES: PADDLE_TESTING.md (test loops), marketplace/marketplace_server/config.py
> (all MARKETPLACE_ vars), marketplace/marketplace_server/seed.py (catalog),
> backend/services/licensing.py (desktop verification).
> INVARIANTS: no live keys → server answers 503, never free licenses; one
> Ed25519 keypair signs everything; 31 paid seed products each need a price.
> GOTCHAS: public/private keys must be the SAME pair; price map is JSON in
> one env var; otoyin:// has no OS handler (polling covers it).
> UPDATED: 2026-09-16.

## 0. How money flows (30 seconds)

App → `POST /v1/checkout` → Paddle transaction → system browser checkout →
Paddle webhook → server signs Ed25519 license → app polls
`GET /v1/webhook/license/{ref}` → desktop verifies signature locally.
Without live keys the server answers **503, never a free license** — that is
the designed behavior, not a bug.

## 1. License keypair (DO THIS FIRST — everything depends on it)

One Ed25519 pair: **private** → marketplace server, **public** → desktop app.
Mismatch = every paid license fails verification on the device.

```bash
backend\venv\Scripts\python.exe -c "import base64; from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey; from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, PublicFormat, NoEncryption; k=Ed25519PrivateKey.generate(); print('PRIVATE:', base64.b64encode(k.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())).decode()); print('PUBLIC:', base64.b64encode(k.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)).decode())"
```

- Server env: `MARKETPLACE_LICENSE_PRIVATE_KEY=<PRIVATE>`.
- Desktop release builds/runtime: `TWENTYLABS_MARKETPLACE_PUBLIC_KEY=<PUBLIC>`
  **and** `TWENTYLABS_ENV=production` (dev builds otherwise trust the dev key).
- Sanity: server startup prints `Public key: <prefix>...` — it must match.
- Never commit keys. Rotating the pair invalidates old licenses (re-sign).

## 2. Paddle seller account

1. Sign up at https://vendors.paddle.com (**Billing**, not Classic).
2. Nigeria payout: connect **Payoneer** under checkout settings and confirm a
   test payout *before* going live.
3. Full detail: `PADDLE_TESTING.md` §0.

## 3. Products and prices (31 paid products in the seed)

Dashboard: one **product + price** per paid catalog product, copy each
`pri_...` ID. Then set the map (JSON in a single env var):

```bash
MARKETPLACE_PADDLE_PRICE_MAP={"fish-speech-s2-pro":"pri_...","qwen3-tts-1.7b":"pri_..."}
```

- Every `paid:true` product needs an entry or its checkout 500s; free
  products need nothing. List paid ids from `marketplace/marketplace_server/seed.py`
  (`"paid": True`) or `GET /v1/catalog`.
- Donations need **zero** dashboard setup (inline pricing).

## 4. Webhook destination

In Paddle: notification destination → `https://<your-host>/v1/webhook`,
subscribed to `transaction.completed`, `transaction.canceled`,
`transaction.payment_failed`, `adjustment.created`. Copy its secret
(`pdl_ntfset_...`) → `MARKETPLACE_PADDLE_WEBHOOK_SECRET`. Live key with no
secret makes the server refuse webhooks (500) by design.

## 5. Server deploy env (all vars)

| Var | Value |
|---|---|
| `MARKETPLACE_PADDLE_API_KEY` | live `pdl_...` key (unset = dev mode) |
| `MARKETPLACE_PADDLE_SANDBOX` | `true` everywhere except prod |
| `MARKETPLACE_PADDLE_PRICE_MAP` | JSON map from §3 |
| `MARKETPLACE_PADDLE_WEBHOOK_SECRET` | §4 secret |
| `MARKETPLACE_LICENSE_PRIVATE_KEY` | §1 private key |
| `MARKETPLACE_DEBUG` | `false` in prod (`true` enables dev auto-fulfill) |
| `MARKETPLACE_DATABASE_URL` | default SQLite file is fine to start (back up `marketplace.db`); Neon/Postgres needs `asyncpg` added to requirements first — it is **not** installed today |
| `MARKETPLACE_ADMIN_KEY` | set it, but note: no admin routes exist yet — catalog changes go through `seed.py`/DB |

Deploy steps: `python -m marketplace_server.seed` (idempotent upsert) →
run `marketplace_server.app` behind public **HTTPS** (Paddle webhooks
require it). CORS is currently open (`*`).

## 6. Test loops (in order — details in PADDLE_TESTING.md)

1. **Dev** (`MARKETPLACE_DEBUG=true`, no keys): curl checkout → get
   `otoyin://payment/success` URL → poll license → signed JSON.
2. **Sandbox** (test keys, `SANDBOX=true`): pay with a Paddle test card →
   webhook flips order → poll returns the license.
3. **Live**: $1 donation first, then **refund it** — exercises the
   refund→revoke path before real money.

## 7. App-side items

- Prod builds call `https://marketplace.21labs.app` (hardcoded in
  `app/src/lib/marketplace.ts`): point DNS + TLS there, or change it and rebuild.
- The `otoyin://payment/success` deep link has **no OS handler registered** —
  harmless: the license arrives via polling plus the "Check again" button.
  Register the Tauri deep-link plugin later for auto-return-to-app.
- Ship release builds with §1's public key + `TWENTYLABS_ENV=production`.

## 8. Go-live order

- [ ] §1 keypair generated; private on server, public in release builds
- [ ] §2 Paddle account + Payoneer test payout confirmed
- [ ] §3 all 31 paid products have `pri_...` prices in the map
- [ ] §4 webhook destination live with all four events
- [ ] §5 server deployed on HTTPS, DB seeded, startup key prefix matches
- [ ] §6 sandbox sale completes end-to-end
- [ ] §6 live $1 donation + refund completes
- [ ] `MARKETPLACE_PADDLE_SANDBOX=false`, monitor webhook logs
