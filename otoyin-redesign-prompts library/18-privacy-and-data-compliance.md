# Prompt: Privacy & Data Compliance (Marketplace Accounts)

## Context

The core app is genuinely privacy-friendly by design — offline-first,
telemetry opt-in and off by default (`backend/services/telemetry.py`,
confirmed `enabled: bool = False` as the default). This prompt is narrower:
it's specifically about the **marketplace service**
(`marketplace/marketplace_server/`), which holds real customer data
(orders, likely email addresses, payment metadata) in a real database
(Neon/Postgres) for a product sold globally, including to EU customers —
that combination brings GDPR-style obligations regardless of where you're
based.

The audit found no data export or account/data-deletion handling in the
marketplace service. This isn't a "someday" item — payment processors and
some regions have real enforcement teeth here, and both Paddle and Dodo
Payments (the providers under consideration in 10) are Merchant of Record,
meaning they handle *payment*-side compliance (tax, PCI) — but the
**order/account data you store yourself** in the marketplace DB is still
your responsibility, not theirs.

## Scope

1. **A basic privacy policy**, published on the marketplace site
   (`marketplace/web/`) and linked from checkout — what's collected (email,
   order history, license keys), why, and how long it's retained. Keep it
   honest and short; this doesn't need to be elaborate, it needs to exist
   and be accurate.
2. **A data deletion path.** At minimum, a support-email-triggered manual
   process is a legitimate starting point for a solo-run product — it
   doesn't need to be a self-service button on day one. Document the
   process (even if manual) so it's real and repeatable, not improvised
   per request.
3. **A data export path**, similarly minimal-but-real to start — a user
   should be able to ask what you have on them and get an answer.
4. **Check what the chosen payment provider (10) already covers.** Both
   Paddle and Dodo, as Merchant of Record, likely already handle a chunk of
   this for the payment/tax data specifically — read their MoR data-handling
   docs before building anything duplicative; you may only need to cover
   the account/order data that lives in *your* Neon DB, not payment details
   the provider already manages on their side.
5. **This is not legal advice, and this file isn't a substitute for it.**
   If the marketplace does meaningful EU/UK revenue, a short paid
   consultation with someone who actually practices in this area is a
   reasonable expense before this becomes a support-ticket-shaped problem —
   flag that as a real recommendation, not just an engineering task.

## Deliverable

A published privacy policy, a documented (even if manual) data
export/deletion process, and a short note on what the chosen payment
provider already covers versus what's still your responsibility.
