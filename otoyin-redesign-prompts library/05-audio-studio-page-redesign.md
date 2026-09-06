# Prompt: Audio Studio (Editing) Page — Focused Redesign

## Context

This is the flagship screen — the one that has to look and feel like a real
audio studio, not a chat-app-with-a-waveform-bolted-on. Current structure,
confirmed in the repo:

- `app/src/components/AudioStudio/AudioStudio.tsx` — 370 lines, the main
  page shell.
- `app/src/components/AudioStudio/AudioStudioStore.ts` — state.
- `app/src/components/AudioStudio/audioStudio/` — a subdirectory with 40
  files, so the actual editing surface (waveform, tools, panels) is broken
  out from the shell already — good, that structure is worth preserving
  through the redesign rather than flattening it.

Relevant knowledge docs to read before touching anything (source of truth
for what this page is *supposed* to do — don't redesign blind):
`docs/knowledge/02-waveform-editor.md`, `03-pitch-map.md`,
`04-voice-effects.md`, `06-mixer.md`, `23-transcript-edit.md`,
`57-frontend-audiostudio-generation.md`, `60-editing-primitives-and-story-pan.md`,
`ABOUT-AUDIO-STUDIO.md`.

## What this pass covers

1. **Apply the design system from 04** to this page first — it's the best
   proving ground precisely because it's the most complex screen. If the
   canonical components and motion rules survive contact with the waveform
   editor, mixer, and pitch map without compromise, they'll work everywhere
   else too.
2. **Tool discoverability.** With 40 files' worth of editing capability in
   one page, the redesign's job is making sure a first-time user can *find*
   things — effects, the pitch map, transcript-driven editing, spectrogram
   view — without them being buried in nested menus. Cross-reference against
   the feature-exposure audit from 04.
3. **Real-time visual feedback.** VU meters, waveform scrubbing, playhead
   position — these need to feel instant. Staying on React means this has
   to be earned through careful implementation (memoization, keeping
   high-frequency updates like meter levels out of React's render tree
   entirely where possible — e.g. driving a `<canvas>` or direct DOM refs
   from a rAF loop instead of state-driven re-renders), not inherited from
   a framework-level guarantee. Budget real profiling time on this
   component set specifically before calling it done.
4. **Multi-track / mixer clarity.** `06-mixer.md` describes bus routing,
   auto-duck, mastering to broadcast LUFS. Track headers, sends, and
   automation lanes are classic places where DAWs either feel professional
   or feel like a toy — study a couple of real reference points (your own
   judgment on what "real audio studio" software looks like) and make
   deliberate choices about track height, header density, and meter
   placement rather than defaulting to generic list styling.
5. **No floating toolbars over the waveform.** This is the single most
   common "AI app" tell in editor UIs — a translucent floating toolbar
   hovering over the content it's editing. Dock tool palettes to real,
   grounded panel edges instead.

## Deliverable

A redesigned Audio Studio page (or a plan + wireframe-level description, if
this is a planning pass) that: preserves the existing `audioStudio/`
subdirectory's functional breakdown, applies the 04 design system, and
includes a short note on which backend-supported features (from the 04
feature audit) get a new visible entry point on this specific page.
