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

## 2026-09-09 — unit 4 (test isolation: repeat-run verdict, closes the queued item)
PLAN: run `app/src/test/useGenerationForm.test.ts` 5× consecutively + interleaved with sibling suites per the verify column.
EXECUTE: `npx vitest run` ×5 (13/13 each), then interleaved batch with `generationStore.test.ts`, `clip.test.ts`, `i18n.test.tsx`.
SELF-VERIFY: 5 consecutive runs PASS (13/13 each, timings 182ms–1013ms, no flake); interleaved run 4 files / 42 tests PASS in one session — store mock re-application holds under shared-module pollution.
→ PASS. Unit 4 CLOSED. The beforeEach explicit re-mock is sufficient; no further isolation work needed.

## 2026-09-09 — unit 3 re-check on current tree (was 2026-09-05)
PLAN: re-scan all locale files for duplicate keys + the top/captures/mcp `sidebar` trap.
EXECUTE: JSON parse with object_pairs_hook dup detection across all 9 locales (de, en, es, fr, ja, ko, pt-BR, zh-CN, zh-TW).
SELF-VERIFY: duplicate keys NONE in all 9; `captures.sidebar`/`mcp.sidebar` absent in all 9. Structural delta: the `top` section no longer exists (flattened to root keys by the i18n refactor) — noted, not a problem.
→ PASS (re-confirmed on current tree).

## 2026-09-09 — unit 6 item 5 (exhaustive mark_model_used route cross-check; closes unit 6)
PLAN: enumerate every route/service path that runs inference on a lifecycle-registered engine and verify a mark covers each.
EXECUTE: (a) listed route files via router decorators; (b) narrowed to files touching backend execution primitives (get_*_backend / ensure_loaded / model_manager); (c) for each NO-MARK file, traced whether it (i) runs inference itself on a registered engine, (ii) delegates to a marked shared path, or (iii) is a status/management endpoint.
SELF-VERIFY:
- Delegation-only (covered, no change): `routes/assistant.py` → `assistant_stream.stream_local/stream_api` (mark inside `stream_local`); `services/audiobook_render.py` → `generation.run_generation` → `_synthesize_local` (marks ctx.engine); `routes/batch.py`/`scripting.py` → batch jobs (same canonical paths).
- Non-inference (no change): `routes/health.py`, `routes/generations.py /tts/status` + `/tts/engines`, `routes/models/*` (status/download/load-unload), `utils/model_status.py` (`is_engine_cached` resolves backends on poll — must NOT mark or idle eviction never fires).
- Unregistered direct loaders (no change): demucs/deepfilter paths in `services/stem_separation*.py`, `services/deepfilter_onnx.py` — engine-agnostic manager has no registration for them (documented limitation, not a gap).
- **GAPS FOUND + FIXED (6 sites, this commit):**
  1. `services/dubbing.py::_synthesize_segments` — per-engine TTS synth never marked → added mark(engine).
  2. `services/captures.py` transcribe path (no-arg whisper via `get_whisper_model`) → mark("whisper").
  3. `services/audiobook_llm.py::llm_extract_characters` — gguf_llm character extraction → mark("gguf_llm").
  4. `services/voice_chat.py` LLM turn (`get_llm_backend`) → mark("gguf_llm").
  5. `services/voice_chat.py::_synthesize_speech` (no-arg TTS) → mark via new `resolve_tts_engine_of(backend)` reverse lookup.
  6. `services/voice_chat.py::_synthesize_speech_streaming` — same reverse lookup.
  plus `routes/vocal_qa.py` — faster-whisper with-words transcription → mark("faster-whisper") (7th site).
- New registry helper `resolve_tts_engine_of(backend)` in `backends/registry.py` (exported via `backends/__init__`): reverse-lookup engine name from `_tts_backends` by instance identity; "" when unregistered (callers skip the mark). Centralizing marks in the resolvers was REJECTED deliberately: `utils/model_status.is_engine_cached` calls `get_tts_backend_for_engine` on every status poll — a resolver-level mark would defeat idle eviction entirely.
- Verified: ruff clean on all 7 files, ast parse OK, helper importable from both paths, registered-mark stamps `last_used`, unregistered-mark is a safe no-op, and every patched site obtains its backend via a registry getter (which registers) BEFORE marking.
→ PASS. Unit 6 CLOSED (5/5 items verified; the two real code gaps found are fixed in code, not just documented).

→ UNIT SUMMARY 2026-09-09: units 1–6 all PASS. Prompt 01 → DONE (findings docs + this log are the audit trail).
