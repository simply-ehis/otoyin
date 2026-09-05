# Marketplace server — Vercel + Neon

## Setup

1. Create a Neon database at https://neon.tech
2. Copy the connection string from Neon dashboard
3. Set environment variables in Vercel:
   - `MARKETPLACE_DATABASE_URL` = your Neon connection string
   - `MARKETPLACE_LICENSE_PRIVATE_KEY` = base64-encoded Ed25519 private key
   - `MARKETPLACE_PADDLE_API_KEY` = Paddle API key (sandbox key for staging)
   - `MARKETPLACE_PADDLE_WEBHOOK_SECRET` = per-destination secret (`pdl_ntfset_...`)
   - `MARKETPLACE_PADDLE_SANDBOX` = `false` in prod, `true` anywhere else
   - `MARKETPLACE_PADDLE_PRICE_MAP` = JSON, e.g. `{"qwen3-tts": "pri_01j..."}` (one Paddle price per paid product)
   - `MARKETPLACE_ADMIN_KEY` = Bearer token for `/v1/admin/*` routes (e.g. `POST /v1/notices/admin`)

> **Payment provider:** Paddle Billing (Merchant of Record — tax/VAT handled
> by Paddle, not here). Sandbox is the default (`MARKETPLACE_PADDLE_SANDBOX`
> stays `true` until prod), so a misconfigured deploy can never charge.
> Every paid catalog product needs a Paddle price or checkout returns
> `price_not_configured`. Seller-payout setup (Payoneer for Nigerian sellers)
> happens in the Paddle dashboard, not in code — see `PADDLE_TESTING.md`.

## Endpoints

- `GET /v1/catalog` — signed product catalog (the desktop app merges this
  remotely; see prompt 07 plan)
- `POST /v1/checkout` · `GET /v1/webhook/license/{order_ref}` — Paddle checkout + license
- `POST /v1/checkout/donate` — custom-amount donations ($1–$10,000, non-catalog Paddle pricing, no license minted)
- `POST /v1/crashes` · `GET /v1/crashes/admin` (Bearer `MARKETPLACE_ADMIN_KEY`) — opt-in crash ingest
- `GET /v1/notices` — push-style announcements polled by the app on launch
  (offline-first; see `docs/knowledge/77-notifications.md`)
- Privacy: public policy at `/privacy` (`web/src/app/privacy/page.tsx`);
  export/deletion runbook in `PRIVACY.md`.
- `POST /v1/notices/admin` — create/update a notice (Bearer `MARKETPLACE_ADMIN_KEY`)
- `GET /v1/catalog/offers` · reviews · wishlist

## Deploy

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd marketplace
vercel

# Set env vars
vercel env add MARKETPLACE_DATABASE_URL
vercel env add MARKETPLACE_LICENSE_PRIVATE_KEY
# ... etc

# Deploy to production
vercel --prod
```

## Local dev

```bash
# SQLite (default)
python -m marketplace_server.seed
python -m uvicorn marketplace_server.app:app --reload --port 8420

# Or with Neon
MARKETPLACE_DATABASE_URL=postgresql+asyncpg://... python -m marketplace_server.seed
MARKETPLACE_DATABASE_URL=postgresql+asyncpg://... python -m uvicorn marketplace_server.app:app --reload
```

## Generate Ed25519 keypair

```python
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
import base64

private_key = Ed25519PrivateKey.generate()
private_bytes = private_key.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())
public_bytes = private_key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)

print(f"PRIVATE_KEY={base64.b64encode(private_bytes).decode()}")
print(f"PUBLIC_KEY={base64.b64encode(public_bytes).decode()}")
```
