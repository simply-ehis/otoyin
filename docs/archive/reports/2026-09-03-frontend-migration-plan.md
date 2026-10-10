# Frontend Framework — Decision Record & Migration Plan

**Date:** 2026-09-03
**Prompt:** `otoyin-redesign-prompts/03-frontend-framework-migration.md`
**Status:** DONE — decision made (stay on React); planning pass only, no framework swap.
**Last verified:** 2026-09-07

---

## 1. Decision (go/no-go)

**Stay on React 19 + Vite + TanStack Router/Query.** No framework migration.

The pack's own 03 prompt warns that a full rewrite is "weeks to months" of work
with regressions that hide easily, and explicitly offers the stay-on-React path
as one it would "genuinely consider" — the user confirmed this branch.

Reading the codebase firsthand changed the risk math versus what the pack
assumed:

- The pack assumed **275 live `.tsx` component files** needing porting. In the
  current tree, `app/src/components/` is **empty** — a previous session archived
  all **342 component files (57 directories)** to `archive/frontend-components/`
  as part of the redesign pivot. There are zero live components to port.
- The React **shell is intact and alive**: `app/src/main.tsx`,
  `app/src/App.tsx` (TanStack Router), `app/src/router.tsx` (lazy route tree
  importing `@/components/*`), 13 Zustand stores, `lib/api/` (24 domain
  clients), `lib/hooks` (including the fixed `useGenerationProgress.ts`),
  `platform/`, and 4 i18n locales. The app cannot render today only because the
  archived components are missing — restoring them is the fastest way to a
  working app.
- The archived components are the app's entire DAW-adjacent functionality
  (waveform editor, pitch map, multi-track mixer, spectrogram, ADR, audiobooks,
  dubbing, voice changer UI). Moving to Solid would mean **re-deriving that
  functionality from archive + knowledge docs**, not porting it — the highest
  regression-risk path available.
- Solid's fine-grained reactivity advantage is real but concentrated in a
  handful of real-time surfaces (VU meters, waveform scrubbing). Those can be
  optimized within React (memoized leaf components, `requestAnimationFrame`
  throttling, canvas-based meters) without a rewrite.

**Consequence for the rest of the pack:** prompts 04 (design system) and 05
(Audio Studio redesign) proceed against React; the design tokens are
framework-agnostic CSS custom properties either way.

---

## 2. What the current frontend actually is

| Layer | Path | State |
|---|---|---|
| Tauri desktop shell | `tauri/` (vite, port 21132, `@` → `../app/src`) | Alive; `tauri/src/main.tsx` + `platform/` |
| Browser variant | `app/` (vite, port 21132, `/api` proxy → 17493) | Alive; shares all of `app/src` |
| Shared source | `app/src` (122 files: router, stores, hooks, api, i18n, platform) | Alive |
| Components | `app/src/components` → **empty** | Archived: `archive/frontend-components/` (342 files / 57 dirs) |
| Legacy Rust sidecar | `tauri/src-tauri/src` | **No `.rs` files** (only `build.rs`) — audit §5 stale; Rust logic lives in the Python backend |

Note: the pack (and root README) describe `web/` as a separate browser
frontend; no `web/` directory exists. The browser variant is the `app/`
workspace itself.

---

## 3. Dependency audit (React path — what stays, what the redesign drops)

All currently-listed third-party deps are React-compatible, so the stay-on-React
decision means **nothing needs a framework-port**. The redesign still makes
deliberate changes per the design-skills rules:

| Dependency | Verdict | Notes |
|---|---|---|
| `@tanstack/react-query`, `@tanstack/react-router`, `@tanstack/react-virtual` | Keep | Core data/routing layer; no change |
| `zustand` (13 stores) | Keep | Established; no migration to Solid stores needed |
| `@radix-ui/*` (13 packages) | Keep | Accessible primitives; restyle via design tokens |
| `@heroicons/react` | Keep | Project invariant; heroicons-only rule stays |
| `wavesurfer.js` | Keep | Framework-agnostic (the pack agreed) |
| `react-sound-visualizer` | **Replace** | React-specific (the pack flagged this). Under the hood it wraps Web Audio analyser data — replace with a thin custom canvas/`requestAnimationFrame` visualizer |
| `framer-motion` | **Drop usage** | Design-skill `desktop-ui-motion` mandates GPU-cheap CSS `transform`/`opacity` transitions, `prefers-reduced-motion`, and no animate-`all`. CSS transitions cover every required case; keeping framer-motion invites violations |
| `@dnd-kit/*` | Keep | Drag-and-drop for mixer lanes, waveform regions, story tracks |
| `react-hook-form`, `zod`, `@hookform/resolvers` | Keep | Settings forms |
| `react-markdown`, `remark-gfm`, `react-syntax-highlighter` | Keep | Help/knowledge rendering (prompt 11) |
| `i18next`, `react-i18next`, `i18next-browser-languagedetector` | Keep | 4 locales |
| `class-variance-authority`, `clsx`, `tailwind-merge` | Keep | Canonical-component building blocks (prompt 04) |
| `tailwindcss` (v4, `@tailwindcss/vite`) | Keep | Design tokens land here |

