# Loop log — 20-component-wiring-and-integration

## 2026-09-05 — PLAN
Re-read Context: two-directional (orphaned components, stranded endpoints). Reuse API layer; confirm survival first.

## 2026-09-05 — unit-by-unit SELF-VERIFY
| Unit | Check | Result |
|---|---|---|
| Client layer confirmed | `app/src/lib/api/` intact: 22 typed files (clientCore/Models/Audiobooks/Dubbing/Agents/Content/Crashes/Diarize/Help/Library/Memory/Profiles/Providers/Skills/Spatial/StoriesA/B/ADR/Captures/Channels/Generations + types) + `fetchWithAuth` blob routing (commit `493bbb3`). OpenAPI-diff freshness NOT re-run in this pass | IN PROGRESS (layer survives + improved; current-diff pending) |
| Coverage diff run | 2026-09-04 wiring audit: 428 OpenAPI paths, 98 stranded = "UI not rebuilt yet" (expected mid-flight, allowlist = webhooks/MCP/schema). Stranded→04-audit feed linkage NOT verified item-by-item | IN PROGRESS (report exists; feed linkage pending) |
| CI wiring script | `scripts/check-wiring.py` EXISTS. Deliberate-orphan + deliberate-stranded catch test NOT performed | IN PROGRESS (script yes, self-test no) |
| DoD spot-check | "Reachable and wired" on 3 done screens NOT spot-checked | NOT STARTED |

## AUDIT checkpoint
Re-run wiring script per 03 screen batch: cadence not yet demonstrated. Open.

## 2026-09-05 — LIVE RUN
`python scripts/check-wiring.py` → 74 routers, **434 OpenAPI paths** (was 428 on 2026-09-04 — backend grew),
98 stranded (stable), classifications STRANDED/ORPHANED/UNWIRED/HANDROLLED all emitted, exit non-zero
= failing loudly by design mid-flight. The script demonstrably RUNS and classifies; the deliberate
orphan/stranded self-test and the per-batch cadence remain open.

## 2026-09-09 — unit 3 (deliberate self-test, closes) + hardening
Ran `python scripts/check-wiring.py --self-test`: 3/3 PASS as-is (exit 0).
But close reading found the "stranded catch" test only counted the live
mid-flight routes (not a controlled input) and orphan detection passed via
an accidental `_` variable that shadowed the `nowhere` list (a latent
NameError in the false branch). Hardened to a TRUE deliberate catch-test:
- Test 1 (orphan): temporary never-imported page under features/_selftest
  must appear in ORPHANED (nowhere) or UNWIRED — fixed the `_` reference.
- Tests 2-4 (stranded/covered/allowlist): monkeypatch `openapi_paths` +
  `client_literals` with a CONTROLLED route set (one uncalled, one
  client-covered, one /mcp-allowlisted) and assert each lands in the right
  bucket — deterministic, no dependence on the mid-flight count.
SELF-VERIFY: `--self-test` → 4/4 PASS, exit 0. ruff clean + formatted.
Also re-ran normal mode: 467 OpenAPI paths (was 434 — backend grew), 100
stranded, 0 orphaned, 102 UNWIRED (advisory mid-rebuild). Exit checklist box
1 now demonstrably closes.

## 2026-09-09 — unit 4 (DoD spot-check on 3 done screens, closes)
Criterion (now explicit in 03's checklist): reachable = mounted in
`app/src/router.tsx`; wired = data flows through `app/src/lib/api/`
(directly or via `lib/hooks`), no raw fetch except sanctioned blob/save
URL-builder downloads.
| Screen | Reachable | Wired |
|---|---|---|
| /generate → GeneratePage (index route "/") | PASS (router.tsx:512-516) | PASS via `lib/hooks/useProfiles` → apiClient (0 raw fetch) |
| /captures → CapturesTab (router.tsx:561-563) | PASS | PASS: 7 apiClient calls; single raw `fetch(apiClient.getCaptureAudioUrl(...))` is the sanctioned save-to-file download |
| /audiobooks → AudiobooksTab (router.tsx:547-549) | PASS | PASS via `lib/hooks/useAudiobooks` → apiClient (0 raw fetch) |
→ 3/3 PASS. "Reachable and wired" recorded as explicit DoD in 03's exit
checklist (prompt 20 scope item 2 delivered).

## Exit checklist
- [x] Script catches both modes (deliberate self-test 4/4, hardened 2026-09-09)
- [ ] Zero stranded unaddressed (100 pending = rebuild queue, correctly NOT forced to zero mid-flight; falling toward allowlist is the 03-completion signal)
→ FILE COMPLETE for units 3-4. Only the long-running 03-completion signal remains.
