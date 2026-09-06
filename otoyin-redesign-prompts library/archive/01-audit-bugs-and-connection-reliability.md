# Prompt: Bug Audit + Connection Reliability Investigation

## Context for the agent

You're auditing the Otoyin repo (audio studio app — Tauri + FastAPI backend).
This is a **find and report** pass, not a fix pass. Log every finding in a
new `docs/reports/2026-XX-XX-redesign-audit.md` with file:line references.
Do not merge fixes without separate sign-off, except where a finding is
trivially safe (e.g. removing a genuinely dead/unreachable file) — flag even
those before deleting.

Two audit docs already exist in the repo — read them first so you don't
duplicate old ground:
- `AUDIT_REPORT.md` (root, dated 2025-07-21) — old pass, 63 issues fixed then.
  Treat as historical baseline; re-verify anything it claims is still true.
- `docs/reports/XXX_TODO_AUDIT.md` (2026-08-23) — confirms zero TODO/FIXME/HACK
  markers in the codebase (enforced by `check_placeholders.py`). Don't waste
  time grepping for those; they've been swept clean.
- `AGENT_FEEDBACK.md` (root) — a running log of environment friction other
  agents have hit. Read it fully; several entries below come from it.

## Known, already-confirmed issues (verify these still reproduce, then expand)

### Package manager chaos — confirmed, real, and worth fixing regardless of the framework migration
- Root `package.json` has `"engines": { "node": ">=18.0.0" }` and plain npm-style
  scripts, but `.github/workflows/build.yml` and `.github/workflows/ci.yml`
  install via `oven-sh/setup-bun@v2` + `bun install --frozen-lockfile`.
- `app/pnpm-lock.yaml` exists — so `app/` has been managed with **pnpm** at
  some point, while the root uses **bun**, and the scripts read like **npm**.
  That's three package managers touching one monorepo.
- `AGENT_FEEDBACK.md` (2026-08-30 entry) documents this biting a previous
  agent directly: `app/package.json` scripts call `biome`, but `biome` only
  lives in the root's bun-managed `node_modules` — running `pnpm exec biome`
  or `pnpm run lint` from `app/` fails with "biome not found."
- Root `package.json` workspaces array lists `"web"` — **there is no `/web`
  directory in this repo.** That's a broken workspace reference; confirm
  whether `web/` was deleted and the reference never cleaned up, or whether
  it's meant to be the `marketplace/web` directory misreferenced.
- **Task:** once you're on npm-only (see 03-frontend-framework-migration.md),
  delete `app/pnpm-lock.yaml`, fix or remove the `"web"` workspace entry,
  regenerate a single `package-lock.json` at the root, and update both CI
  workflows to drop `setup-bun`.

### Duplicate payment implementations — confirmed, likely dead code
- `backend/services/checkout.py` is a **Stripe**-based checkout service
  (imports `stripe`, reads `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`).
- `marketplace/marketplace_server/routes/checkout.py` is a separate,
  **PayProGlobal**-based checkout service, deployed standalone (Vercel + Neon,
  per `marketplace/README.md`).
- `backend/routes/marketplace.py` wires into the licensing/entitlements layer
  but doesn't obviously call `backend/services/checkout.py` — check whether
  that Stripe path is actually reachable from any route, or if it's dead code
  left over from before the marketplace was split into its own service.
- `STRIPE_TESTING.md`, `backend/tests/test_stripe_live.py`,
  `backend/tests/test_checkout_tax_webhook.py`, and `backend/services/tax.py`
  (has a `calculate_tax_stripe` function) all still reference Stripe.
- **Task:** trace every caller of `backend/services/checkout.py` and
  `backend/services/tax.py`. If the live path is entirely the
  `marketplace/marketplace_server` service now, flag the in-repo Stripe code
  for removal as part of 10-payments-migration.md — don't delete it here,
  just document exactly what's dead vs. live.

### i18n duplicate-key gotcha — confirmed
- `AGENT_FEEDBACK.md` (2026-08-30) notes `app/src/i18n/locales/en/translation.json`
  has **three** `sidebar` objects: top-level `sidebar` (what `t("sidebar.generate")`
  reads), plus nested `captures.sidebar` and `mcp.sidebar`. Confirm this is
  still the structure, and check the other three locale files
  (`ja`, `zh-TW`, `zh-CN`) for the same trap before anyone edits nav copy.

