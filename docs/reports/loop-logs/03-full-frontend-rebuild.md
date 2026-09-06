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
