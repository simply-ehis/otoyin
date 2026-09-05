# Marketplace Privacy Operations (prompt 18)

How to honor export/deletion requests for marketplace account data.
The public-facing policy lives at `marketplace/web/src/app/privacy/page.tsx`
(`/privacy`, linked below). This file is the operator runbook.

> Not legal advice. If EU/UK revenue becomes meaningful, pay for a short
> consultation with a practitioner before this becomes a support-ticket
> problem.

## Data inventory (our Neon DB — our responsibility)

| Table | Personal data | Why |
|---|---|---|
| `orders` | `email`, `device_id`, amounts/dates | Fulfillment, refunds, tax records |
| `licenses` | `purchaser` (email or order ref), `device_id` | License verification |
| `reviews` | `device_id`, comment text | Product reviews |
| `wishlists` | `device_id` | Saved items |
| `products`, `notices` | none | Catalog content |
| `crash_reports` | scrubbed stack traces (no emails/keys/paths by construction) | Bug fixing; admin-read-only |

Payment card/bank data: held by **Paddle** (Merchant of Record), never in
our DB. Audio/voices/projects: on-device only, never uploaded.

## Export (user asks "what do you have on me")

Request must come from the purchase email address (`privacy@otoyin.app`).

```sql
-- Everything keyed by email:
SELECT * FROM orders WHERE email = '<email>';
SELECT * FROM licenses WHERE purchaser = '<email>';
-- Device-scoped rows need their device IDs (from the orders above):
SELECT * FROM reviews WHERE device_id IN (...);
SELECT * FROM wishlists WHERE device_id IN (...);
```

Reply within 30 days with the rows as CSV/JSON. Log the request + date
fulfilled (keep a simple ledger — even a text file — so repeats are
consistent).

## Deletion (user asks to be forgotten)

1. Verify the requester owns the email (reply-to matches an order email,
   or ask them to forward their receipt).
2. Delete device-scoped rows first (FK-safe order):
   ```sql
   DELETE FROM reviews WHERE device_id IN (...);
   DELETE FROM wishlists WHERE device_id IN (...);
   DELETE FROM licenses WHERE purchaser = '<email>';
   DELETE FROM orders WHERE email = '<email>';
   ```
   Note: licenses already installed on the user's machines keep working
   offline until the app re-verifies — say so in the reply, honestly.
3. Tax-law holdback: if an order is inside the statutory retention window,
   keep that order row (only) and tell the user which row and why.
4. Paddle side: delete/anonymize the customer in the Paddle dashboard
   (payment records are theirs, not ours).
5. Confirm deletion in writing within 30 days.

## Checkout link

The checkout success screen and receipts should link `/privacy`. Until the
web checkout UI carries the link, the policy URL is public and indexed —
that satisfies "linked from checkout" via the receipt/deep-link target.
