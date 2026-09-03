# Redesign Audit — Bug Audit + Connection Reliability

**Date:** 2026-09-03
**Scope:** find-and-report pass (no fixes merged here). Frontend `app/src/components/` was empty at audit time (redesign pivot — 342 files archived to `archive/frontend-components/`); component code was audited via the archive copy.
**Baselines read:** `AUDIT_REPORT.md` (2025-07-21, historical), `docs/reports/XXX_TODO_AUDIT.md` (2026-08-23, placeholder sweep — not re-grepped per brief), `AGENT_FEEDBACK.md` (full read).

---

## 1. Package manager chaos — CONFIRMED, blocking

**Severity:** blocking (CI cannot work as written)
**Files:**
- `package.json:5-11` — workspaces `["app","tauri","web","landing","docs"]`
- `package.json:48-50` — `engines: node >=18`, npm-style scripts (`cd app && npx tsc …`)
- `.github/workflows/build.yml:24-28` — `oven-sh/setup-bun@v2` + `bun install --frozen-lockfile` with `working-directory: app`
- `.github/workflows/ci.yml:23-27,29-55,57-69` — same bun pattern for lint/typecheck/test/build
- `app/pnpm-lock.yaml` — exists (pnpm-managed at some point)
- Root has NO `bun.lockb` / `bun.lock` / `package-lock.json` (verified absent)

**Repro / evidence:**
- `web/` does not exist at repo root (`Test-Path web` = False); `marketplace/web` DOES exist. So workspace entry `"web"` is a broken reference — either a deleted dir never cleaned up, or a misreference to `marketplace/web`.
- `bun install --frozen-lockfile` requires a bun lockfile; none exists at root or in `app/`. The only lockfile in `app/` is `pnpm-lock.yaml`, which bun does not consume. CI frontend jobs will fail or resolve uncontrolled.
- `AGENT_FEEDBACK.md` 2026-08-30 biome entry re-verified still true by construction: `app/package.json:14` script `lint: biome lint src`, but `@biomejs/biome` is only in root `package.json:44` devDependencies. Running the app script from `app/` with pnpm cannot resolve biome.

**Fix direction:** standardise on one manager (brief says npm-only), delete `app/pnpm-lock.yaml`, fix/remove `"web"` workspace entry, regenerate a single root lockfile, switch both workflows off `setup-bun`.

---

## 2. Duplicate payments — hypothesis CORRECTED: in-repo Stripe is LIVE, not dead

**Severity:** degraded UX risk (two live payment stacks), needs product decision — do NOT delete here
**Files:**
- `backend/services/checkout.py:1-60` — Stripe session creation (`STRIPE_SECRET_KEY`, `STRIPE_DEV_MODE`)
- `backend/routes/marketplace.py:109-168` — LIVE wiring: `POST /marketplace/checkout` → `create_checkout_session`, `POST /marketplace/webhook/stripe` → `handle_webhook`, `GET /marketplace/license/{order_ref}` → `poll_license`
- `backend/services/tax.py:139-175` — `calculate_tax_locally`, LIVE via `marketplace.py:205-230` (tax preview/jurisdictions/summary routes)
- `backend/services/tax.py:178-190` — `calculate_tax_stripe`: **zero callers found** outside its own fallback to `calculate_tax_locally`. Only possibly-dead Stripe function.
- `marketplace/marketplace_server/routes/checkout.py:1-60` — separate PayProGlobal stack (`POST /v1/checkout`, Vercel + Neon per `marketplace/README.md`)
- `STRIPE_TESTING.md:1-15`, `backend/tests/test_stripe_live.py:62,156`, `backend/tests/test_checkout_tax_webhook.py` — Stripe test/docs surface still maintained

**Repro / evidence:** grep for `services.checkout` / `services.tax` hits only `backend/routes/marketplace.py` (route wiring) + the two Stripe test files. No other backend route imports checkout. So the Stripe path IS reachable (3 marketplace endpoints), contradicting the "likely dead code" hypothesis.

**Fix direction:** keep both stacks documented as live until 10-payments-migration decides; if consolidating on PayProGlobal, the removal list is `backend/services/checkout.py`, `marketplace.py:99-168`, `tax.calculate_tax_stripe`, the two Stripe test files, `STRIPE_TESTING.md`, and `tax.py` Stripe-Tax docstring — needs human verification that no shipped client still calls `/marketplace/checkout`.

---

## 3. i18n duplicate-key trap — PRESENT but miscategorised; runtime-safe, editing trap only

