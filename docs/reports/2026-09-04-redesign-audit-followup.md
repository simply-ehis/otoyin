# Redesign Audit — Follow-up Pass (2026-09-04)

Follow-up to `docs/reports/2026-09-03-redesign-audit.md`. That pass's fixes
were re-verified; this doc records what is now confirmed FIXED, what is
STALE (prompt premise no longer true), and NEW findings with file:line
evidence. Nothing here auto-applies fixes except where noted.

## Re-verified FIXED (no action)

| # | Claim (01) | Current state |
|---|---|---|
| P1 | Package-manager chaos (bun+pnpm+npm) | FIXED. Root `package.json` npm-only, workspaces `[app, tauri, landing, docs]`, single `package-lock.json`. No `bun.lock*`/`pnpm-lock.yaml` remain. CI (`build.yml`, `ci.yml`) uses `actions/setup-node@v4`, no `setup-bun`. `justfile` npm-only. Residual: one cosmetic log string in `scripts/setup-dev.js:78` (`'bun run lint && …'`), `AGENT_FEEDBACK.md:33,50` (history, keep), `IMPACT_MAP.md:172` (update wording). |
| P2 | Broken `"web"` workspace entry | FIXED. Workspaces list has no `web`. `marketplace/web/` exists as its own app. |
| P3 | i18n triple-`sidebar` gotcha | FIXED. All four locales (`en`, `ja`, `zh-CN`, `zh-TW`) have exactly one top-level `sidebar`; no nested `captures.sidebar` / `mcp.sidebar`. |
| P4 | `useGenerationForm.test.ts` mock leak | FIXED. `beforeEach` re-applies the default `useUIStore` mock with an explanatory comment (`app/src/test/useGenerationForm.test.ts:50-60`). |
| P5 | Rebrand identifiers | DONE per `RENAME_LOG.md` (commit `203ce35`). `backend/main.py:21-35` reads `OTOYIN_*` first with legacy fallback + warning; `serverStore.ts:52-68` canonical `isLoopbackServerUrl` with legacy alias. |
| P6 | Tokens / canonical library (04) | IN PROGRESS. `app/src/styles/tokens.css` (semantic roles, 3-step radius/elevation, motion tokens, focus ring) + `docs/design/proof/proof.html` exist. `app/src/ui/` has 22 primitives. Not yet wired into `router.tsx`; `layouts/` not started. |

## STALE leads (do not chase)

- **Rust `# BUG:` comments (`tauri/src-tauri/`)**: zero matches for `BUG` in
  `tauri/src-tauri/` today. Either fixed in the audit-fix commit or moved.
  Needs human verification only if someone remembers what Patchi flagged.
- **Old-tree translucency scope ("58 files")**: the old tree was restored
  (`ba07d00`) and the 16-file tweak pass rejected per `REBUILD_LOG.md`. New
  `ui/` code has no `backdrop-blur` / `bg-*/NN` fills (verified: zero matches
  in `app/src/ui/`). Audit the old tree only as screens are replaced.
- **"275 components, 18 tests"**: now 285 tsx + 18 frontend / 129 backend
  tests. `ui/` primitives have **zero** tests — that, not the old count, is
  the live gap (see 14 below).

## NEW findings
### Connection reliability

**F1 — blocking. `getDefaultServerUrl()` returns frontend `origin` as backend
URL** (`app/src/stores/serverStore.ts:40-47`). In any PROD remote-web deploy
where frontend and backend hosts differ, the branch silently drops the real
backend host/port and `VITE_SERVER_URL`. Fix: never derive backend from
`window.location.origin`; require explicit persisted `serverUrl` when
`mode === "remote"`.

**F2 — blocking. `setMode("remote")` keeps the loopback URL**
(`serverStore.ts:86-97`, toggled at `GeneralPage.tsx:256-257`). UI says
remote while `serverUrl` stays `http://127.0.0.1:17493`. Fix: on →remote,
restore last remote URL or block until a LAN URL is entered.

**F3 — degraded. `mode` is write-only.** No consumer branches on it
(`clientCore.ts:98-101` reads only `serverUrl`). The toggle misleads. Fix:
couple `mode ↔ isLoopbackServerUrl(serverUrl)` or remove the flag.

**F4 — degraded. `isLoopbackServerUrl` requires port `:17493`**
(`serverStore.ts:56`). Custom-port local backends read as non-loopback and
`setMode("local")` clobbers them. Fix: match hostname, make port configurable.

**S1 — degraded. SSE exhaustion drops progress + story link**
(`useGenerationProgress.ts:356-369`). After 3 retries (2s/4s/8s) the toast
"Connection lost" fires, pending state is discarded, history refetched; a
story add silently unlinks even if the backend later completes. Fix: keep
`pendingStoryAdds`, poll `GET /history/{id}` as fallback.

