# Loop log — 01-audit-bugs-and-connection-reliability

## 2026-09-05 — PLAN
Re-read Context + Scope. Step 0 equivalent: confirmed prior audit docs exist
(`docs/reports/2026-09-03-redesign-audit.md` 17KB, `2026-09-04-redesign-audit-followup.md` 11KB,
`2026-09-04-typecheck-triage.txt`, `2026-09-04-wiring-audit.txt`). Repo state moved since
(420 tsx, Paddle cutover, reliability round 2, localization to 9 locales). Re-verify each unit
against CURRENT tree, not the September-3 snapshot.

## 2026-09-05 — unit 1 (package-manager chaos audit)
PLAN: re-checked root package.json, lockfiles, CI workflows.
EXECUTE: prior slices already did the work; verify only.
SELF-VERIFY:
- `bun.lockb`/`bun.lock`: absent. `app/pnpm-lock.yaml`: absent. `package-lock.json`: present (root).
- root workspaces: `["app","tauri","landing","docs"]` — no `"web"` entry. PASS (fixed).
- CI (`ci.yml`, `build.yml`): `actions/setup-node@v4` + `npm ci`, zero `setup-bun`. PASS.
- `DEPLOY.md` (2026-09-04): "Local dev is npm-only — no bun, no pnpm." PASS.
→ PASS. Finding stays in the findings docs as resolved.

## 2026-09-05 — unit 2 (duplicate payment implementation trace)
PLAN: trace callers of both checkout paths + tax helper.
EXECUTE: verify-only.
SELF-VERIFY:
- `backend/services/checkout.py`: DELETED (Test-Path False). `backend/services/tax.py`: DELETED.
- `marketplace/marketplace_server/routes/checkout.py`: Paddle Billing (`payment_provider="paddle"`, `paddle.price_id_for`).
- `app/src/lib/marketplace.ts`: fetches `${base}/v1/catalog` + `/v1/checkout` on `marketplace.21labs.app` (prod URL unchanged per RENAME_LOG DNS rule).
- Commit `85a8c90 Payments: Paddle Billing replaces PayProGlobal/Stripe` in history.
→ PASS. Live path = Paddle via marketplace service; Stripe in-repo path removed (feeds 10's exit checklist).

## 2026-09-05 — unit 3 (i18n duplicate-key check)
PLAN: check ALL locale files (prompt says 4; tree now has 9 after localization slice).
EXECUTE: iterated all 9 `translation.json` files for top/captures/mcp `sidebar`.
SELF-VERIFY: all 9 locales: `top=True, captures.sidebar=False, mcp.sidebar=False`.
The 3-`sidebar` trap is GONE — better than the prompt's baseline. PASS (resolved).

## 2026-09-05 — unit 4 (test isolation bug fix)
PLAN: file moved since prompt (`hooks/__tests__/` → `app/src/test/useGenerationForm.test.ts`).
EXECUTE: verify-only.
SELF-VERIFY: `beforeEach` re-applies default `useUIStore` mockImplementation with an explicit
comment ("vi.clearAllMocks() does NOT reset a mockImplementation set by a previous test").
This is exactly one of the two fixes the prompt allowed (explicit re-mock in beforeEach). PASS.
REMAINING: run it 5x + interleaved per the verify column — queued as the only open item for this unit.

## 2026-09-05 — unit 5 (Rust `# BUG:` enumeration)
PLAN: `grep -rn "# BUG:|// BUG:" tauri/src-tauri/`.
SELF-VERIFY: count = 0. Either fixed or the comments were removed during hardening.
Findings docs (2026-09-03-redesign-audit) predate this; no live `# BUG:` markers remain. PASS (zero matches = nothing left to enumerate).

## 2026-09-05 — unit 6 (connection-flakiness candidates)
Verdicts with evidence (current tree):
1. serverStore URL resolution — remote-mode guard exists (`mode==="remote" && isLoopbackServerUrl`,
   `getDefaultServerUrl()`); reliability commit `976912c` ("Reliability round 2: remote-mode, SSE fallback"). CONFIRMED + ADDRESSED.
2. SSE retry exhaustion — `MAX_SSE_RETRIES=3`/`SSE_RETRY_BASE_MS=2000` intact; NEW S1 fallback poll
   after exhaustion watches terminal state via REST (`finishFailed` with titles, `Generation not found/failed`). CONFIRMED + ADDRESSED (no longer silent).
3. Backend SSE heartbeat — `events.py` still yields `ping` on 15s timeout. CONFIRMED present; proxy-timeout mismatch remains deployment-specific (documented, not code-fixable here).
4. Circuit breaker UI — NEW: `clientCore.ts` maps `engine_circuit_open` → `err.circuitOpen=true`,
   skips pointless retries on 503 cooldown; `errors.ts` ENGINE_CIRCUIT_OPEN surfaces engine name + retry seconds. CONFIRMED + ADDRESSED (was the "no UI" gap).
5. Idle-unload mid-request — `mark_model_used` callers present in 15+ route sites
   (assistant_stream, diarization, generate, generations, llm, streaming_stt, transcription, transcript_edit). Full route-by-route cross-check vs every inference route still open (shared with 06 unit 1).
→ 4/5 fully verified; item 5 needs the exhaustive route cross-check. Unit overall: IN PROGRESS.

## AUDIT checkpoint (every 3 units)
- Package-manager files: bun/pnpm absent, single lockfile, CI npm-only — resolved, no regress.
- Placeholder sweep: gate `backend/scripts/check_placeholders.py` still referenced as enforced; no new markers introduced by verify-only work.
→ PASS, counts only moved toward resolved.
