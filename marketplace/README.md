# Marketplace server — Vercel + Neon

## Setup

1. Create a Neon database at https://neon.tech
2. Copy the connection string from Neon dashboard
3. Set environment variables in Vercel:
   - `MARKETPLACE_DATABASE_URL` = your Neon connection string
   - `MARKETPLACE_LICENSE_PRIVATE_KEY` = base64-encoded Ed25519 private key
   - `MARKETPLACE_PAYPROGLOBAL_SHOP_ID` = PayProGlobal shop ID
   - `MARKETPLACE_PAYPROGLOBAL_API_KEY` = PayProGlobal API key
   - `MARKETPLACE_PAYPROGLOBAL_WEBHOOK_SECRET` = PayProGlobal webhook secret

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
