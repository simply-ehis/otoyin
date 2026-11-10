# Paddle Testing Guide (replaces STRIPE_TESTING.md — Stripe removed 2026-09-04)

Paddle Billing is the Merchant of Record: Paddle handles payment processing,
VAT/sales-tax, and compliance. This repo only creates transactions, verifies
webhooks, and signs licenses.

## 0. Seller account (do once, in the dashboard — not in code)

1. Sign up at https://vendors.paddle.com (Billing, not Classic).
2. **Payout for Nigerian sellers:** Paddle pays out via Payoneer where direct
   bank payout is unavailable — connect Payoneer under checkout settings and
   confirm a test payout *before* going live. Do not write integration code
   against promises; verify money movement.
3. Create one **product + price** per paid catalog product; copy each
   `pri_...` ID into `MARKETPLACE_PADDLE_PRICE_MAP`.
4. Create a **notification destination** pointing at
   `https://<your-host>/v1/webhook`, subscribing to `transaction.completed`,
   `transaction.canceled`, `transaction.payment_failed`,
   `adjustment.created`; copy its secret (`pdl_ntfset_...`) to
   `MARKETPLACE_PADDLE_WEBHOOK_SECRET`.
5. Keep `MARKETPLACE_PADDLE_SANDBOX=true` everywhere except prod.

## 1. Unit tests (no provider account needed)

```bash
cd marketplace && python -m pytest tests/ -q   # 14 tests: signature scheme + dev checkout + webhook fulfill
```

Signature scheme under test: `Paddle-Signature: ts=...;h1=...`,
signed payload `{ts}:{raw_body}`, HMAC-SHA256 hex, 5-minute replay window,
multiple `h1` accepted (secret rotation).

## 2. Dev-mode loop (no API key at all)

With `MARKETPLACE_PADDLE_API_KEY` unset, `POST /v1/checkout` fulfills
immediately and returns an `otoyin://payment/success` URL:
```bash
python -m marketplace_server.seed
python -m uvicorn marketplace_server.app:app --port 8420
curl -X POST localhost:8420/v1/checkout \
  -H 'Content-Type: application/json' \
  -d '{"product_id":"<paid-id>","device_id":"dev-1","email":"you@example.com"}'
# → {"order_ref":"otoyin_...","checkout_url":"otoyin://...","..."}
curl localhost:8420/v1/webhook/license/otoyin_...
# → signed license JSON (install via the app's Models tab)

# Donations (no catalog product, no license — $1–$10,000):
curl -X POST localhost:8420/v1/checkout/donate \
  -H 'Content-Type: application/json' \
  -d '{"device_id":"dev-1","email":"","amount_usd":25}'
# → {"order_ref":"otoyin_...","checkout_url":"otoyin://...","donation":true,...}
curl localhost:8420/v1/webhook/license/otoyin_...
# → {"donated":true,"order_ref":"otoyin_...","amount_usd":25.0}
```

## 3. Sandbox loop (provider account, no real money)

1. Set sandbox API key + sandbox destination secret, keep `PADDLE_SANDBOX=true`.
2. `POST /v1/checkout` → open `checkout_url` → pay with a Paddle test card.
3. Webhook arrives → order flips to `paid` → `GET /v1/webhook/license/{ref}` returns the license.
4. In the sandbox dashboard, refund the transaction → `adjustment.created`
   (refund) arrives → order flips to `refunded` → license endpoint goes 402.

## 4. Go-live checklist

- [ ] Real payout verified (step 0.2), not just assumed
- [ ] `MARKETPLACE_PADDLE_SANDBOX=false` in prod only
- [ ] Every paid product has a `pri_...` in `MARKETPLACE_PADDLE_PRICE_MAP`
- [ ] Prod destination secret installed; sandbox secret NOT reused in prod
- [ ] A forced-bad-signature POST returns 401 (run §1 or curl it live)
- [ ] Refund revokes (step 3.4) — webhook spoofing here is direct revenue loss
