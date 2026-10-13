# Marketplace server — Cloudflare + Neon + Dodo Payments

## Setup

1. Create a Neon database at https://neon.tech
2. Copy the connection string from Neon dashboard
3. Create a Cloudflare Workers Paid project and Pages project, then configure
   the API's runtime secrets in Cloudflare:
   - `MARKETPLACE_DATABASE_URL` = your Neon connection string
   - `MARKETPLACE_LICENSE_PRIVATE_KEY` = base64-encoded Ed25519 private key
   - `MARKETPLACE_DEBUG` = `false` in production; only set `true` for local development
   - `MARKETPLACE_DODO_API_KEY` = Dodo API key (test key for staging)
   - `MARKETPLACE_DODO_WEBHOOK_SECRET` = signing secret for the webhook destination
   - `MARKETPLACE_DODO_SANDBOX` = `false` in prod, `true` anywhere else
   - `MARKETPLACE_DODO_PRODUCT_MAP` = JSON mapping catalog IDs to Dodo product IDs, e.g. `{"qwen3-tts": "pdt_..."}`
   - `MARKETPLACE_ADMIN_KEY` = Bearer token for `/v1/admin/*` routes (e.g. `POST /v1/notices/admin`)

> **Payment provider:** Dodo Payments (Merchant of Record). Sandbox is the
> default (`MARKETPLACE_DODO_SANDBOX=true`), so a misconfigured deploy cannot
> charge live. Every paid catalog product needs a Dodo product ID in the map or
> checkout returns `price_not_configured`. Configure a Dodo webhook destination
> for `payment.succeeded`, `payment.cancelled`, `payment.failed`, and
> `refund.succeeded`; copy its signing secret to `MARKETPLACE_DODO_WEBHOOK_SECRET`.
> Production startup now fails when the license private key is missing; do not
> set `MARKETPLACE_DEBUG=true` on a public deployment.

## Endpoints

- `GET /v1/catalog` — signed product catalog (the desktop app merges this
  remotely)
- `POST /v1/checkout` · `GET /v1/webhook/license/{order_ref}` — Dodo checkout + license
- `POST /v1/checkout/donate` — custom-amount donations ($1–$10,000, no catalog product or license)
- `POST /v1/crashes` · `GET /v1/crashes/admin` (Bearer `MARKETPLACE_ADMIN_KEY`) — opt-in crash ingest
- `GET /v1/notices` — push-style announcements polled by the app on launch
  (offline-first; see `docs/knowledge/77-notifications.md`)
- Privacy: public policy at `/privacy` (`web/src/app/privacy/page.tsx`);
  export/deletion runbook in `PRIVACY.md`.
- `POST /v1/notices/admin` — create/update a notice (Bearer `MARKETPLACE_ADMIN_KEY`)
- `GET /v1/catalog/offers` · reviews · wishlist

## Deploy to Cloudflare

The API uses `Dockerfile`, `worker/index.ts`, and `wrangler.jsonc`. The Worker
starts a FastAPI container on demand, waits for `/health`, and forwards requests
to it. The container requires outbound internet for Neon and Dodo. Workers
Containers are available on the Cloudflare Workers Paid plan.

```bash
cd marketplace
npx wrangler@4 secret put MARKETPLACE_DATABASE_URL
npx wrangler@4 secret put MARKETPLACE_LICENSE_PRIVATE_KEY
npx wrangler@4 secret put MARKETPLACE_DODO_API_KEY
npx wrangler@4 secret put MARKETPLACE_DODO_WEBHOOK_SECRET
npx wrangler@4 secret put MARKETPLACE_DODO_PRODUCT_MAP
npx wrangler@4 deploy --config wrangler.jsonc
```

Set `MARKETPLACE_DODO_SANDBOX=false` and `MARKETPLACE_ALLOWED_ORIGINS` in the
`vars` section of `wrangler.jsonc` only after production payment and browser
origins are configured. The checked-in value keeps sandbox mode enabled. Keep
the API in sandbox mode until a complete test purchase,
webhook, refund, and license verification succeed.

The website is a static Next.js export deployed to the Pages project
`otoyin-marketplace`. Set `NEXT_PUBLIC_MARKETPLACE_API_URL` to the deployed API
origin ending in `/v1` and `NEXT_PUBLIC_MARKETPLACE_URL` to the origin without
`/v1`. The GitHub workflow deploys both API and site when `marketplace/**`
changes; it requires `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets,
and the Pages project must exist first.

Neon connection, Ed25519 license keys, Dodo keys, product map, and admin key
belong in Cloudflare Worker secrets/variables. Do not commit them or put them
in public GitHub Actions variables.

## Local dev

```bash
# SQLite (default); debug enables local auto-fulfillment without Dodo credentials
```

PowerShell:

```powershell
$env:MARKETPLACE_DEBUG = "true"
python -m marketplace_server.seed
python -m uvicorn marketplace_server.app:app --reload --port 8420
```

For Neon, use a shell with environment-variable assignment syntax:

```bash
MARKETPLACE_DEBUG=true MARKETPLACE_DATABASE_URL=postgresql+asyncpg://... python -m marketplace_server.seed
MARKETPLACE_DEBUG=true MARKETPLACE_DATABASE_URL=postgresql+asyncpg://... python -m uvicorn marketplace_server.app:app --reload
```

## Generate Ed25519 keypair

```python
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, PublicFormat, NoEncryption
import base64

private_key = Ed25519PrivateKey.generate()
private_bytes = private_key.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())
public_bytes = private_key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)

print(f"PRIVATE_KEY={base64.b64encode(private_bytes).decode()}")
print(f"PUBLIC_KEY={base64.b64encode(public_bytes).decode()}")
```
