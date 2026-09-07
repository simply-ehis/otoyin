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
- [x] **No floating pattern**: scoped grep on `components/Banner/AnnouncementBanner.tsx` — zero blur/floating/bg-white-NN/bg-black-NN/backdrop hits.
- [x] **Silent offline degradation**: second backend boots with the notices URL on a dead port — app healthy, bundled content served exactly, failure visible ONLY as the debug-level breadcrumb (invisible at default INFO level, no Traceback, no ERROR line) — the silence is the contract, asserted in the test.
FINDING: the merge is **startup-only** — no periodic poll and no nudge endpoint exist (unlike the 07 catalog), so a notice published while the app runs appears on next launch, not 'within an interval' as the unit description assumed. Either add a poll (mirror 07's REMOTE_REFRESH pattern) or record startup-only as the intended contract. → FILE IN PROGRESS (one decision left).
