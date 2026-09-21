# Audio Studio — Advanced Editing Features Plan

## Goal
Transform the Audio Studio from a basic DAW into a professional-grade audio editor with parametric EQ, advanced stem separation, interactive spectrogram, frequency-aware visualization, and clip-level editing tools.

---

## Feature Areas

### 1. Parametric EQ (replace 3-band shelf)

**Current state:** 3-band shelf EQ with hardcoded cutoffs (300Hz / 2650Hz / 5000Hz). No frequency select, no Q control.

**Target:** Full parametric EQ with 4+ bands, each with frequency, gain, Q, and type (lowshelf/peak/highshelf).

**Files to change:**
- `app/src/features/audioStudio/buildEffectChain.ts` — Replace 3 BiquadFilters with configurable parametric chain
- `app/src/features/audioStudio/PluginChainPanel.tsx` — New EQ UI with frequency graph + draggable nodes
- `backend/services/effects.py` — Upgrade `eq` effect to accept per-band params
- `backend/routes/audio_pipeline/processing.py` — Update `/audio/eq` endpoint

**Spec:**
- 4 bands: Low shelf, 2x Peaking, High shelf
- Per-band: frequency (20-20000 Hz), gain (-12 to +12 dB), Q (0.1 to 10)
- Visual: mini frequency response curve in the plugin panel (SVG or canvas)
- Real-time via Web Audio API BiquadFilterNode (already used, just need parameterization)
- Backend: FFT-domain parametric EQ for bounce/offline

---

### 2. Stem Separation — Extended Modes

**Current state:** 4 stems (vocals, drums, bass, other) via Demucs HTDemucs ONNX. Dropdown in StudioToolbar shows only these 4.

**Target:** Per-stem isolation with "remove X, keep everything else" mode. User wants to remove vocals and keep the beat.

**Files to change:**
- `app/src/features/audioStudio/StudioToolbar.tsx` — Expand stem dropdown with "Isolate" vs "Remove" modes
- `app/src/features/audioStudio/useStudioIsolation.ts` — Support inverted stem extraction
- `backend/services/stem_separation_onnx.py` — Add `invert` flag (mix - stem)
- `backend/routes/audio_pipeline/processing.py` — Add `invert` param to `/audio/separate`

**Spec:**
- Mode selector: "Isolate" (keep stem) / "Remove" (subtract stem from mix)
- "Remove Vocals" = mix - vocals = instrumental beat
- "Remove Drums" = mix - drums = no-percussion
- UI: toggle switch next to stem dropdown, or two-column layout (Isolate | Remove)
- Backend: when `invert=True`, compute `result = mix - separated_stem` with clipping protection

---

### 3. Stitching / Crossfade at Frequency Boundaries

**Current state:** Crossfade exists (`CrossfadeCanvas.tsx`, `smart_crossfade` effect) but is time-domain only. No frequency-aware stitching.

**Target:** Frequency-aware crossfade that can blend low frequencies from one clip and high frequencies from another (e.g., keep bass from track A, highs from track B).

**Files to change:**
- New: `app/src/features/audioStudio/FrequencyStitchPanel.tsx` — UI for frequency split point
- New: `backend/services/frequency_stitch.py` — FFT-domain frequency split + crossfade
- `app/src/features/audioStudio/AudioStudioStore.ts` — Add `frequencyStitch` state per track pair
- `backend/routes/audio_pipeline/processing.py` — New endpoint `POST /audio/frequency-stitch`

**Spec:**
- Split point: user sets crossover frequency (100-10000 Hz)
- Below crossover: take from source A (or B)
- Above crossover: take from source B (or A)
- Crossfade width: configurable (1-100 ms) around the split point
- Use cases: vocal removal (keep lows from instrumental, remove vocal freq range), layering beats
- Backend: FFT, apply frequency-domain windowing, inverse FFT

---

### 4. Layering / Multi-Stem Mixing

**Current state:** Track groups and submixes exist. Bounce mixes all tracks. No dedicated layering UI.

**Target:** Dedicated layering panel where users can stack stems with per-layer volume, pan, and frequency assignments.

**Files to change:**
- New: `app/src/features/audioStudio/LayeringPanel.tsx` — Visual stack of stems with per-layer controls
- `app/src/features/audioStudio/AudioStudioStore.ts` — Add `layers` state (ordered stem list with assignments)
- `app/src/features/audioStudio/TrackStripInner.tsx` — Layer assignment dropdown

**Spec:**
- Visual: vertical stack showing each layer (stem) with waveform thumbnail, volume, pan, mute, solo
- Drag to reorder layers (top = foreground)
- Per-layer frequency range assignment (optional): " lows only", "mids only", "highs only", "full range"
- Quick presets: "Vocal + Beat", "Full Mix", "Instrumental Only", "Drums + Bass"
- Layering is non-destructive: original tracks preserved, layering is a playback/render concept

---

### 5. Spectrogram — Interactive + Color Per Type

**Current state:** Static HSL heatmap (blue-to-red). No interactivity, no frequency labels, no time axis, no colormap options.

**Target:** Interactive spectrogram with cursor readout, zoom, multiple colormaps, frequency-band highlighting, and per-sound-type coloring.

**Files to change:**
- `app/src/features/workspace/spectrogram/SpectrogramCanvas.tsx` — Major rewrite for interactivity
- `app/src/features/audioStudio/TrackVisuals.tsx` — Enhanced spectrogram overlay
- New: `app/src/features/audioStudio/SpectrogramControls.tsx` — Colormap, zoom, frequency range
- Backend: `backend/routes/spectrogram.py` — Return frequency bin labels + time stamps

