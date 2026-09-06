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
- **Color roles:** `surface-base/raised/overlay/sunken`, `text-primary/secondary/tertiary`, `border-subtle/strong`, `accent` (flat rose), `accent-muted`, status `info/success/warning/danger` each with a solid `*-soft` surface + `*-text` tint (consumer aliases: `--color-info*`/`--color-success*`/… in `index.css` `@theme`; semantic long names `--status-*`/`--text-*` in `tokens.css`). 60-30-10 balance. Selected states = tint + edge bar/underline, never color alone.
- **Token-alpha carve-out (audited 2026-09-05):** surfaces are SOLID — `bg-<token>/<alpha>` as a surface fill is banned. Alpha modifiers are sanctioned **only** in these forms, and nothing else:
  - **Raw-palette text rule (audited 2026-09-06):** status-bearing text/icons use `text-success-text` / `text-warning-text` / `text-danger-text` / `text-info-text` — raw `text-<palette>-NNN` classes are banned outside these carve-outs: (a) the hue-identity pattern (`workspace/hueIdentity.ts`); (b) star-rating amber identity (`ui/star-rating.tsx`, `store/StarRating.tsx`). Meters/dots/switch tracks stay on saturated `bg-<status>` (06 de-translucify pass).
  - **Raw-palette border/ring rule (audited 2026-09-06):** hairlines are carve-out 3 (alpha-tinted, non-semantic) — but a border/ring that *carries meaning* must use a semantic token, not a raw hue: focus rings on status surfaces → `focus:ring-<status>/50` (e.g. CapturePill `ring-destructive/50`); selection rings → `ring-accent/40` on `bg-accent-muted` (never rose-by-convention); identity edge bars → the `hueLine`/`CATEGORY_ACCENT` 3px pattern on solid surfaces. Carve-outs: (a) `workspace/hueIdentity.ts` definitions; (b) `storeUtils.ts` `CATEGORY_ACCENT` category identity. Translucent hue fills behind hairlines (`bg-<hue>-500/20 border-<hue>/40`) are the banned hybrid — use solid surface + hue line (LauncherTab scene headers precedent).
  1. **State modifiers** — `hover:`/`disabled:`/`group-hover:`/`focus-visible:` prefixed (e.g. `hover:bg-accent/10`, `hover:bg-muted/80`) — transient feedback, never resting fills.
  2. **Text tints** — `text-<token>/<alpha>` — hue/de-emphasis carried by glyphs (e.g. `text-muted-foreground/50`).
  3. **Hairline tinting** — `border-`/`divide-`/`ring-`/`stroke-`/`fill-`-on-glyph with alpha (e.g. `border-accent/40`, `divide-border/60`) — 1–2px lines only, never fills.
  4. **Scrims & see-through veils** — `bg-black/<alpha>`/`bg-white/<alpha>` overlays (canonical dialog value `bg-black/60`), gradient scrims over media (e.g. `from-black/40 to-black/10`), and any full-cover veil that must let content show beneath it: image hover veils, drag-over covers, content dimmers, animated ping halos (`bg-accent/60 opacity-0 group-hover:opacity-100`, `animate-ping`).
  5. **Hue-identity lines** — the DiarizationView pattern (`hueIdentity.ts`): identity hue via `text-<hue>-NNN` + thin `border-<hue>-NNN` edge bars on solid token surfaces; per-lane/take/pitch-class identity never uses hue surface fills.
  Everything else must use a solid token: tinted chips → `bg-accent-muted` / `bg-*-soft` + `*-text`, placeholder/skeleton/table stripes → `bg-sunken` / `bg-muted`, insets → `bg-sunken`. Colored glow shadows (`shadow-<color>/NN`) are banned — elevation is neutral (`--elevation-*`).
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
**Sign-off 2026-09-04 (confirmed, no direction change):** the warm
single-source-light direction is validated against the implemented face
(`index.css` `@theme` + `tokens.css`). Proof adjusted to exact parity before
rollout: elevation shadows synced to `tokens.css` (was ~2.5× too strong);
status softs aligned to the consumer `@theme` values (15/15/16) and the
missing `info` + `*-text` roles added; swatch grid extended with the solid
soft surfaces; dark-first single-face scope stated explicitly (image themes
overlay, no separate light tokens); model/store state pills now demo all four
status roles (06 breaker + 07 owned/installed/needs-download). Audio Studio
(05) is the first rollout target per §5.

## 5. Rollout plan (post sign-off)

1. Re-token remaining `ui/` primitives to consume semantic tokens directly.
2. Apply tokens + canonical components to the Audio Studio page first (prompt 05 — the hardest screen proves the system).
3. Then the app shell (Sidebar/AppFrame — layout-navigation rules: icon rail collapse, accent bar on active item, consistent header height).
4. Then feature components screen by screen, replacing the 12 translucent files, removing framer-motion usage.
5. Run `bin/check.ps1` after every phase; keep the zero-placeholder gate green.

## 6. Verification status

- Frontend not runnable in this environment (no node_modules, no registry) —
  `tsc`/vitest/vite are CI-gated. Token values in `proof.html` mirror the
  consumer face (`index.css` `@theme` + `tokens.css`) 1:1 (re-aligned
  2026-09-04: elevation + status softs + `info`/`*-text`); the page renders
  and has been visually checked.
- Backend untouched by this pass except the documented 06 report.

## 7. Accessibility scope (prompt 15 — baked in, not bolted on)

- Canonical components carry semantics by construction: native buttons /
  fieldsets / outputs, labelled controls, `aria-pressed` toggles,
  `prefers-reduced-motion` honored in `index.css`. Biome a11y rules gate
  every new screen.
- Hard surfaces, scoped honestly: waveform editor, piano-roll pitch map,
  mixer strips, and the spatial radar canvas are NOT full screen-reader
  parity. What IS guaranteed: every control *around* them (transport,
  toggles, headers, sliders with value text) is keyboard/screen-reader
  operable; canvases expose `role="img"` + text summary; the radar adds
  arrow-key nudging plus a focus-button list as the keyboard equivalent.
- Contrast is token-level: text roles (`--text-primary/secondary`) over
  surface roles are checked when the palette is defined, not per screen.