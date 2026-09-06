# Audio Studio Page — Focused Redesign Plan

**Date:** 2026-09-03
**Prompt:** `otoyin-redesign-prompts/05-audio-studio-page-redesign.md`
**Stage:** planning pass (per the pack's sign-off gate: proof screens first, then this page). The design system it builds on is `docs/design/DESIGN_SYSTEM.md` + `docs/design/proof/proof.html`.

## 0. Current structure (verified)

- `app/src/components/AudioStudio/AudioStudio.tsx` — page shell (stores, dnd-kit sensors, transport state, session dialogs, import/export/recording/playback wiring).
- `AudioStudioStore.ts` — state.
- `TransportBar.tsx` / `TransportControls.tsx` / `MonitorPicker.tsx` / `MonitorRecorder.tsx` — transport + monitoring.
- `audioStudio/` (40 files, **keep this breakdown**): `StudioToolbar`, `TrackList`, `TrackStripInner/Parts/Controls/Visuals`, `TrackMeter`, `WaveformCanvas`, `TimelineRuler`, `MidiPianoRoll`, `AutomationOverlay`, `CrossfadeCanvas`, `PluginChainPanel`, `SortableTrackStrip`, `SessionDialogs`, `PodcastProducer`/`ConversationBuilder`, plus 18 pure-logic hooks/utils (playback engine, offline export, drag, MIDI, recording, clip paste, isolation, duck envelope).

The editing surface is already canvas-based and hook-driven — the redesign **restyles and reorganizes the shell/toolbar/track chrome, not the canvas renderers**.

## 1. Layout direction (wireframe-level)

```
┌────────────────────────────────────────────────────────────────────────┐
│ Header (48px): session name · transport (play/stop/loop/record) ·      │
│ timecode · meters · export/save (right-aligned, per layout skill)      │
├───────────────┬────────────────────────────────────────────────────────┤
│ Tool palette  │  Timeline area                                        │
│ (docked left, │  ┌──────────────────────────────────────────────────┐ │
│ grounded,     │  │ TimelineRuler (tick marks, playhead, loop range) │ │
│ never floats  │  ├──────────────────────────────────────────────────┤ │
│ over content) │  │ Track strip row (header, meters, controls)       │ │
│  · Select     │  │  WaveformCanvas / MIDI / automation per track    │ │
│  · Trim       │  │  (canvas — unchanged renderer, new chrome)       │ │
│  · Cut/Join   │  │ …                                                │ │
│  · Pitch      │  │  Crossfade/duck envelopes on clips               │ │
│  · Effects    │  └──────────────────────────────────────────────────┘ │
│  · Spectrogram│  Bottom: mixer strip (bus routing, sends, auto-duck,  │
│  · Isolate    │  mastering to LUFS) — docked panel edge, resizable     │
│  (groups +    │                                                       │
│   shortcut    │                                                       │
│   tooltips)   │                                                       │
└───────────────┴────────────────────────────────────────────────────────┘
```

Rules from the design skills applied here:
- **No floating toolbar over the waveform.** `StudioToolbar` becomes a docked left palette (desktop-ui-panels-boards "tool palettes": one active tool at a time with persistent filled+accent selected state, tool groups with divider gaps, variant flyouts with a corner marker, shortcut in every tooltip, keyboard-first).
- **Track chrome per desktop-ui-panels-boards + the mixer knowledge doc:** real drag handles on panel boundaries (4-6px hit area), min-width floors, persisted arrangement. Track header density: fixed strip header with name, record-arm, mute/solo, meter at a consistent height; meters use canvas/tabular figures, not DOM reflow.
- **Real-time surfaces** stay canvas-based (`WaveformCanvas`, `TrackMeter`) — `requestAnimationFrame` throttled, transform/opacity only for any DOM chrome. This is the leaf-optimization answer to the Solid-perf argument from prompt 03: measured, not assumed.
- **Overflow:** more tracks than fit → scroll within the track list with a styled thin scrollbar (desktop-ui-scrolling-navigation), track height has a compact/comfortable toggle rather than unbounded growth.

## 2. Tool discoverability (from the 04 feature-exposure audit)

Currently buried or menu-nested; give each a visible home on THIS page:

| Capability | Entry point |
|---|---|
| Pitch map (MIDI piano roll) | Docked palette tool "Pitch" → opens right-side grounded panel, not an overlay |
| Effects chain | Docked palette tool "Effects" → grounded panel with the canonical chain list (`PluginChainPanel` restyled; it's in the 12 translucent files) |
| Transcript-driven editing | A "Transcript" toggle in the header — opens the transcript drawer from the right edge (anchored slide-in, not floating) |
| Spectrogram | View segmented control in the timeline header (List/Grid/Timeline pattern): Waveform / Spectrogram / MIDI per track |
| Vocal isolation, auto-duck, mastering | Mixer panel controls, labeled, with real meters (already exist — restyle only) |
| ADR / comping / audio-plan / automation | Palette groups referencing the Workspace views so users discover the broader studio |

## 3. Backend-supported features that get a NEW visible entry point on this page

From the feature-exposure audit, these have backend support and a component but no obvious entry from the Audio Studio page:
- **bark-nonverbals** (Bark laughter/breaths) — expose as an insert effect in the chain panel.
- **loudness-metering / mastering to broadcast LUFS** — a persistent LUFS readout in the mixer panel header (currently only inside effects).
- **timecode** — show the session timecode format in the transport (respects the settings value).
- **drum-machine / GM instruments / DSP synth** — an "Instruments" palette group that jumps to the Workspace views (discoverability link, not a rebuild).

## 4. Motion on this page

- Transport playhead: 60fps canvas draw, `requestAnimationFrame` — no layout animation.
- Toolbar tool switch: instant (keyboard-triggered actions never animate — desktop-ui-motion).
- Panels (transcript drawer, effects panel): anchored slide from the edge, 200ms ease-out enter / 120ms exit, origin-aware; `prefers-reduced-motion` drops transforms.
- Press feedback scale(0.97) on all chrome buttons; hover-gated behind `(hover:hover)`.

## 5. Rollout order

1. Sign-off on `proof.html` (04 gate).
2. Restyle `StudioToolbar` → docked palette; de-translucify `PluginChainPanel`.
3. Track chrome restyle (headers, meters, ruler) with tokens; persist layout.
4. Transcript drawer + spectrogram toggle; mixer panel restyle.
5. Leaf-optimize meters/scrub if jank appears (canvas profiling, not assumption).
6. `bin/check.ps1` green after each phase.

## 6. Verification status

Plan only — no code changed for this page in this pass. Frontend verification is CI-gated (no node_modules in this environment).