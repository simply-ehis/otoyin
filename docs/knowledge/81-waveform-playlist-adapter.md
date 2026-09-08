# 81 — Waveform-Playlist Adapter (StoryTrackEditor)

PURPOSE: Document the StoryTrackEditor waveform-playlist v15 adapter — the authority split (playlist paints/zooms; otoyin owns audio, selection, mutations, gestures), the engine's zoom-ladder constraint, the capture-phase pointer bridge, and the ms↔sample mapping.
OWNS: app/src/components/StoriesTab/waveformPlaylist.ts, WaveformPlaylistEditor.tsx, WaveformPlaylistStage.tsx, usePlaylistPointerBridge.ts, TrackLabelCell.tsx. The library internals live upstream (@waveform-playlist/*).
READ-WHEN: Touching the story track editor's clip rendering, zoom, or pointer handling; debugging misplaced clips (sample-rate mismatch is the usual cause); upgrading @waveform-playlist packages.
KEY-FILES: app/src/components/StoriesTab/StoryTrackEditor.tsx, useStoryTrim.ts, useStoryCrossfade.ts, node_modules/@waveform-playlist/core/dist/index.d.ts.
INVARIANTS: The playlist engine stays SILENT (otoyin's playback owns audio); all zoom paths snap through ZOOM_LADDER_SPP (the engine throws off-ladder); the library's drag engine is never engaged (its collision constraint forbids the overlaps crossfades require).
GOTCHAS: `waveform-playlist` on npm is the legacy v4 UMD package — the v15 API is the scoped trio; DOM facts (data-scroll-container, data-clip-id) live in @waveform-playlist/ui-components, not the browser dist; AudioClip has no pan field (per-clip pan stays at playback).
UPDATED: 2026-09-08

## Why

`docs/reports/2026-09-05-media-stack-research.md` decided to replace the
StoryTrackEditor's hand-rolled canvas/SVG waveform stack with
`naomiaro/waveform-playlist` for peak rendering, clip geometry, timescale, and
zoom — while otoyin keeps authority over playback, selection, mutations,
keyboard, and crossfades. The old stack (ClipWaveform + TimelineRuler + hand
positioned clips) had no gesture system and duplicated geometry math that the
library now owns.

## Package layout

The npm name `waveform-playlist` is the **legacy v4 UMD package — do not use**.
The current API is the v15 scoped trio:

- `@waveform-playlist/browser` — React components + contexts
  (`WaveformPlaylistProvider`, `PlaylistVisualization`,
  `usePlaylistData`, `usePlaylistControls`, `usePlaybackAnimation`)
- `@waveform-playlist/core` — types + sample-space math (`AudioClip`,
  `ClipTrack`, `clipPixelWidth`)
- `@waveform-playlist/ui-components` — presentational layer that actually
  renders the DOM: the `ScrollArea` (`data-scroll-container`), clip markup
  (`data-clip-id`), timescale, selection overlay

Verification tip learned the hard way: DOM-level facts (data attributes,
scroller) do **not** live in the browser package's own JSX; check
`@waveform-playlist/ui-components` for DOM-level facts (data attributes,
the `ScrollArea`, clip markup), and the **d.ts** for contracts.

## Authority split (the design)

| Concern | Owner |
| --- | --- |
| Peak rendering, clip geometry, timescale, ladder zoom, scroll container | playlist |
| Audio output | otoyin (`useStoryPlayback`); the playlist engine runs at track volume 0 and is **silent** |
| Clip selection | otoyin's store (`selectedClipId`) |
| Clip move/drag | otoyin via `usePlaylistPointerBridge` → `useMoveStoryItem` |
| Trim | otoyin's `useStoryTrim` (delta-based, works untouched) |
| Crossfades | otoyin's `useStoryCrossfade` |
| Keyboard | otoyin's `useEditorKeyboard` |
| Automation editing | otoyin's `AutomationOverlay`/`AutomationLane` |
| Playhead | otoyin's `currentTimeMs` rendered in the overlay plane |
| Backend FX/export | otoyin |

The library's own drag engine is **deliberately not engaged**
(`interactiveClips={false}`): its `constrainClipDrag` forbids clip overlaps,
while otoyin's crossfades **require** overlaps. Pointer handling flows through
`usePlaylistPointerBridge`, a window **capture-phase** mousedown listener that
runs before the library's handlers: clip presses are stopped from reaching the
library and commit through otoyin's React-Query mutations on release; otoyin's
own handles are exempted via `data-trim-handle`, `data-crossfade-handle`, and
`data-automation-layer` markers.

## Library contracts pinned from dist source (do not re-derive)

1. **Engine zoom ladder**: the `PlaylistEngine` constructor **throws** unless
   the initial `samplesPerPixel` is an exact member of `zoomLevels`, and
   `setZoomLevel()` snaps to the nearest rung — there is no arbitrary zoom.
   All otoyin zoom paths (initial mount, toolbar, scrollbar) snap through
   `ppsToSamplesPerPixel()` onto the frozen dense ladder `ZOOM_LADDER_SPP`
   (×1.5 rungs 256→131072 spp).
2. **samplesPerPixel prop is initial-only** — the provider does not react to
   prop changes; zoom must flow through the ladder (`zoomIn`/`zoomOut` or
   `engine.setZoomLevel`). Otoyin's continuous pps state and the engine's
   snapped value are bridged in `WaveformPlaylistStage` (engine→pps mirror,
   pps→engine push when the snapped rung changes).
3. **DOM facts live in ui-components, not browser** — `data-scroll-container`
   (the `ScrollArea`) and `data-clip-id` (value = `clip.id` = otoyin's
   `item.id`) are rendered by `@waveform-playlist/ui-components`; grepping the
   browser dist finds nothing. `data-track-row`/`data-track-id` come from the
   browser package.
4. **Sample-rate semantics**: the engine converts clip samples↔seconds via
   **each clip's own `sampleRate`**, so every buffer is decoded through one
   shared `AudioContext({ sampleRate: 48000 })` (`TIMELINE_SAMPLE_RATE`) —
   mixed rates would silently misplace clips.
5. **Bugs fixed during verification** (for the next person): the overlay plane
   is `pointer-events-none`, so anything interactive inside it needs
   `pointer-events-auto` on the interactive element (trim buttons, crossfade
   handles) or a wrapper (`data-automation-layer` for automation lanes); and
   `zoomHandleRef` must be populated in the stage from `usePlaylistControls`
   or the toolbar zoom no-ops.

## Mapping (milliseconds ↔ samples)

- `start_time_ms` → `startSample`; `(duration·1000 − trimStart − trimEnd)/speed`
  → `durationSamples`; `trim_start_ms` → `offsetSamples`
- `volume · 10^(gain_db/20)` → `clip.gain` (data only — engine is silent)
- `fade_in_ms`/`fade_out_ms` → `fadeIn`/`fadeOut` durations in seconds
- **Pan has no clip-level mapping**: `AudioClip` has no pan field (pan is
  track-level only). Otoyin's per-clip pan continues to apply at playback in
  `useStoryPlayback`, not in the visualization.

## Files

| File | Role |
| --- | --- |
| `waveformPlaylist.ts` | ms↔sample converters, zoom ladder + snap, clip/track mapping, shared decode helper |
| `WaveformPlaylistEditor.tsx` | outer adapter: audio decode → ClipTracks → provider, theme from CSS tokens |
| `WaveformPlaylistStage.tsx` | inner consumer: scroll-synced overlay plane (crossfades, automation, trim, playhead), engine↔otoyin zoom bridge, zoomHandle |
| `usePlaylistPointerBridge.ts` | capture-phase pointer bridge (select/drag/seek), trim/crossfade/automation exemptions |
| `TrackLabelCell.tsx` | label column kept outside the playlist scroller |

## Verification status

`tsc --noEmit` 0 errors (tree-wide), Biome 0/0 on StoriesTab, placeholder
check clean, line caps respected (largest file 421 lines). The **live smoke
test is still pending** (waveform paint, drag ghost, scroll-sync transform in
the running app) — deferred by the user's "don't build the app at all"
directive; when run, verify select/drag commits via the mutation, trim
handles pass through, automation lanes stay editable, and the playhead tracks
`currentTimeMs`.
