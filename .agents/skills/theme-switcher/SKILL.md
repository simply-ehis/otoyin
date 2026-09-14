---
name: theme-switcher
description: Switch otoyin themes with full-surface coverage (light/dark/special). Use when a user wants to "change theme", "go light/dark", or reports "theme only changed part of the UI".
---
# Theme Switcher

## Purpose
Repaint every surface via `<html>` classes + `--color-*` tokens, never a partial switch.

## When to use
- "Switch to light/dark/coastal/stripe/mesh/otoyin theme"
- Only buttons changed / panels stayed dark
- Adding a new surface color

## Agent procedure

### 1. Set the theme
```
UI: Settings → Appearance → Light | Dark | System | Otoyin | Stripe | Coastal Light | Mesh Dark
Store: uiStore.theme
```
`useThemeSync` applies `light`/`dark` + the special class; `applyThemeAccent` sets `--theme-*`.

### 2. Verify full coverage
Check: app background, sidebar, cards, dialogs, inputs, nav active indicator, player bar. All must flip. If only accents changed, the component hardcodes a color — replace with `bg-background/text-foreground/border-border/bg-card` tokens.

### 3. Add a color (dev)
Add to `@theme` + `.light` + each `.theme-*` override in `app/src/index.css`. Never hardcode hex.

## Pitfalls / Gotchas
- `light` without the `light` class falls back to dark `@theme` defaults — the classic partial-switch bug.
- `system` follows the OS live; test both OS modes.

## Cross-links
- `app-ui-loading` — loading states must also theme

## Validation
- Screenshot light + dark: no dark panels leak in light, no white flash in dark.