### Test isolation bug — confirmed
- `AGENT_FEEDBACK.md` (2026-08-30): `useGenerationForm.test.ts` overrides
  `useUIStore` via `mockImplementation` in one test; `vi.clearAllMocks()`
  does not reset that implementation, so later tests silently inherit
  `selectedEngine: "invalid_engine_xyz"`. Verify this is still the case and
  fix the mock teardown (`vi.restoreAllMocks()` or explicit re-mock in
  `beforeEach`) — this one's safe to just fix, it's test-only.

### Rust-side known bugs
- `docs/reports/XXX_TODO_AUDIT.md` mentions Patchi flagged **15 `# BUG:`
  comments in Rust source files** in the Tauri sidecar, described as "known
  issues... that need Rust-side fixes." Find them:
  `grep -rn "# BUG:\|// BUG:" tauri/src-tauri/` — enumerate each one with
  file:line and a one-line description in your findings doc. These are your
  best lead on real, already-flagged-by-a-human-equivalent bugs.

### Orphaned dev-server processes / environment hygiene
- `AGENT_FEEDBACK.md` documents orphaned `backend.server` test subprocesses
  surviving killed shell sessions and squatting on ports >24h, and OOM kills
  when running the full pytest suite alongside a resident dev server. Not
  app bugs exactly, but worth a `just test-split` recipe or a pre-test
  cleanup step in the e2e conftest — cheap fix, log it as a recommendation.

## Connection flakiness — where to look

You (Ehis) reported the connection is flaky "at times." Here's the actual
plumbing, so the investigating agent isn't starting blind:

1. **Frontend server URL resolution** — `app/src/stores/serverStore.ts`,
   `getDefaultServerUrl()`. In prod it branches on `window.location.protocol`,
   `origin`, and whether `hostname === "tauri.localhost"`. If a user runs in
   "remote" mode (`mode: "local" | "remote"` in the same store) against a
   self-hosted backend, trace whether URL resolution can pick the wrong
   branch and silently point at the wrong host. This is the single most
   likely source of "sometimes it just doesn't connect."

2. **SSE generation-progress stream** —
   `app/src/lib/hooks/useGenerationProgress.ts`. Has `MAX_SSE_RETRIES = 3`,
   `SSE_RETRY_BASE_MS = 2000` (exponential backoff), plus a separate
   `fetchChunkWithRetry` (3 retries, 500ms base) for streaming-chunk HEAD
   requests that race slow disk writes. **Check what happens after retry
   exhaustion** — does the UI show a clear "generation lost, retry?" state,
   or does it fail silently, which is exactly what "flaky" feels like from
   the outside? Trace `eventSourcesRef` / `retryCountsRef` cleanup too —
   confirm an EventSource that gives up is actually removed from the map
   and doesn't leave a zombie listener.

3. **Backend SSE heartbeat** — `backend/routes/events.py`, `/events/speak`.
   Sends a `ping` event every 15s specifically so reverse proxies don't reap
   idle connections. If you deploy behind any proxy (nginx, Cloudflare) with
   a shorter idle timeout than 15s, or the client-side EventSource has its
   own timeout that doesn't match, that's a flakiness source. Confirm what's
   actually in front of this in each deployment target.

4. **Model lifecycle circuit breaker** —
   `backend/utils/model_lifecycle.py` has a real circuit breaker
   (`_CIRCUIT_BREAKER_THRESHOLD = 3` failures, `_CIRCUIT_BREAKER_COOLDOWN = 300`
   seconds). If a model backend fails 3 times, it stops trying for 5 minutes.
   **Check whether the frontend surfaces "this model is temporarily
   unavailable, retry in N minutes" anywhere**, or whether a request during
   that cooldown just... fails, looking like a random connection drop rather
   than an intentional backoff. This is a strong candidate for "flaky" —
   it's not flaky, it's a working circuit breaker with no UI for it.

5. **Idle-unload during active use** — same file,
   `IDLE_TIMEOUT_SECONDS = 300` (5 min), `POLL_INTERVAL_SECONDS = 30`.
   `ALWAYS_ON_ENGINES` is intentionally empty — everything idle-unloads,
   including the planner LLM. Confirm `mark_model_used()` is actually called
   at the *start* of every inference path (not just on completion) — if any
   route forgets to stamp usage before a long-running generation, the model
   could unload mid-request. Grep every backend route file under
   `backend/routes/` for calls into the lifecycle manager and cross-check
   against every route that triggers inference.

## Deliverable

A single markdown findings doc, one section per bug, each with:
severity (blocking / degraded UX / cosmetic), file:line, repro steps if
known, and a one-line proposed fix direction (not the fix itself). Flag
anything you're not confident about as "needs human verification" rather
than guessing — this repo enforces zero placeholders and a working CI gate,
so don't introduce speculative fixes that could trip it.
