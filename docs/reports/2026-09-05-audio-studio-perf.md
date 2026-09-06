# Audio Studio perf pass (prompt 05 leftover)

Static audit of every canvas/rAF surface in `app/src/features/audioStudio/`
plus the one real fix found. Live FPS measurement was out of reach on this
box (no browser harness, no models for loaded playback) — the procedure at
the bottom records exactly what to run on capable hardware.

## Inventory (all verified by reading)

| Surface | Pattern | Verdict |
|---|---|---|
| `usePlaybackEngine` rAF loop | Direct audio-param writes + single `setCurrentTime` per frame for the playhead; analyser buffers allocated once outside the loop; rAF cancelled on unmount | Correct |
| `TrackMeter` | Direct `style.height` writes, zero React state, cleanup resets bars | Correct after fix below |
| `TransportBar` | Media-event driven + one guarded rAF with cancel | Correct |
| `WaveformCanvas`, `MidiPianoRoll`, `CrossfadeCanvas`, `AutomationOverlay` | DPR-aware, effect-driven redraws (not per-frame), `clearRect` before paint | Correct |
| `SpectrogramCanvas` | Backend-computed data, single paint per response | Correct |
| CSS pill-bar animations | `transform: scaleY` only (GPU-composited) | Correct |

## The one fix

`TrackMeter`'s level bar carried `transition-[height] duration-75` while
being written every animation frame — the transition interpolates behind
the writes and the meter visibly lags. Removed (with a comment so nobody
re-adds it); the peak-hold logic already provides visual smoothing.

## Known non-issues (do not "fix")

- `setCurrentTime` per frame in the playback loop is intentional: the
  playhead subscribes to it. Throttling it would visibly step the playhead.
- `get_tts_backend_for_engine`-style factory calls in listing paths only
  run cheap constructors (verified in the 07-Part-A audit).

## Measurement procedure (for capable hardware)

1. `just dev-web`, open `/audio-studio` with a 8-track session playing.
2. DevTools Performance: 10s capture → assert main-thread long tasks < 50ms,
   rAF cadence steady 60fps, no forced reflows (look for purple Layout
   blocks aligned to frames).
3. React DevTools Profiler: commit count during playback should be ~1/s
   (playhead) plus meter-free — any component committing per frame outside
   the playhead path is a regression of this pass.
4. Budgets: playhead commit < 3ms, meter DOM writes < 1ms/frame total,
   canvas full-redraw only on data/size change (never per frame).