**S4 — degraded. Heartbeat asymmetry.** `/events/speak` pings every 15s
(`backend/routes/events.py:35-38`) but generation SSE keepalives every 30s
(`backend/routes/generations.py:523-525`). Proxies with <30s idle timeouts
cause needless retries. Fix: align generation keepalive to ≤15s named `ping`.

**C1 — degraded. Circuit breaker has no UI.** Backend emits distinct
`503 {code: engine_circuit_open, retry_after_seconds}`
(`backend/backends/registry.py:230-242`); frontend has no branch for it
(`errors.ts:255-326` falls through to `UNEXPECTED_GLITCH`) and `clientCore`
only handles generic 503-with-`Retry-After`-header. Users see a random
failure, not "unavailable, retry in N min". Fix: branch on
`detail.code === "engine_circuit_open"`, surface `retry_after_seconds`, skip
auto-retry until cooldown. (Implemented this pass — see 06.)

**M1 — degraded. Missing `mark_model_used()` at inference start** (idle-unload
mid-request risk, `IDLE_TIMEOUT_SECONDS=300`, poll 30s). NO-stamp handlers:
`transcription.py:119 transcribe_audio_path`, `transcription.py:169
export_subtitles_route`, `diarization.py:142 diarize_audio_path`,
`generations.py:273/371/410` (stamp deferred to worker),
`generations.py:554 stream_speech`, `assistant_stream.py:75 stream_local`,
`transcript_edit.py:29,69`, `audio_pipeline/effects.py:302
apply_audio_tags_route`, `streaming_stt.py:158/205`. (Implemented this pass —
see 06.)

### Dead code (confirm for 10)

- `backend/services/checkout.py` (305 lines, Stripe) has **zero callers** in
  `backend/` — unreachable. `backend/services/tax.py` (287 lines, Stripe Tax)
  likewise unreferenced by any route. Flag both for removal under the payments
  migration once the provider decision lands; do not delete here.

### 08 note
- `backend/services/announcements.py` already implements local
  `content.json` + optional remote merge via `OTOYIN_NOTICES_URL`
  (`refresh_remote_announcements`, wired in `backend/app.py:573-581`,
  served by `backend/routes/content.py:21-36`). The "build from scratch"
  premise is stale — remaining work is client inbox wiring + documenting the
  env var (see `12-deployment-and-setup` slice this pass).

## Pre-existing test failure (not caused by this pass)

- `backend/tests/test_generation_context.py::TestGenerationContextFromDB::test_from_db_handles_none_fields`
  fails on unmodified HEAD too (verified via `git stash`): `from_db` defaults
  `engine` to `""`, test expects `"kokoro"`. Fix the test expectation or the
  default — do not "fix" by touching the new `mark_model_used` stamps.

## Implemented this pass (2026-09-04 session)

- **M1 stamps** — `mark_model_used()` added at inference start in:
  `transcription.py` (2 handlers), `diarization.py` (path handler),
  `transcript_edit.py` (2 handlers, `"faster-whisper"`),
  `assistant_stream.py` (`"gguf_llm"`), `audio_pipeline/effects.py`
  (`data.engine`), `streaming_stt.py` (`_transcribe_buffer`),
  `generations.py` (generate/retry/regenerate/stream),
  `models/load_unload.py` (explicit load). Verified: `py_compile` clean,
  targeted pytest green (39 passed; 1 failure pre-existing, see below).
- **C1 circuit UI** — `clientCore.ts` branches on
  `detail.code === "engine_circuit_open"` (message + `retry_after_seconds`,
  `circuitOpen` flag, auto-retry skipped); `errors.ts` gains
  `ENGINE_CIRCUIT_OPEN` + inference that preserves the server text.
- **14 floor** — new `app/src/ui/overlays.test.tsx` (dialog/tabs/slider/
  select, 9 tests); `scripts/check-ui-test-floor.py` + advisory CI job;
  `setup.ts` gains jsdom shims Radix needs (ResizeObserver,
  scrollIntoView, pointer-capture trio). ui/ suite: 47/47 green.
- **SearchInput uncontrolled fix** — clear button now works with
  `defaultValue` (was controlled-`value`-only); fixes the failing
  `ui.test.tsx` search test from the parallel rebuild slice.
- **20 wiring** — `scripts/check-wiring.py` (OpenAPI vs client literals +
  hand-rolled caller detection + orphan tiers) + `docs/reports/
  2026-09-04-wiring-audit.txt`: 422 paths, 96 stranded (mostly "UI not
  rebuilt yet", feed into 04 exposure audit), 14 hand-rolled (instruments,
  voice-changer, dubbing/effects previews → move into `lib/api`), 1 true
  orphan (`features/settings/TimecodePage.tsx`), 27 unwired (expected
  until router repoint lands). Advisory CI job added.
