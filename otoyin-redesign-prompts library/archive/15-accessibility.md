# Prompt: Accessibility — Bake It In, Don't Bolt It On

## Why this needs its own prompt

The old app used `aria-*`/`role` attributes in 119 of 275 component files
(43%) — partial, inconsistent coverage. Since the whole frontend is being
rebuilt from scratch anyway (03), this is the cheapest point in the app's
life to make accessibility a default property of the canonical component
library (04) instead of something bolted onto individual screens later at
much higher cost.

This isn't about chasing a compliance certificate — it's about a
professional audio tool being usable by people with visual, motor, or
hearing differences, and about a set of features (waveform editing,
piano-roll pitch map, mixer) that are genuinely hard to make accessible and
therefore genuinely easy to neglect if it isn't a stated requirement.

## Scope

1. **Bake it into the canonical component library (04), not per-screen.**
   Every button, input, tab, panel, modal, toast, and dropdown in the
   canonical set should have correct semantics, keyboard operability, and
   focus management by construction. If the base components are right,
   most screens inherit correctness for free.
2. **Keyboard navigation for the whole app**, not just individual widgets —
   confirm there's a sane, complete tab order and that nothing (a modal, a
   dropdown, a panel) can trap focus incorrectly. The existing
   `docs/knowledge/72-keyboard-shortcuts.md` content (surfaced properly per
   prompt 11) should reflect real, working shortcuts, not aspirational ones.
3. **The hard cases — be honest about scope, don't skip them silently.**
   Full screen-reader support for a waveform editor or a piano-roll pitch
   map is a genuinely hard, open-ended problem — don't let "accessibility"
   quietly shrink to "the settings page has aria-labels" while the actual
   editing surface stays inaccessible. At minimum: every control *around*
   the waveform (transport controls, effect toggles, track headers) should
   be fully keyboard/screen-reader operable, even if the waveform canvas
   itself needs a documented, scoped-down interaction mode as a first pass
   rather than full parity on day one.
4. **Color contrast**, tied directly to the design tokens from 04 — check
   contrast ratios when the palette is defined, not after screens are built
   and someone notices text is hard to read on a panel.
5. **Motion.** The redesign's "smooth transitions, not floating" rule
   (00/04) should also respect `prefers-reduced-motion` — add this as a
   concrete technical requirement, not just a visual-style preference.

## Deliverable

Accessibility requirements written directly into 04's component spec
(not a separate document nobody reads), a short scoped statement of what's
achievable for the waveform/pitch-map/mixer surfaces in this pass versus
deferred, and `prefers-reduced-motion` support verified across the motion
system.
