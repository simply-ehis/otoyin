# Otoyin Design System

**Locked:** 2026-09-03 · **Source of truth for all UI work.**
Driven by the `awesome-desktop-design.skills` package (18 skills, MIT) and the
redesign ground rules (no floating UI, no glassmorphism, no Lucide, heroicons
only, zero placeholders). Future sessions MUST start from this brief instead of
re-deciding design.

## 1. Style direction (desktop-ui-style-direction brief)

| Question | Answer |
|---|---|
| What is this tool for, moment to moment? | Professional audio post-production — bursts of creative flow inside long, dense working sessions. |
| Emotional register | **Organic / creative**, precise underneath: warm and tactile, not playful, not clinical. |
| Visual motif | The rose — warm single-source light (Caravaggio). One flat rose accent; the app's only "decoration" is the rose SVG at ~0.08 opacity behind the UI (project invariant) and an audio-reactive glow when playing. |
| Who is it for | Solo power users who want density and speed; first-run users must still find the four jobs (Generate → Edit → Mix → Ship). |
| Locale commitment | 4 locales (en, ja, zh-CN, zh-TW); labels sized with 30-40% translation headroom; date/number via locale-aware APIs. |

Anti-AI-slop checklist (foundations) applies to every screen — see
`awesome-desktop-design.skills/skills/desktop-ui-foundations/SKILL.md`.

## 2. Tokens (implemented in `app/src/styles/tokens.css`, wired via `index.css`)

- **Spacing:** 4px base — `2, 4, 8, 12, 16, 24, 32, 48, 64` (`--space-*`).
- **Radius:** exactly 3 — `sm 4px` (inputs/controls) · `md 8px` (buttons/cards) · `lg 12px` (modals/panels). No `rounded-2xl+` defaults.
- **Elevation:** 3 levels via surface shift + hairline + cheap shadow, never blur — `raised` / `floating` / `modal` (`--elevation-*`).
- **Color roles:** `surface-base/raised/overlay/sunken`, `text-primary/secondary/tertiary`, `border-subtle/strong`, `accent` (flat rose), `accent-muted`, `status-info/success/warning/danger`. 60-30-10 balance. Selected states = tint + edge bar/underline, never color alone.
- **Motion:** enter 200ms ease-out, exit faster (120ms), hover 120ms, functional UI <300ms; `transform`/`opacity` only; press feedback `scale(0.97)` on every pressable; `prefers-reduced-motion` honored; never animate keyboard-triggered actions.
- **Type:** 4+ roles (display / heading / body / caption) with ≥1.25× jump ratio; Geist (local) with Geist Mono for data.

## 3. Canonical components

Existing shadcn-style primitives in `app/src/components/ui/` are the canonical
library — **re-token them, don't fork them**. Status of this pass:

- ✅ `button.tsx` — pill (`rounded-full`) → `rounded-md`; keeps press scale, focus rings, loading state, hover-gating.
- ✅ `toast.tsx` / `use-toast.ts` — 4s auto-dismiss (Radix pauses on hover/focus); success/destructive variants now solid + semantic status tokens.
- ✅ `EmptyState.tsx` — translucent fills (`bg-card/30`, `bg-accent/10`) → solid surface + bordered icon chip.
- ✅ `alert.tsx` — translucent close-button hover → solid `hover:bg-secondary`.
- ✅ `index.css` — theme surfaces de-translucified (`/ 0.92` → solid); radius scale aligned; `--color-success/--color-warning` added; solid `secondary-hover`, `sunken`, and `*-soft`/`*-text` status tokens added (incl. `info-soft`/`info-text` for the marketplace “Owned” chip).
- ✅ Store per-item states (07): `StoreProductCard` / `StoreDetailModal` now render the full state row — **owned** (solid `info-soft` chip + one-step Install when not on disk), **cached/installed** (solid `success-soft` chip, delete+manage), **needs download** (price/Free chip → Download/Buy). Disk truth = live model-status `installed` OR the catalog `local_status` annotation (same manifest); this fixes the prior mislabel where an owned-but-deleted model showed “Installed”.
- ✅ Feature-component surface fills de-translucified (2026-09-03): `PluginChainPanel`, `AnnouncementBanner` (incl. severity styles now solid soft-status surfaces + solid accent CTA), `CapturePill` (solid `bg-card` + hairline border, both light/dark), `LogsPage` (terminal console → `bg-terminal-bg`), `ThemeSelect` (solid swatch), `SpectrogramCanvas`/`SpectrogramView` (chips → `bg-sunken`), `MiniGame` (chips → `bg-secondary` + `secondary-hover`). Modal backdrops (`bg-black/50-80` in `FeatureTour`, `MiniGame`, `dialog`, `alert-dialog`) intentionally kept — dimmed overlays are the recommended pattern.
- ⏳ `framer-motion` usage → CSS transitions (motion skill mandates GPU-cheap CSS).
- ⏳ `react-sound-visualizer` → thin custom Web-Audio canvas wrapper.

## 4. Proof of direction

`docs/design/proof/proof.html` — self-contained visual proof (open in any
browser): color roles, buttons (3 levels × 3 sizes), inputs with persistent
labels + error/search states, switches/segmented, model-state pills, banners,
toast, destructive dialog, empty state, surfaces, anti-slop checklist.

**Gate:** get sign-off on this proof BEFORE the app-wide rollout (the pack's
rule: "Get sign-off on the proof screens before touching all 275 components").

## 5. Rollout plan (post sign-off)

1. Re-token remaining `ui/` primitives to consume semantic tokens directly.
2. Apply tokens + canonical components to the Audio Studio page first (prompt 05 — the hardest screen proves the system).
3. Then the app shell (Sidebar/AppFrame — layout-navigation rules: icon rail collapse, accent bar on active item, consistent header height).
4. Then feature components screen by screen, replacing the 12 translucent files, removing framer-motion usage.
5. Run `bin/check.ps1` after every phase; keep the zero-placeholder gate green.

## 6. Verification status

- Frontend not runnable in this environment (no node_modules, no registry) —
  `tsc`/vitest/vite are CI-gated. Token values in `proof.html` mirror
  `tokens.css` 1:1; the page renders and has been visually checked.
- Backend untouched by this pass except the documented 06 report.