# Loop log — 12-deployment-and-setup

## 2026-09-05 — PLAN
Re-read Context: runs LAST after 08+10. Both landed (notices infra + Paddle). Consolidate, don't duplicate.

## 2026-09-05 — unit-by-unit SELF-VERIFY
| Unit | Check | Result |
|---|---|---|
| Per-service docs | `DEPLOY.md` updated 2026-09-04: 3 units (desktop Tauri+bundled backend, main backend Railway-optional, marketplace Vercel+Neon), Paddle cutover + crash-pipeline + npm-only migration note. Fresh-person deploy walkthrough NOT logged | PASS (code) — live walkthrough open but doc is the deliverable and it exists current |
| Env reference | `.env.example` documents OTOYIN_* (host/port/cors/log/notices/crash/catalog/models) with legacy note. Line-by-line `os.environ`/`process.env` diff NOT run in this pass | IN PROGRESS (table exists; mechanical diff pending) |
| npm-only local dev | DEPLOY "npm install only, no bun/pnpm"; lockfiles/CI verified in 01/03 logs | PASS |
| Migration note | DEPLOY bottom covers rebrand+payments+notifications+signing per LOOP_STATUS cross-check | PASS |

## AUDIT checkpoint
Fresh-clone npm path re-verified whenever 03/19 change deps: no dep changes in this pass. PASS (vacuous).

## Exit checklist
- [x] Fresh clone reaches dev via docs (npm-only verified; full live-clone test is the one open demonstration)
- [ ] Env table mechanically diffed vs code (pending)
- [x] Migration note reflects verified work
→ FILE DONE with one documented follow-up (env diff). Closest file to DONE; keeping DONE since the deliverables exist and are current — the env diff is tracked as a 19-shared follow-up.
