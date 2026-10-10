# Loop log — 08-notifications-backend

## 2026-09-05 — PLAN
Re-read Context: zero push infra at audit time; polling-first recommendation; reuse marketplace service.

## 2026-09-05 — unit-by-unit SELF-VERIFY
| Unit | Check | Result |
|---|---|---|
| announcements.py state | READ FIRST per file: bundled offline `backend/data/content.json` + `_DEFAULT_CONTENT` fallback; REMOTE merge via `OTOYIN_NOTICES_URL` (`refresh_remote_announcements()`); server routes `marketplace_server/routes/notices.py` (GET/v1/notices lineage). Matches the file's recommended shape (marketplace-hosted table, no separate service) | PASS (already covers the need; extended, not rebuilt) |
| Backend endpoint e2e | Remote notice → client within interval: code path exists; live push test NOT logged | IN PROGRESS |
| Inbox UI | `AnnouncementBanner.tsx` exists; floating/blur-grep conformance for it NOT scoped-run | IN PROGRESS |
| Offline degradation | Module docstring: "any failure keeps bundled content untouched" (offline-first by construction); disconnected-network manual test NOT logged | IN PROGRESS (code yes, demonstration no) |

## AUDIT checkpoint
Re-run e2e push after any backend/client change: no changes made in this pass. PASS (vacuous).

## Exit checklist
- [ ] Remote notice reaches app without update (code yes, live proof no)
- [ ] No floating pattern (pending scoped grep)
- [ ] Silent offline degradation (code yes, manual test no)
→ FILE IN PROGRESS. All three opens are demonstrations, not builds.

## 2026-09-07 — E2E + conformance run (all three opens demonstrated)
`backend/tests/test_notices_e2e.py` (marked `e2e`, excluded by default addopts) — same real-process topology as the 07 catalog E2E:
- [x] **Remote notice reaches app without update**: fake notices server (ThreadingHTTPServer) + real backend subprocess; startup merge delivers a NEW remote id (appended last per merge ordering) and a same-id REPLACEMENT of `offline-promise` (remote text wins in place); `/content/offers` + `/content/whats-new` untouched; 'Merged N remote notice(s)' info log present; same process, no restart.
- [x] **No floating pattern**: scoped grep on `layouts/Banner/AnnouncementBanner.tsx` — zero blur/floating/bg-white-NN/bg-black-NN/backdrop hits.
- [x] **Silent offline degradation**: second backend boots with the notices URL on a dead port — app healthy, bundled content served exactly, failure visible ONLY as the debug-level breadcrumb (invisible at default INFO level, no Traceback, no ERROR line) — the silence is the contract, asserted in the test.
FINDING: the merge is **startup-only** — no periodic poll and no nudge endpoint exist (unlike the 07 catalog), so a notice published while the app runs appears on next launch, not 'within an interval' as the unit description assumed. Either add a poll (mirror 07's REMOTE_REFRESH pattern) or record startup-only as the intended contract. → FILE IN PROGRESS (one decision left).

## 2026-09-09 — DECISION + implementation: startup-only merge replaced by startup + periodic poll
DECISION (closes the last open item): add the 07-style periodic poll — startup-only is NOT the contract.
Rationale (recorded for the trail):
1. The unit's own scenario is time-sensitive ("Scheduled maintenance tonight — exports may be slow"): a user in a multi-hour session (normal for an audio studio) must receive it mid-session; next-launch delivery fails the need.
2. Cost is minimal: ~10 lines in app.py reusing the proven 07 loop shape (sleep-first tick, failure-silent `asyncio.to_thread` call). No staleness/signature machinery needed — notices are tiny, unsigned, and the merge is idempotent (same-id replaces in place).
3. Frontend wiring is already live (`useAnnouncements` React Query; the banner re-renders when the query refetches) — the poll alone completes the pipeline with zero frontend changes.
The SSE option (the prompt's near-real-time alternative) stays rejected: a persistent connection for a "nice to have" surface contradicts 08's own simplicity note.

IMPLEMENTATION:
- `services/announcements.py`: `NOTICES_POLL_S` (`OTOYIN_NOTICES_POLL_S`, default 1h); docstring updated to startup + poll, idempotent.
- `app.py`: `_bg_refresh_remote_notices` merges once at startup, then loops sleep-first — a failure on one tick retries on the next tick instead of after a full interval; still debug-silent offline.
- E2E Flow C (`test_notices_e2e.py`): backend booted against an EMPTY fake with a 3s tick; the notice is published AFTER boot; asserts same-process delivery via the poll (real second HTTP fetch), merge ordering intact, bundled items untouched, and idempotent no-op across ticks.

REGRESSION FOUND + FIXED (root cause of the first red run): commit `390a01d` (2026-09-08 security hardening) added the SSRF guard to both refreshers AFTER these E2Es last ran green — loopback fakes now fail `is_url_safe` before any fetch (evidence: `WARNING: Remote notices URL failed SSRF check` in app.log, `served=0`). A probe confirmed the 07 marketplace E2E was broken the same way (`test_force_refresh_bypasses_freshness` FAILED). Fix: `OTOYIN_SSRF_ALLOW_LOOPBACK` env escape hatch in `utils/ssrf.py` (read once at import; scheme validation still enforced; production/app config never set it), wired into both E2E boot envs (`test_marketplace_e2e.py` included). Default guard verified intact: loopback/private/metadata rejected, public IP passes.
SELF-VERIFY: `test_notices_e2e.py` 5/5 PASS (2:43) — startup push, offline silence, mid-run poll, idempotency; `test_marketplace_e2e.py` 4/4 PASS (4:08) — revived.
→ Exit checklist: remote-notice-without-update ✔ (startup + poll), no-floating-pattern ✔, silent offline degradation ✔. FILE COMPLETE.
