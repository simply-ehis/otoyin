# REBUILD_LOG — Full Frontend Rebuild (prompt 03)

Staying on React. Old tree is behavior-reference only; nothing new copies its JSX.

## Step 0 inventory (2026-09-04)

- `app/src`: 285 tsx (275 in `components/`, 10 in `lib/` + `hooks/` + `test/`)
- `tauri/`: 1 tsx (`tauri/src/main.tsx` — thin entry, no component tree)
- Entry floor intact: `App.tsx`, `main.tsx`, `router.tsx` (962 lines, ~70 component imports)
- Behavior reference: `archive/frontend-components/` (342 files, committed) — read for
  behavior/functionality only, never copy JSX per 03.
- Backend untouched: source of truth for routes; `docs/FEATURES.md` + 
  `backend/data/app_features.json` define the capability surface.
- Superseded: the 16-file translucency tweak pass on the old tree (reskin, not rebuild —
  rejected per 03). Those edits stay in the working tree but the tree itself is deleted
  dir-by-dir as screens land.

## Locked architecture decisions

1. **Folders** — `app/src/ui/` canonical primitives, `app/src/features/` screen
   composition, `app/src/layouts/` shell chrome. `lib/`, `hooks/`, `stores/`, `i18n/`
   stay. Old `app/src/components/` deleted as screens land, never added to.
2. **State** — Zustand stays (stores intact, tests cover them). No re-decision per screen.
3. **Routing** — TanStack router file stays; route paths unchanged (no capability
   regression). Imports repoint `@/components/*` → `@/ui/*` + `@/features/*` +
   `@/layouts/*` as screens land.
4. **Tokens** — `docs/design/proof/proof.html` is the face: warm neutrals
   (hsl 28), flat rose accent (hsl 348 68% 58%), solid surfaces, radius 4/8/12,
   motion 120/200ms ease-out, 4-role type. Applied to `styles/tokens.css` :root +
   tailwind `@theme` defaults. Grayscale `gs-*` scale + theme classes untouched
   (other themes keep working).
5. **Canonical library first** — proven by vitest render tests (no demo route, no
   router churn). Every screen consumes it; no screen invents a one-off button.
6. **Rules (always)** — 19 desktop-ui skills; no transparency/glass (`bg-*/NN`
   fills, `backdrop-blur`); no floating disconnected panels (modal scrims exempt
   per surfaces-overlays); heroicons only; clear headers + section rules; banners
   for persistent states, toasts (4s) for confirmations; empty/loading/error on
   every view; zero placeholders (gate stays green).

## Build order (03)

1. Tokens + `ui/` library + vitest proof.
2. `layouts/` shell (TitleBar, AppFrame, Sidebar, banners) → repoint router shell.
3. Simple screens (settings pages, info pages) → prove routing/data.
4. Complex screens last (Audio Studio, mixer, marketplace, workspace views).
5. Reconnect pass vs FEATURES.md + archive behavior. Delete old dirs as replaced.

## Screen checklist (definition of done per screen)

- [ ] Built only from `ui/` canonical set (no one-off styled elements)
- [ ] Tokens exact (no old grayscale values smuggled in)
- [ ] Wired to real backend route(s)
- [ ] Every old-screen capability still reachable (archive + FEATURES.md check)
- [ ] Empty + loading + error states designed
- [ ] Old dir deleted after replacement lands

## Screens landed

(none yet)
