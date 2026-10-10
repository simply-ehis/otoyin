# Loop log — 03-full-frontend-rebuild

## 2026-09-05 — PLAN (Step 0 re-run — state moves between sessions)
1. `find app/src -name "*.tsx" | wc -l` equivalent: **420** (was 285 at 2026-09-04 inventory; growth = new ui/features slices landing).
2. Entry floor: `App.tsx`, `main.tsx`, `router.tsx` intact (router has 71 @/-imports).
3. Archive: `archive/frontend-components/` DELETED after file-by-file verify (314 identical, 21 repaired-in-tree, 7 Store/* rebuilt into features/store) — see REBUILD_LOG.md provenance section. Reference survives only in git history (`630b6f9` and earlier).
4. Backend untouched as source of truth. `docs/FEATURES.md` + `backend/data/app_features.json` present.

## 2026-09-05 — unit-by-unit SELF-VERIFY
| Unit | Check | Result |
|---|---|---|
| Step 0 state | tsx count + archive location documented above | PASS |
| Architecture decisions | REBUILD_LOG "Locked architecture decisions": ui/features/layouts split, Zustand stays, TanStack router paths unchanged, tokens in `styles/tokens.css` + tailwind theme, vitest proof (no demo route) | PASS (written + locked) |
| Canonical library proven | `app/src/ui/` 34 tsx, zero imports from `_archive/`, vitest floor (`ui.test.tsx`, `input`, `overlays`, `feedback`, `form-controls`, `data-display`, `surfaces2`) + `scripts/check-ui-test-floor.py` gate; commit `588152d` | PASS |
| App shell | `app/src/layouts/` 4 tsx (TitleBar, AppFrame, Sidebar, banners per log); router still 45/71 imports on `@/components/*` — shell repoint IN PROGRESS | IN PROGRESS |
| Simple screens | Store slice rebuilt into `features/store` (7 files + 3 test files); settings/help still largely old-tree | IN PROGRESS |
| Complex screens | `features/audioStudio/` present (AudioStudio.tsx + store + ~40-file breakdown preserved); mixer/marketplace/workspace mid-flight | IN PROGRESS |
| Full reconnect | `scripts/check-wiring.py` exists; 2026-09-04 wiring audit: 98 stranded = "UI not rebuilt yet", expected mid-flight | IN PROGRESS |
| bun→npm | no bun.lockb/bun.lock/app/pnpm-lock.yaml; root package-lock.json; CI setup-node+npm ci; justfile "bun" hits all false positives (bundle/bundled); workspaces fixed | PASS |

## AUDIT checkpoint (after every screen)
(a) new-file JSX vs `_archive/`: zero live imports from `_archive/` anywhere in ui/features/layouts — PASS.
(b) orphan script `scripts/check-wiring.py` — exists, re-run per screen batch. PASS (mechanism exists; cadence is the open item).

## Exit checklist
- [x] Zero live imports from `_archive/` in new code (old `components/` still has 225 files pending deletion-as-screens-land — expected, not a violation)
- [ ] Every architecture-map screen built/wired/tested
- [ ] `app/_archive/` deleted (N/A — archive was `archive/frontend-components/`, already deleted)
- [x] bun/pnpm removed, npm-only in CI
→ FILE IN PROGRESS (correct long-running state per protocol).

## 2026-09-09 — DoD made explicit (fed from prompt 20)
Per 20 scope item 2, "reachable and wired" is now an explicit per-screen DoD
 criterion in this checklist: a screen is not done until (a) it is mounted in
`app/src/router.tsx` where a user can actually reach it, and (b) its data
flows through `app/src/lib/api/` client functions (directly or via `lib/hooks`)
against real backend routes — never a mock, a TODO stub, or a hand-rolled
`fetch` (blob/save-dialog downloads via an `apiClient` URL builder are the
sanctioned exception). Spot-checked on 3 done screens 2026-09-09 — see loop
log 20.

## 2026-09-07 — legacy-primitives teardown sweep (canonical-vs-legacy pins)
Post-dual-toast-bug sweep of the ui/ vs components/ui/ fork: 12 dead copies deleted (alert, alert-dialog, drawer, multi-select, progress, scroll-area, table, checkbox, separator, star-rating, LoadingState, AppLoadingScreen — all 0 importers). Repointed to canonical: router.tsx AppLoadingScreen; 3 audioStudio files CircleButton→IconButton. New gate hazards in `check-dual-instances.py`: (4) twin freeze — a components/ui stem shared with ui/ must be a pure shim or on FROZEN_TWINS (13 live twins remain, imported only by old-tree screens pending port), (5) new-tree import pin — files outside components/ may not import `@/components/ui/*` (identity-pin test allowlisted). 8 new gate tests (20 total).