**Spec:**

**Interactivity:**
- Hover: show frequency (Hz), time (s), amplitude (dB) at cursor
- Click: play from that time position
- Drag: select time range for editing
- Scroll: zoom in/out on time axis
- Shift+scroll: zoom on frequency axis

**Colormaps (selectable):**
- `magma` — perceptually uniform, good for speech
- `inferno` — high contrast, good for music
- `viridis` — classic, balanced
- `turbo` — rainbow with good perceptual uniformity
- `grayscale` — for printing/accessibility
- Custom: user-defined color stops

**Per-sound-type coloring:**
- Speech frequencies (80-8000 Hz): warm tones (orange/red)
- Music fundamentals (20-1000 Hz): cool tones (blue/cyan)
- Percussion transients (high freq bursts): bright highlights (yellow/white)
- Noise floor: muted gray
- User can toggle which type is highlighted

**Frequency-band highlighting:**
- Sub-bass (20-60 Hz): purple overlay
- Bass (60-250 Hz): blue
- Low-mid (250-500 Hz): cyan
- Mid (500-2000 Hz): green
- Upper-mid (2000-4000 Hz): yellow
- Presence (4000-6000 Hz): orange
- Brilliance (6000-20000 Hz): red
- Toggle visibility per band

---

### 6. Clip-Level Editing in DAW

**Current state:** trimStart/trimEnd exist as data fields but no UI. No split/slice tool. No time selection.

**Target:** Click-drag trim handles, split tool, time selection for region operations.

**Files to change:**
- `app/src/features/audioStudio/TrackVisuals.tsx` — Add trim handles + time selection overlay
- New: `app/src/features/audioStudio/TrimHandles.tsx` — Draggable trim start/end handles
- New: `app/src/features/audioStudio/TimeSelection.tsx` — Drag to select time range
- `app/src/features/audioStudio/AudioStudioStore.ts` — Add `splitTrack`, `deleteRegion`, `insertSilence` actions
- `app/src/features/audioStudio/StudioToolbar.tsx` — Add Split, Delete Region, Insert Silence tools

**Spec:**
- Trim handles: drag left/right edge of waveform to set trimStart/trimEnd
- Split tool: click on waveform at a point → splits track into two clips at that position
- Time selection: click+drag on empty area of track → highlights region → right-click for context menu (cut, copy, delete, silence, normalize)
- Delete region: removes selected time range, shifts audio left
- Insert silence: adds silence at playhead position

---

### 7. Advanced Waveform Display

**Current state:** Monochrome peak bars. No RMS overlay, no phase display, no clip indicators.

**Target:** Multi-layer waveform with RMS envelope, clip indicators, and configurable display.

**Files to change:**
- `app/src/features/audioStudio/WaveformCanvas.tsx` — Add RMS layer, clip indicators
- `app/src/features/audioStudio/getPeakWaveform.ts` — Also extract RMS peaks
- New: `app/src/features/audioStudio/WaveformDisplayOptions.tsx` — Display settings

**Spec:**
- Peak bars (current) + RMS envelope (lighter shade inside)
- Clip indicators: red markers where amplitude hits 0 dBFS
- DC offset line: subtle center line
- Grid lines: time grid synced to BPM/tempo map
- Display modes: Peaks only, Peaks + RMS, RMS only, Spectrogram (existing)

---

## Decisions (locked)
- **EQ:** 4 bands (low shelf + 2 peaking + high shelf)
- **Stem removal:** Mode toggle (Isolate/Remove) next to stem dropdown
- **Frequency stitching:** Range with overlap (low-pass + high-pass with adjustable overlap zone)
- **Spectrogram zoom:** Compute on-demand (recompute FFT for visible region, lower RAM)

---

## Implementation Order (phases)

### Phase 1: Parametric EQ + Stem Removal (highest impact)
1. Upgrade EQ to 4-band parametric (frontend + backend)
2. Add "Remove" mode to stem separation
3. Add frequency response visual to EQ plugin

### Phase 2: Spectrogram Upgrade
4. Add interactivity (cursor, zoom, click-to-play)
5. Add colormap selector
6. Add frequency-band highlighting
7. Add per-sound-type coloring

### Phase 3: Clip Editing + Waveform
8. Add trim handles to waveform
9. Add split tool
10. Add time selection + region operations
11. Upgrade waveform with RMS + clip indicators

### Phase 4: Stitching + Layering
12. Build frequency stitch backend endpoint (range with overlap)
13. Build frequency stitch UI
14. Build layering panel
15. Wire layering to bounce/render

---

## Assumptions
- Demucs HTDemucs supports the inverted stem extraction (mix - stem) — verified: standard operation
- Web Audio API BiquadFilterNode supports parametric EQ (peak filter type) — verified: yes, type="peaking"
- FFT-based frequency stitch with overlap is feasible for short clips — needs benchmarking
- Canvas-based spectrogram with on-demand compute needs requestAnimationFrame throttling
- Existing undo/redo stack covers new clip operations — need to verify state shape changes don't break snapshots

## Biggest Risk
- **Spectrogram on-demand compute performance**: Recomputing FFT on every zoom/pan could lag. Mitigation: debounce zoom events (150ms), cache recently-viewed regions, show loading indicator during recomputation, limit max FFT size based on zoom level.

## Open Questions
- Should the EQ visual be a separate panel or inline in the plugin card?
- For frequency stitching overlap range, default width? (I'd suggest 200Hz overlap centered on crossover)