**Note on `app/vite.config.ts`:** it imported `@vitejs/plugin-React` (wrong
case — the package is `@vitejs/plugin-react`), which broke the browser-variant
build. **Fixed 2026-09-03** together with build-output alignment: explicit
`root`/`outDir: "dist"`/`target: "es2021"`/`clearScreen`/`envPrefix`, the
React/TanStack/i18next `dedupe` list (mirrors the tauri shell), and the same
`manualChunks` map in both configs so the desktop shell and browser variant
ship identical code splitting. Both configs verified parse-clean; actual
builds run in CI (no node_modules in this environment).

---

## 4. Phase breakdown (React path)

1. **Restore + stabilize (prerequisite).** Copy `archive/frontend-components/`
   back into `app/src/components/`; fix the `plugin-React` casing in
   `app/vite.config.ts`; get `tsc --noEmit` + vitest green. This is the
   baseline the redesign restyles — do not redesign blind.
2. **Design system (prompt 04).** Tokens file (`app/src/styles/tokens.css`),
   canonical component library, proof on 2–3 screens, sign-off.
3. **App-wide rollout (prompt 04 continued).** Apply canonical components and
   tokens across restored components; remove blur/translucency (58 files
   flagged in audit); remove framer-motion usage; kill floating-UI patterns.
4. **Audio Studio focus (prompt 05).** Flagship page pass on top of the system.
5. **Feature-exposure pass.** Surface backend-supported-but-hidden features
   (from the 04 audit) with new UI entry points.
6. **Leaf-optimization for real-time surfaces.** Canvas-based VU meters /
   waveform scrub rendering where jank appears; keep memoization tight on
   mixer and pitch-map subtrees. (This is where the Solid-perf argument gets
   answered on React's terms.)

Each phase keeps `bin/check.ps1` green (lint + typecheck + format) and the
zero-placeholder gate intact.

---

## 5. bun → npm cleanup — status

Decoupled from the framework decision, as the prompt requires. **Done this
session:**

- CI workflows already npm-only (`setup-node@v4` + `npm install` +
  `npm run … --workspace=@otoyin/app`) — applied in the earlier audit fix pass.
- `app/pnpm-lock.yaml` deleted (audit fix). `bun.lock`/`bun.lockb` never existed.
- Root `package.json`: removed stale `dev:web` / `build:web` scripts pointing
  at the nonexistent `web/` directory.
- `tauri/src-tauri/tauri.conf.json`: `beforeDevCommand`/`beforeBuildCommand`
  `bun run dev` → `npm run dev`, `bun run build` → `npm run build`.
- `bin/run.ps1`: `bun run tauri dev` → `npm run tauri dev`.
- `bin/check.ps1`: `bunx biome` → `npx biome` (×2), `bun run typecheck` →
  `npm run typecheck`.
- `justfile`: `web_dir := "web"` → `"app"` (the browser variant — the old
  value pointed at a directory that doesn't exist, so `just dev-web` was
  broken).
- Docs: `README.md`, `docs/README.md`, `docs/PROJECT_STATUS.md`,
  `BUILD_SUMMARY.md`, `CONTRIBUTING.md`, `TESTING.md`,
  `docs/DEPLOYMENT_TEST_PLAN.md` — bun references converted to npm.

**Still pending (blocked on network):** root `package-lock.json`. `npm install
--package-lock-only` times out from this environment (registry unreachable —
same as the audit). Generate it from a networked machine/CI and commit it, then
tighten CI to `npm ci` (instead of `npm install`) for reproducibility.

**Left alone on purpose:** `otoyin-redesign-prompts/` (the source pack),
historical docs (`IMPACT_MAP.md`, `docs/WHATS_NEXT.md`, `AGENT_FEEDBACK.md`,
`docs/reports/2026-09-03-redesign-audit.md`) record what the tooling was at the
time and are not instructions.

---

## 6. Honest go/no-go, restated after reading the code

If the goal is a professional-looking, non-floating, non-AI-generic studio app
that actually runs: **stay on React, restore the archive, restyle under the
design system.** That delivers every stated user-visible goal (no floating UI,
no transparency, fast on low-end hardware, no bun) with the least risk, and
keeps the 342 archived components as working functionality rather than as a
pile to reverse-engineer.

A Solid migration would only be worth it if React measurably failed on the
real-time surfaces (VU meters, waveform scrubbing) after the leaf-optimization
phase — revisit only with profiling evidence in hand, not on general
principle.