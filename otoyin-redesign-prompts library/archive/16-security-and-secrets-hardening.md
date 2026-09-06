# Prompt: Security & Secrets Hardening

## Context — what's already good, verify it stays that way

Confirmed in the audit, don't re-litigate: BYOK provider API keys are
already encrypted at rest (`backend/services/model_providers.py`,
`encrypt_secret`/`decrypt_secret` via `backend/utils/secret_store.py`), no
hardcoded API keys/secrets found in a repo-wide scan, and rate limiting
already exists broadly (`backend/services/rate_limiter.py`,
`backend/utils/rate_limiter.py`, applied across `generate.py`,
`voice_chat.py`, `realtime.py`, and others). This prompt is about the gaps
around that solid core, not a rebuild of it.

## Scope

1. **MCP server authentication model.** `backend/mcp_server/context.py`
   tracks `client_id` and `remote_addr` per request, but the audit didn't
   find explicit token/API-key gating on the MCP server itself. Confirm the
   intended trust model: if the MCP server is meant to be **local-only**
   (bound to loopback, trusted because only local processes can reach it),
   document that explicitly and confirm the bind address enforces it. If
   it's ever exposed beyond loopback (remote mode, per `serverStore.ts`'s
   `mode: "local" | "remote"`), it needs real authentication before that's
   safe — audit whether remote mode currently exposes the MCP server
   without one.
2. **Marketplace admin routes** (from 07's remote-catalog-management
   backend). Whatever endpoint lets you add/update models, prices, and
   offers remotely needs real authentication (not just "not linked
   publicly") before it ships — this is the one part of this whole redesign
   where a gap directly costs you money if someone else finds it.
3. **Webhook signature verification consistency.** Confirm the new payment
   provider's webhook handler (10) verifies signatures with the same rigor
   the PayProGlobal implementation currently does
   (`marketplace/marketplace_server/routes/webhook.py`) — don't let this
   regress during the provider swap; webhook spoofing on a payment endpoint
   is a direct financial risk.
4. **Notification backend auth** (08) — if you're adding an admin-side way
   to push notices to all users, that write path needs the same
   authentication scrutiny as the marketplace admin routes in point 2.
5. **Dependency scanning.** `NOTICE.md` documents a careful license audit
   from 2026-08-24 but that's about licensing, not vulnerabilities — add
   (or confirm) a dependency vulnerability scan (`npm audit` /
   `pip-audit` / GitHub Dependabot) in CI, especially relevant now that
   `.github/workflows/*.yml` are being touched anyway (bun→npm cleanup in
   03).

## Deliverable

An explicit statement of the MCP server's trust model (and a fix if remote
mode currently exposes it ungated), authenticated admin routes for the
marketplace catalog/offers and notifications backends, confirmed webhook
signature verification on the new payment provider, and a dependency
vulnerability scan wired into CI.