- **16 deps** — `security-audit` CI job (`npm audit --audit-level=high` +
  `pip-audit`) + `.github/dependabot.yml` (npm/pip/cargo/actions).
  MCP trust model verified: in-process `/mcp`, loopback-bound with the
  backend, client-id header is identification not auth — remote-mode
  exposure rides on the F1–F4 serverStore rework.
- **19 repro** — `tauri/src-tauri/rust-toolchain.toml` (1.97.0),
  `check-env.sh`, Cargo description casing. No string-concat path
  building found in services/routes. Python lockfile NOT generated (no
  canonical venv in this env — must come from a full backend install).
  `jsonschema` imported by `plugins_marketplace` is not in
  `requirements.txt` (undeclared dep — fix by adding it).
- **02 remainder** — cargo package name stays `labs21` + Tauri id
  `com.21labs.app` per RENAME_LOG's deferred build-coordination slice.

## Fix-everything pass (2026-09-04, user-directed)
- **useGenerationForm ×13 green.** The hook resolves engines from the
  `["modelStatus"]` query cache; tests never seeded it. Seeded a downloaded
  kokoro in the 7 submitting tests (no-engine tests stay unseeded).
- **Zod systemic fixed (all TS2345 ZodObject/ZodEffects gone).** Root cause:
  hoisted `@hookform/resolvers` resolved `zod` to root `zod@4.5.4`
  (via docs' fumadocs) while app code uses nested `zod@3.25.76`. Fix:
  root `package.json` now depends on `zod ^3.25.76` directly, so the
  hoisted copy is v3 and docs keeps a nested v4. No schema code touched.
- **Remaining: 70 errors, all outside my lanes** (raw list:
  `docs/reports/2026-09-04-typecheck-triage.txt`). ~40 are mechanical
  unused imports, ~30 semantic (undeclared names, missing exports,
  redeclared `designEngine`, wrong route literals) — concentrated in the
  parallel slices' **uncommitted** feature files. Bulk-editing those now
  would collide with in-flight work for zero green payoff (CI stays red
  until the semantic ones are resolved by the author anyway). Left for
  the slice owner; the per-slice typecheck gate (CI `frontend-typecheck`)
  already flags them.
- **`ui/form.tsx`**: removed one unused import (canonical lib, stable file).

## Pre-existing failures (not mine, do not "fix" blindly)

- `test_generation_context.py::...test_from_db_handles_none_fields`
  (fails on unmodified HEAD; `from_db` defaults `engine` to `""`).
- `useGenerationForm.test.ts` (7 failures): engine resolves undefined,
  `getModelStatus` never called — the generate-feature slice changed
  hook resolution; test updates belong to that slice's owner.

## Parallel-session note

Rebuild slices 1–3 landed in HEAD mid-session (tokens/ui/layouts/
settings/generate). I kept to additive lanes (backend stamps, scripts,
CI, docs, ui tests) and fixed only objectively-broken shared code
(unused import, SearchInput uncontrolled, jsdom shims). The 96 stranded
endpoints and 27 unwired pages are that session's backlog, tracked by
`scripts/check-wiring.py` — re-run as screens land.

## Proposed fix directions (not yet done)

- F1–F4: serverStore remote-mode rework (needs product decision on remote UX).
- S1/S4: SSE fallback polling + keepalive alignment.
- 14: `ui/` primitives need render + interaction tests (zero today).
- 20: OpenAPI-vs-client drift script (scripted this pass).

## Status update 2026-09-05 (later sessions supersede the proposal list above)

- F1–F4 serverStore rework: DONE (no origin-derived URLs, mode follows URL, remote restore + hint).
- S1/S4: DONE (REST fallback poll keeps story links; keepalive 15s; S3 audible).
- 14 ui floor: DONE — 26/26 canonical primitives tested, CI gate blocking.
- Paddle cutover + Stripe deletion + donations + regional display pricing: DONE.
- Story portability (.dstf.zip) + backup docs: DONE. Crash reporting pipeline: DONE.
- i18n: 9 locales registered; ja/zh 123-key backlog; 5 mirrors await human review.
- Pre-existing failures then open (test_from_db, useGenerationForm) have since been fixed; remaining typecheck tail lives in in-flight slice files (see triage report).

### For the IMPACT_MAP owner (map left untouched — parallel rewrite in flight)

Structural deltas to fold in when convenient:

- **Payments are Paddle-only.** `marketplace_server/paddle.py` (transactions,
- **Crash reporting (opt-in, no SaaS).** Backend `services/crash_reports.py`
- **i18n: 9 locales.** `app/src/i18n/index.ts` registers
- **Story portability.** `export_story_to_zip`/`import_story_from_zip` in
- **Reliability.** `mark_model_used()` at every inference start;
- **Regional pricing (display-only).** `app/src/lib/regionCurrency.ts`
- **Test gates (CI).** Blocking: ui component floor
- **Deps.** Root `zod ^3.25.76` pin (fixes hoisted-v4 resolver mismatch);
