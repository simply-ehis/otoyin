# Prompt: Design System + Full UI Redesign

## Context

Otoyin needs to look and feel like a real, professional audio studio —
not a generic AI-app template. There's already a dedicated Claude Skill
package built for exactly this (`desktop-ui-design-skills` — 18 SKILL.md
files covering buttons, icons, banners, components, sizing, tab/sidebar
layout, overflow limits, animation logic, color theory for stacked/active
components, notification banners, panels/boards, grids, export/import
panels, and a separate installer design skill). **Load and apply that skill
package for this entire prompt** rather than re-deriving design rules from
scratch — it already encodes "never use Lucide icons" and "no AI-generic
look" as hard constraints.

## Hard constraints (repeat of the ground rules, specific to this file)

- **No floating anything.** No panels/pills/toolbars that hover disconnected
  from the layout with a shadow underneath implying elevation over nothing.
  If something needs to appear contextually (a tooltip, a context menu),
  it should feel anchored, not floating.
- **No transparent/glassmorphism surfaces.** No `backdrop-blur`, no
  translucent panel backgrounds. Confirmed in the audit: 58 files currently
  use blur/translucency/opacity-based surface patterns
  (`grep -rlE "backdrop-blur|bg-white/[0-9]|bg-black/[0-9]" app/src`) —
  that's your real scope, not a hypothetical. Every one of those needs a
  solid-surface replacement.
- **Smooth transitions, not floating/fade tricks.** Height, position, and
  color transitions that resolve to a real, grounded state. Motion should
  communicate *where something went*, not just fade in and out of existence.
- **No Lucide icons** (per the skill pack). Pick one consistent icon system
  and apply it everywhere — audit `app/src` for current icon usage first
  (`@heroicons/react` is already a dependency — decide whether that's the
  kept system or whether the skill pack specifies something else, and be
  consistent, not mixed).

## Scope

1. **Color system.** Build a real palette with semantic tokens (surface
   levels, not just "gray-100/200/300" — think "panel," "panel-raised,"
   "panel-sunken," "accent," "accent-muted," "destructive," etc.) so
   components can express state (active/inactive/error/processing) through
   color relationships, not opacity tricks. Reference the skill pack's
   color-theory-for-stacked-components guidance directly.
2. **Component audit and rebuild.** Go through the existing component
   library (`app/src/components/` — 275 files, organized by feature area:
   `AudioStudio`, `AudioPlayer`, `ServerTab`, `Store`, `VoiceChat`,
   `ShinyText`, etc.) and build a canonical set: buttons, inputs, sliders,
   tabs, panels, modals/dialogs, toasts/notifications, tooltips, dropdowns,
   empty states, loading states, error states. Every existing usage should
   eventually consume the canonical component, not a one-off styled variant.
3. **Layout logic.** Sidebar behavior, tab layout, overflow handling
   (what happens when there are more tracks/tools than fit on screen —
   scroll? collapse? paginate?) — the skill pack has explicit guidance here,
   use it rather than improvising per-screen.
4. **Empty and negative space.** Audio production tools live and die on
   information density done right — too sparse feels unfinished, too dense
   feels like a spreadsheet. The skill pack's empty/negative-space guidance
   should directly inform panel padding and grouping across the whole app,
   not just individual screens.
5. **Notification/banner system.** One consistent pattern for
   errors/warnings/success/info, replacing whatever inconsistent toast/banner
   patterns currently exist (audit `app/src/components/ui/use-toast` and any
   other alerting mechanism in use first).

## Feature-exposure audit (part of this pass, not a separate pass)

You (Ehis) said: "expose missing or undiscovered features." The backend has
an enormous surface — `docs/FEATURES.md` claims every capability is
"verified against code," and `docs/knowledge/` has 100+ topic files (one per
feature area: pitch map, spectrogram, ADR mode, multi-take comping, spatial
audio, dubbing, audiobook pipeline, custom skills, and more). Cross-reference
that list against what's actually reachable through the current UI:

1. Build a checklist from `docs/FEATURES.md` and `docs/knowledge/00-index.md`.
2. For each feature, find the UI entry point (or confirm there isn't one).
3. Anything with backend support but no UI path is a "hidden feature" —
   flag it for the redesign to surface, don't silently leave it buried.
4. Cross-check `backend/data/app_features.json` too — that file looks like
   it may already be a machine-readable feature manifest; if so, it might be
   the fastest way to generate this checklist rather than doing it by hand.

## Sequencing note

This is step 1 of 03's build order, not a separate later pass: 03 requires
the canonical component library and design tokens from this prompt to exist
*before* any real screen gets built. Build and prove this library on a demo
page first (03's "build order" section), then hand it off — every screen
built after this point consumes it, none invents a one-off styled element.

## Deliverable

A design-tokens file (colors, spacing, radii, motion durations/easings) +
a canonical component library, applied first to 2-3 representative screens
as a proof of direction before rolling out app-wide. Get sign-off on the
proof screens before touching all 275 components.
