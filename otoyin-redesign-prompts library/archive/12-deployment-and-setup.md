# Prompt: Deployment & Setup Documentation

## Context

Run this last, after 08 (notifications) and 10 (payments) have landed —
this doc needs to describe the *final* state of the backend services, not
document something that's about to change again.

Existing deployment docs to consolidate/update rather than duplicate:
`DEPLOY.md` (root), `marketplace/README.md`, `docs/DEPLOYMENT_TEST_PLAN.md`,
`railway.json` (root — suggests Railway is a deploy target for the main
backend), `Dockerfile`, `.dockerignore`, `docker-compose.yml` (referenced in
`AUDIT_REPORT.md`'s CORS/healthcheck fixes — confirm it still exists and is
current).

## Scope

1. **One clear deployment doc per service**, not one giant doc:
   - The desktop app build/release process (Tauri bundling, code signing,
     the updater manifest from 09).
   - The main backend (`backend/`) — if it's deployed anywhere remotely at
     all (vs. running locally alongside the desktop app — confirm which),
     document that path; `railway.json` suggests Railway.
   - The marketplace service (`marketplace/`) — Vercel + Neon, per its
     existing README; update this one for whatever payment provider 10
     landed on, and whatever notification backend 08 added (if it lives in
     this service, per that prompt's recommendation).
2. **Environment variable reference** — a single up-to-date table of every
   env var each service needs, post-rebrand (02) and post-payment-migration
   (10). The current `.env.example` (root) should be the source of truth;
   confirm it's actually current against what the code reads, not stale.
3. **Local dev setup** — should work end-to-end with `npm install` only
   (post bun-removal from 03), no bun/pnpm steps left anywhere in the
   instructions.
4. **A note on what changed and why**, for your own future reference —
   since this whole redesign touches branding, framework, payments, and
   infra simultaneously, a short "what moved where" migration note will
   save you real time later when something breaks and you're trying to
   remember which service now owns what.

## Deliverable

Updated `DEPLOY.md`, updated `marketplace/README.md`, a consolidated env
var reference, and a short migration/changelog note summarizing what this
whole redesign effort changed at the infrastructure level.
