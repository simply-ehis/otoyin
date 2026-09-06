# Prompt: Full Frontend Rebuild — React, Ground Up, Nothing Old Survives

## Decision: confirmed. Staying on React. Old components are already deleted.

Final call: **no framework switch.** The actual problem was never React as
a technology — it was that the existing UI is bad (bad components, bad
cards, bad structure, sloppy) and agents kept making half-assed patches
instead of real rebuilds. Instead of solving that with a framework swap,
the old component tree was **archived, then deleted outright.** There is
now little or no working frontend component code in `app/src` (and
possibly `tauri/`) to fall back on. That deletion *is* the forcing
function — same effect as a framework swap, without the framework risk.

**This means the next agent to touch this repo is building the frontend
from scratch, on purpose.** Treat that as the whole point, not a problem to
route around.

## Step 0 — before writing anything

The state described in this file (275 components, specific file paths) was
true as of the last full audit, **before** this deletion happened. That
audit is now stale for the frontend layer specifically. Before doing
anything else:

1. Run `find app/src -name "*.tsx" | wc -l` (and the same for `tauri/`) to
   see what, if anything, actually survived.
2. Confirm what's left of the build entry point — is there a bare
   `App.tsx` / `main.tsx` / router shell, or is even that gone? You need to
   know the actual floor you're building from before planning the rebuild
   sequence.
3. Confirm the **archive location** — wherever the deleted components were
   moved before deletion (or their last state in git history, e.g.
   `git log --diff-filter=D -- app/src`) — this is your reference for
   *what each screen needs to do*, not what it should look like. Read it
   for behavior/functionality only.
4. The backend (`backend/`) was not touched by this deletion — it's still
   the full, working source of truth for what the frontend needs to expose.
   `docs/FEATURES.md`, `docs/knowledge/`, and `backend/data/app_features.json`
   describe the required capability surface. Every screen you build needs
   to actually connect to real backend routes, not just look good.

## The rule that matters most

**Nothing new may be a visual, structural, or copy-paste descendant of what
was deleted.** Specifically:

- If an old component is referenced via git history or an archive folder
  to confirm behavior, **do not copy its JSX.** Write the new component
  from the design system (see the design-system-and-redesign prompt) and
  the functional requirement, not from the old file's structure.
- Don't recreate old class-name conventions, old folder layouts, or old
  component boundaries just because they're familiar or "worked before."
  A component that was one big 400-line file before might correctly become
  three small composed components now — decide fresh, don't inherit the old
  decomposition by habit.
- No card, panel, button, or layout in the rebuilt app should be visually
  or structurally recognizable as the old version. If it looks the same
  with different colors, that's a reskin, not a rebuild — reject it.

## What "new structure" actually means — set this before building screens

Before any screen gets built, establish (as its own short deliverable,
reviewed before screen-building starts):

1. **New folder/file architecture for `app/src`.** Don't just recreate
   the old `components/`-by-feature-area layout by default — decide
   deliberately whether that's still right, or whether a clearer split
   (e.g. `ui/` for canonical primitives, `features/` for screen-specific
   composition, `layouts/` for shell/chrome) serves the app better now that
   you're not constrained by what already exists.
2. **State management approach.** Zustand was the old pattern — confirm
   it's still the right call (it's fine, framework-agnostic reasoning
   isn't required to change here) or make a deliberate choice, but decide
   it once, up front, rather than re-deciding it screen by screen.
3. **Routing structure.** Map out the full navigation tree (tabs,
   workspace views, settings — same inventory the old app had, per
   `docs/FEATURES.md`, since functionality must not regress) before
   building individual routes, so the new structure is coherent app-wide
   instead of assembled screen-by-screen with no plan.
4. **Design tokens and canonical component library.** This is the
   design-system-and-redesign prompt's job (colors, spacing, motion,
   canonical button/input/panel/modal set) — build that library *first*,
   as real, standalone, Storybook-able (or at least demo-page-able)
   components, before wiring up full screens. Every screen after this point
   consumes the canonical set; no screen invents its own one-off button.

## Build order

1. Design tokens + canonical component library (buttons, inputs, tabs,
   panels, modals, toasts, empty/loading/error states) — proven on a demo
   page, not yet wired into real screens.
2. App shell / navigation chrome (sidebar, tab bar, top-level layout) —
   the frame everything else sits inside.
3. Simple, low-risk screens first (settings, help, a static info panel) to
   prove the new architecture holds up under real routing/data-fetching.
4. Complex, high-value screens last, once the pattern is proven: the Audio
   Studio / editing page (its own dedicated prompt — do not build it first,
   it's the highest-risk surface and deserves the most-proven foundation
   under it), the marketplace, the mixer.
5. Full pass to reconnect every backend route that had a UI entry point
   before — this is where you check against `docs/FEATURES.md` and the old
   archived behavior to make sure nothing capability-wise got silently
   dropped during the rebuild, even though nothing looks or is structured
   the same.

## Definition of done, per screen

A screen is done when: it's built from the canonical component library
(no one-off styled elements), it matches the new design tokens exactly
(no leftover old color/spacing values), it connects to the correct real
backend route(s), and every feature the old version exposed for that
screen is still reachable (verified against the archived behavior
reference and `docs/FEATURES.md`) — even though nothing about *how* it's
built or *how* it looks may resemble the old version.

## bun → npm (still applies, independent of this decision)

Confirmed in the audit: the repo mixes bun (root + CI), pnpm
(`app/pnpm-lock.yaml`), and npm-flavored scripts — this is unrelated to the
framework decision and should be cleaned up regardless:

1. Delete any `bun.lockb`/`bun.lock`, delete `app/pnpm-lock.yaml`.
2. `npm install` at the root to generate one `package-lock.json`.
3. Update `.github/workflows/build.yml` and `.github/workflows/ci.yml` —
   remove `oven-sh/setup-bun@v2`, use `actions/setup-node@v4` + `npm ci`.
4. Fix the root `"web"` workspace entry (no such directory currently
   exists — remove it or point it at the correct path).
5. Grep for `bun install`/`bun run`/`bun x` across scripts, docs, and the
   root `justfile`; update every bun-based recipe to npm.

## Deliverable

A running rebuild log (`REBUILD_LOG.md`) tracking: the architecture
decisions from the "before building screens" section (written down once,
referenced by every later screen), and a per-screen checklist against the
Definition of Done above. This is an implementation pass, not a plan-only
pass — build as you go, log as you go.
