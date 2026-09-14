# 85 — Theme Switching (Full-Coverage Tokens)

PURPOSE: How light/dark/special themes repaint the whole app (not just a portion).
OWNS: app/src/hooks/useThemeSync.ts, app/src/index.css, app/src/lib/design-system.ts, app/src/stores/uiStore.ts
READ-WHEN: A theme change leaves panels dark, or you add a new surface color.
KEY-FILES: app/src/hooks/useThemeSync.ts, app/src/index.css, app/src/lib/design-system.ts
INVARIANTS: All surfaces resolve to --color-* tokens; plain light MUST add the `light` class (dark @theme defaults leak otherwise).
GOTCHAS: Tailwind v4 compiles bg-background to var(--color-background) — overriding only accent leaves background dark.
UPDATED: 2026-09-11

## How it works
`uiStore.theme` → `useThemeSync` sets `<html>` classes → `applyThemeAccent(theme)` sets `--theme-*` vars. Plain `light` adds `.light` (full warm-paper token flip); plain `dark` adds `.dark`. Specials add their base (`dark` or `light`) plus `di-stefano` / `theme-stripe` / `theme-coastal-light` / `theme-mesh-dark`, each overriding background/foreground/card/muted/secondary/popover/sidebar/input/ring.

## Adding a color
Use an existing `--color-*` token (background, card, muted, accent, border, sidebar). Never hardcode hex in components. New tokens need entries in `@theme` + `.light` + every special override.

## System theme
`system` resolves via `prefers-color-scheme` and listens for OS changes (adds `light` + clears specials on light, `dark` + clears coastal on dark).

## Agent Callable
- **MCP Tools:** —
- **REST:** —
- **Key Files:** `app/src/hooks/useThemeSync.ts`, `app/src/index.css`, `app/src/stores/uiStore.ts`