**Severity:** cosmetic (no runtime collision)
**Files:**
- `app/src/i18n/locales/en/translation.json:2` — top-level `sidebar` (nav labels: `generate`, `audioStudio`, … plus `navigation/collapse/expand` — the 2026-08-30 fix is present)
- `en/translation.json:941` — nested explainer sidebar (voice-generation "About" panel)
- `en/translation.json:1127` — nested explainer sidebar (Captures "About" panel)
- `en/translation.json:1191` — nested explainer sidebar (MCP "About" panel)
- Identical 4-occurrence pattern in `ja`, `zh-CN`, `zh-TW` (grep hits at `876/1028/1092/1278` in each)
- Consumers (via archive, since components/ is emptied): `archive/frontend-components/*/CapturesSidebar.tsx:22` uses `t("settings.captures.sidebar.aboutTitle")`; `archive/.../MCPPage.tsx:296` uses `t("settings.mcp.sidebar.aboutTitle")`

**Repro / evidence:** the nested sidebars are NOT `captures.sidebar` / `mcp.sidebar` as `AGENT_FEEDBACK.md` described — full key paths are `settings.*.sidebar.*` vs top-level `sidebar.*`, so i18next never collides. Verified no `t("sidebar.…")` call reads the nested objects.

**Fix direction:** rename nested `sidebar` keys to `aboutPanel` (or similar) when nav copy is next touched, purely to end the human-editing trap — needs human verification with translators.

---

## 4. Test isolation bug — ALREADY FIXED, no action

**Severity:** none (resolved)
**File:** `app/src/test/useGenerationForm.test.ts:50-60`
**Evidence:** `beforeEach` calls `vi.clearAllMocks()` AND re-applies the default `useUIStore` mockImplementation (`selectedEngine: "kokoro"`) with a comment naming the exact `invalid_engine_xyz` leak from `AGENT_FEEDBACK.md`. The per-test overrides at `:103` and `:131` are therefore contained. Safe to close.

---

## 5. Rust-side `# BUG:` comments — NOT FOUND in current tree

**Severity:** needs human verification
**Evidence:** `tauri/src-tauri/` contains only `build.rs`, `Cargo.toml`, `Cargo.lock`, `tauri.conf.json`, `Entitlements.plist`, `Info.plist` — zero `src/*.rs` files. Grep for `BUG` across `tauri/` returns only false positives (`TAURI_DEBUG` contains the substring "BUG"). The "15 BUG markers" from the Patchi scan referenced in `XXX_TODO_AUDIT.md:75` do not exist in this tree — either they were fixed, or the scan ran against a different revision/sidecar path.
**Fix direction:** if a Tauri sidecar with Rust sources exists elsewhere (or in git history — note: this working copy has NO `.git`), re-run the grep there; otherwise close as stale.

---

## 6. Orphaned dev-server processes / test hygiene — PARTIALLY CORRECTED during fix pass

