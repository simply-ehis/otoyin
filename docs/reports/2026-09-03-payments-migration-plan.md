# Payment Provider Migration — Comparison & Scoped Plan

**Date:** 2026-09-03
**Prompt:** `otoyin-redesign-prompts/10-payments-migration.md`
**Stage:** decision-support + scoped plan. **No provider is chosen or integrated here** — the pack is explicit that the seller must confirm real payout mechanics with a provider before any integration code.

## 0. Live-path correction (verified in code)

The 01 audit's correction holds: **both payment stacks exist, and the shipped
frontend uses the marketplace-service one (PayProGlobal).**

- `app/src/lib/marketplace.ts` — the in-app Store fetches the catalog from
  `marketplace.21labs.app` and initiates checkout at
  `${baseUrl}/v1/checkout`, then polls `/v1/webhook/license/{orderRef}` —
  i.e. the **remote marketplace service**, whose checkout is PayProGlobal
  (`marketplace/marketplace_server/routes/checkout.py`).
- `backend/routes/marketplace.py:109-168` — a second **Stripe** checkout path
  (`/marketplace/checkout`, `/marketplace/webhook/stripe`,
  `/marketplace/license/{order_ref}`) exists in the main backend and is API-
  reachable, but **no shipped frontend calls it**. Legacy/secondary, kept
  pending this decision (audit §2).
- So the pack's "replace PayProGlobal, not Stripe" framing is correct for the
  live path.

## 1. Provider landscape (as of Sept 2026 — verify payout directly)

From the pack's research + general knowledge. **Not financial advice; each
option must be confirmed with the provider for a Nigeria-based seller, for the
actual business setup (individual vs CAC-registered), before committing.**

| Provider | Model | Nigeria-seller fit | Watch out for |
|---|---|---|---|
| **Paddle** | Merchant of Record (~5% + $0.50) | Sells into 200+ countries incl. Nigeria as buyer market; historically pays out to sellers via Payoneer for unsupported-bank regions | Confirm current payout methods for Nigerian sellers on signup; no native bank payout assumed |
| **Dodo Payments** | Merchant of Record, no monthly fee | Explicitly pitched at solo devs in India/Nigeria | Newer/less battle-tested than Paddle; check reliability/reputation and real payout speed |
| **Lemon Squeezy** | Merchant of Record | ⚠ Acquired by Stripe (2024); now runs on Stripe infra | Stripe's country restrictions may apply indirectly — confirm it's not just Stripe again before considering |
| **Gumroad** | Simple | Documented history of unfulfilled Nigerian payout requests | Likely not the answer |

**Recommended process:** open seller accounts with **Paddle and Dodo in
parallel** (not just read marketing pages), complete KYC for the real business
entity, and verify an actual test payout to a Nigerian bank/Payoneer before
writing any integration code. This is a business decision with real money on
the line — no agent should make it.

## 2. Engineering scope (once a provider is confirmed)

1. **Replace PayProGlobal calls** in `marketplace/marketplace_server/routes/checkout.py`
   with the new provider's checkout-session API; preserve the `Order`/`Product`
   model shapes (`marketplace/marketplace_server/models.py`) to minimize blast
   radius. Keep the `checkout_url` + `order_ref` contract the frontend already
   consumes (`app/src/lib/marketplace.ts`), so the **frontend likely needs zero
   changes**.
2. **Webhook handler** — `marketplace/marketplace_server/routes/webhook.py`:
   swap signature verification + payload format for the new provider (the
   trickiest part; do it in sandbox first).
3. **Env vars + docs** — update `marketplace/README.md` env list and Vercel
   config for the new credentials.
4. **Remove the legacy Stripe path** (audit §1/§2 finding): once confirmed
   unused by any shipped client, remove `backend/services/checkout.py`,
   `backend/routes/marketplace.py:99-168` Stripe wiring,
   `tax.calculate_tax_stripe` (`backend/services/tax.py:178`, zero callers),
   `backend/tests/test_stripe_live.py`, `backend/tests/test_checkout_tax_webhook.py`,
   `STRIPE_TESTING.md`. New Merchant-of-Record providers (Paddle/Dodo) absorb
   tax, so `tax.py` shrinks to the local-preview path only.
5. **Sandbox testing doc** — write a provider-specific equivalent of
   `STRIPE_TESTING.md` (the pattern to follow) and run the full happy + refund
   + webhook-failure matrix before cutover.

## 3. Feeds into

- 12-deployment docs (env var reference + marketplace README) once landed.
- 07 Part B admin surface (product/offer management) — checkout API changes
  don't affect it, but the admin routes should be tested against the new
  provider's sandbox too.

## 4. Decision needed (user)

Confirm payout eligibility for the real business entity with at least one of
Paddle / Dodo (parallel signups recommended), then pick the provider. Until
then, no payment code changes.