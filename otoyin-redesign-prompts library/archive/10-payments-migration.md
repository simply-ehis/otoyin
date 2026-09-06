# Prompt: Payment Provider Migration (Nigeria-friendly)

## Context — what's actually live today

Important correction to sort out before an agent starts: the repo has
**two** payment implementations, and it looks like PayProGlobal (not
Stripe) is already the live one:

- `marketplace/marketplace_server/routes/checkout.py` — PayProGlobal-based,
  deployed standalone (Vercel + Neon). `marketplace/README.md` lists real
  env vars for it (`MARKETPLACE_PAYPROGLOBAL_SHOP_ID`,
  `MARKETPLACE_PAYPROGLOBAL_API_KEY`, `MARKETPLACE_PAYPROGLOBAL_WEBHOOK_SECRET`)
  — this reads like the actual production path.
- `backend/services/checkout.py` — Stripe-based, lives inside the main
  backend, looks like an earlier/legacy implementation from before the
  marketplace was split into its own service.

So: Stripe was likely already ruled out for the reason you said (doesn't
support Nigeria), and PayProGlobal is the current live provider — which you
find confusing to work with. This prompt is about replacing PayProGlobal,
not Stripe. Have the agent confirm this reading against the code (trace
what `app/src/lib/marketplace.ts` actually calls) before proceeding — don't
assume the write-up above is 100% current if the code says otherwise.

## Options researched (as of Sept 2026) — not financial advice, verify directly

I'm not a financial or legal advisor, and payment-provider terms for
Nigeria-based sellers change often — the agent (and you) should confirm
current payout eligibility directly with each provider using your specific
business setup (individual vs. CAC-registered business) before committing.
That said, here's the honest landscape:

- **Paddle** — Merchant of Record (handles global tax/VAT so you don't have
  to register in 200+ countries). Well-established, JSON API, ~5% + $0.50
  per transaction. Paddle explicitly supports *selling* into 200+ countries
  including Nigeria as a buyer market. The open question is *payout* to a
  Nigeria-based seller — historically resolved via Payoneer rather than
  direct Nigerian bank transfer for sellers in regions without native bank
  payout support. Confirm current payout methods for a Nigerian seller
  account directly on signup before committing engineering time.
- **Dodo Payments** — newer Merchant of Record, explicitly marketed at
  "solo developers... building from countries like India or Nigeria," no
  monthly fee, positioned as cheaper than Paddle/Lemon Squeezy/Gumroad at
  low volume. Less established/battle-tested than Paddle (worth weighing
  reliability/reputation against the cost savings and the explicit
  Nigeria-friendliness), but worth a real evaluation given it's the only
  option here that names your situation directly in its pitch.
- **Lemon Squeezy — do not pick this one without checking first.** It's a
  Merchant of Record, similar model to Paddle, but **it was acquired by
  Stripe in mid-2024 and now runs on Stripe's infrastructure underneath**
  (Stripe has been building "Stripe Managed Payments" on top of what it
  learned from Lemon Squeezy, with a migration path opening in 2026). Since
  the whole reason Stripe was ruled out is Nigeria support, and Lemon
  Squeezy is now a Stripe subsidiary, its Nigeria-seller viability is
  genuinely uncertain going forward — confirm explicitly before considering
  it, don't assume it's independent of Stripe's country restrictions anymore.
- **Gumroad** — simpler, well-known, but has a documented, ongoing history
  of Nigerian sellers requesting local payout support that hasn't
  materialized (visible in Gumroad's own public feedback board). Likely not
  the answer here.

**Recommended path:** evaluate Paddle and Dodo Payments in parallel — sign
up for both as a seller (not just read marketing pages) and confirm real
payout mechanics for your specific setup before writing any integration
code. This is a business decision with real money on the line; don't let an
agent pick one and start integrating without you personally confirming
payout works for you first.

## Once a provider is chosen — engineering scope

1. Replace `marketplace/marketplace_server/routes/checkout.py`'s
   PayProGlobal calls with the new provider's checkout session API,
   preserving the existing `Order`/`Product` model shape
   (`marketplace/marketplace_server/models.py`) as much as possible to
   minimize blast radius.
2. Update the webhook handler (`marketplace/marketplace_server/routes/webhook.py`)
   for the new provider's webhook signature/payload format — this is
   usually the trickiest part (signature verification differs per provider).
3. Update `marketplace/README.md`'s env var list and deployment
   instructions for the new provider's credentials.
4. **Remove or clearly mark-dead the legacy `backend/services/checkout.py`
   Stripe path** (per the finding in 01/02) once confirmed it's genuinely
   unreachable — don't carry three payment integrations (Stripe, PayProGlobal,
   new provider) at once.
5. Update `backend/services/tax.py` — its `calculate_tax_stripe` function
   presumably becomes irrelevant once Stripe is fully removed; if the new
   provider is a full Merchant of Record (Paddle and Dodo both are), tax
   calculation moves to the provider entirely and this file may shrink
   significantly or go away.
6. Test against the new provider's sandbox/test mode thoroughly
   (`STRIPE_TESTING.md` is the pattern to follow — write an equivalent
   testing doc for the new provider) before any real cutover.

## Deliverable

A short written comparison confirming the payout-eligibility check was
actually done (not just researched), a chosen provider, and either the
migration implementation or a scoped plan for it depending on what stage
this runs at. Feeds into 12-deployment-and-setup.md.