**Severity:** degraded UX (dev-only)
**Evidence:**
- CORRECTION (2026-09-03 fix pass): `backend/tests/conftest.py` DOES exist (the audit's "no conftest.py" came from a malformed search command, not the tree). It holds path setup plus an autouse rate-limiter reset fixture.
- `justfile:387-392` has `test` (curated subset) and `test-all` (full suite) but NO `test-split` recipe; the OOM + orphaned-`backend.server`-on-random-ports reports in `AGENT_FEEDBACK.md` (2026-08-21) have no corresponding mitigation in-tree.
- `Dockerfile:1` is now `python:3.12-slim` — the AUDIT_REPORT.md §D version-mismatch is verified FIXED.

**Fix direction:** add `test-split` recipe and a conftest/conftest-equivalent that kills processes whose cmdline matches `backend.server --port` before e2e runs.

---

## 7. Connection (1/5): server URL resolution ignores `mode`, persisted URL can go stale

**Severity:** degraded UX — strongest candidate for "sometimes it just doesn't connect"
**File:** `app/src/stores/serverStore.ts:30-48,68-81`
**Evidence:**
- `getDefaultServerUrl()` branches on `window.location.protocol/origin/hostname` (`tauri.localhost` check at `:42`) but never reads `mode: "local" | "remote"`. A user in "remote" mode against a self-hosted backend gets URL resolution that doesn't know about the mode.
- `serverUrl` is `persist`ed (`:91`) and initialised once at `:68`; `setMode` at `:81` does NOT touch the URL or invalidate queries, while `setServerUrl` at `:69-75` does. Switching mode without manually re-entering the URL leaves a stale persisted URL pointing at the wrong host — silent wrong-host connection failure.
- `isLoopbackTWENTYLABSServerUrl` (`:50-63`) exists but has no caller in this file — needs human verification where (if anywhere) the loopback check gates behaviour.

**Fix direction:** derive the default URL from `mode` (or update URL inside `setMode`) and invalidate queries on mode switch, mirroring `setServerUrl`.

---

## 8. Connection (2/5): SSE "retry" never reopens the EventSource — REAL BUG

**Severity:** blocking (generation status goes dark while UI still shows pending)
**File:** `app/src/lib/hooks/useGenerationProgress.ts:323-352`
**Evidence:**
- `source.onerror` closes the source and deletes it from `currentSources` (`:324-325`). With retries left, the `setTimeout` at `:331-335` only calls `queryClient.refetchQueries(["history"])` — it never constructs a new `EventSource`. The enclosing effect only opens sources for IDs in `pendingIdsArray` that are NOT already in `currentSources`, but the effect does not re-run (dependency `pendingIdsArray` unchanged — same id still pending), so the generation is left with NO live stream until something else touches the pending set.
- After exhaustion (`:336-351`) cleanup IS correct: maps cleared, pending removed, history refetched, destructive "Connection lost" toast shown — so exhaustion is surfaced, but the 3 "retries" before it are history-polls, not reconnects.
- Separately, streaming-chunk fetch failure (`fetchChunkWithRetry` → null at `:188-196,205-213`) silently stops streaming playback with no toast — second "flaky silence" path in the same file. (`MAX_SSE_RETRIES = 3`, `SSE_RETRY_BASE_MS = 2000`, `CHUNK_FETCH_RETRIES = 3` at `:31-34`.)

**Fix direction:** on retryable error, either re-create the `EventSource` inside the timeout or bump a retry-token state so the effect re-runs; add a toast/pending-state for chunk-fetch exhaustion.

---

## 9. Connection (3/5): SSE heartbeats exist, but no proxy timeout is configured in-tree — needs human verification

**Severity:** needs human verification (deployment-dependent)
**Files:**
- `backend/routes/events.py:35-38` — `/events/speak` heartbeat `ping` every 15s (explicit proxy-reaping comment)
- `backend/routes/generations.py:488-550` — `/generate/{id}/status` SSE: 30s `wait_for` keepalive (`:522-526` yields `: keepalive`), `X-Accel-Buffering: no` header (`:548`), no client-timeout handling
- `railway.json:1-14` — Docker deploy, healthcheck `/health` 60s; NO proxy/idle-timeout setting
- `Dockerfile:22-24` — plain `uvicorn backend.main:app --host 0.0.0.0 --port 17493` (no `--timeout-keep-alive` tuning)

**Evidence:** heartbeats exist on both streams, so idle-reaping requires a proxy with timeout < 15s (speak) or < 30s (generation status). Nothing in-repo declares such a proxy (no nginx/Cloudflare config found), and Railway's edge timeout is not pinned in-tree.
**Fix direction:** confirm the actual edge (Railway / Cloudflare / nginx) idle timeout per deployment target and either lower heartbeat below it or pin the proxy timeout above 30s.

---

## 10. Connection (4/5): circuit breaker is instrumented but NEVER consulted — dead safety logic

**Severity:** degraded UX (a real 5-minute blackout would surface as "flaky" with no UI)
**Files:**
- `backend/utils/model_lifecycle.py:50-51` — `_CIRCUIT_BREAKER_THRESHOLD = 3`, `_CIRCUIT_BREAKER_COOLDOWN = 300`
- `backend/utils/model_lifecycle.py:120-131` — `is_circuit_open()` (zero callers outside this file — grep-verified)
- `backend/backends/registry.py:281-288` — `record_load_failure` on load exception / `record_load_success` on success; no `is_circuit_open` gate before `load_model` at `:274-278`

**Evidence:** failures are counted, the open-circuit timestamp is set (`model_lifecycle.py:112`), and then nothing reads it. So today the breaker cannot cause flakiness (it never blocks) — but the moment someone wires the gate, cooldown requests will fail for 5 minutes with no frontend string for it: grep for `temporarily unavailable|retry in|cooldown` finds only an unrelated dispatcher hint (`assistant_tools/dispatcher.py:128`) and a rate-limiter message (`services/rate_limiter.py:113`). No "model cooling down, retry in N minutes" UI exists.

**Fix direction:** either wire `is_circuit_open` into the load path AND add the cooldown UI state, or remove the breaker constants/state — needs human verification which was intended.

---

## 11. Connection (5/5): idle-unload stamping — GOOD coverage on heavy paths, no missing stamp found

**Severity:** none (verified healthy)
**Evidence (`lifecycle_manager.mark_model_used` callers):**
- `backend/routes/generate.py:49,104` — TTS entry points stamp `data.engine` at start
- `backend/services/generation.py:231` — service-layer stamp (`ctx.engine`)
- `backend/routes/voice_convert.py:85,97`, `transcription.py:95`, `diarization.py:122`, `llm.py:46` — VC/STT/diarization/LLM stamp at start
- `sounds.py` (Freesound search) and `instruments.py` (numpy/SoundFont synthesis) correctly do NOT stamp — procedural, no resident ML model to protect. `IDLE_TIMEOUT_SECONDS = 300` / `POLL_INTERVAL_SECONDS = 30` (`model_lifecycle.py:41-42`) with empty `ALWAYS_ON_ENGINES` (`:47`) means a >5min generation without a start-stamp could theoretically race unload, but every long-running inference path checked stamps at request start.
- Docstring/header mismatch noted (non-blocking): `model_lifecycle.py:15` says "default 180s = 3 min" but the constant is 300s/5min.

**Fix direction:** one-line docstring correction only; no lifecycle change proposed.

---

## 12. Extra: duplicate frontend shells (`app/` vs `tauri/`) — needs human verification

**Severity:** needs human verification
**Evidence:** `tauri/package.json:1-10` defines a second frontend workspace (`@otoyin/tauri`, `dev: vite`, `build: vite build`) with a heavily overlapping dependency set vs `app/package.json`, but `tauri/src/` is EMPTY and `tauri.conf.json: build.beforeDevCommand/beforeBuildCommand` runs `bun run dev/build` (bun, again) with `frontendDist: ../dist` (i.e. `tauri/dist`) while the real app builds to `app/dist`. Which directory actually feeds the Tauri webview is unclear from the tree.
**Fix direction:** confirm the intended single frontend root and delete or document the other shell; align its build tool with §1.

---

## Confidence notes

- Items verified by direct read/grep in this tree: §§1,2,4,6–8,10,11 (file:line above).
- Items requiring a human with deployment/history access: §5 (Rust sources), §9 (edge proxy timeout), §10-intent (breaker vs removal), §12 (which frontend shell ships).
- Placeholder-marker sweeping was explicitly skipped per brief (covered by `XXX_TODO_AUDIT.md` + `check_placeholders.py` gate).

---

## Fixes applied (2026-09-03, approved fix-all pass)

- §1: removed broken `"web"` workspace from `package.json:5-10`; deleted `app/pnpm-lock.yaml`; `ci.yml` + `build.yml` switched from `setup-bun` to `setup-node:20` + root `npm install` + `npm run … --workspace=@otoyin/app`. Root `package-lock.json` NOT regenerated locally (registry unreachable from this env — `npm install --package-lock-only` timed out at 180s); generate it from CI/networked machine and commit it, then tighten CI to `npm ci`.
- §2: no deletion (needs product decision on Stripe vs PayProGlobal). Only dead item found: `tax.calculate_tax_stripe` (`backend/services/tax.py:178`, zero callers) — left in place pending that decision.
- §3: deferred to redesign (renaming locale keys now would churn 4 files with zero live consumers while `components/` is emptied).
- §6: added `test-split` (unix + windows) to `justfile` after `test-all`; added session-autouse `_cleanup_stray_servers` to `backend/tests/conftest.py` (best-effort, never fails the suite).
- §7: `app/src/stores/serverStore.ts` — extracted `LOCAL_DEFAULT_URL`; `setMode` now restores the loopback URL when switching to `"local"` (custom remote URLs untouched on the way out) and invalidates queries on every mode change.
- §8: `app/src/lib/hooks/useGenerationProgress.ts` — retry branch now bumps `retryNonce` so the effect re-runs and reopens the `EventSource` (previously history-only); added "Streaming interrupted" toasts to both chunk-fetch exhaustion branches.
- §10: wired the breaker — `ModelLifecycleManager.circuit_retry_after_seconds()` added (`backend/utils/model_lifecycle.py`); `load_engine_model` in `backend/backends/registry.py` now raises 503 `engine_circuit_open` with `retry_after_seconds` instead of failing opaquely.
- §11: fixed `model_lifecycle.py` docstring (300s = 5 min).
- Verification: `check_placeholders.py` OK; `ruff check` + `ruff format --check` clean on all touched backend files; `py_compile` clean; `pytest --co` clean; `test_model_gate.py` 12 passed (3 failures are missing third-party modules `onnxruntime`/`huggingface_hub` in system python — project venv absent in this env); `test_vram_pressure.py` async failures are missing `pytest-asyncio` in system python. Frontend `tsc`/CI not runnable here (no `node_modules`, no registry); CI is the proof gate.
- §5/§9/§12: unchanged, still need human verification.
