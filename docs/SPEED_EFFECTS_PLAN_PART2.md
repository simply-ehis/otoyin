# Speed, Effects & Streaming Plan (Part 2)

## 3. Effects Trimming, Arrangements & Improvements

### Current State
- 11 built-in effects via Web Audio API (reverb, EQ, compressor, delay, chorus, etc.)
- Effects are "flanky" — inconsistent quality, no professional-grade algorithms
- Plugin chain stored per-track, applied at playback time

### Plan
- Replace with Spotify Pedalboard: Use Spotify's Pedalboard Python library on the backend for professional-grade effects
- Backend endpoint: /api/audio/effects — accepts audio file + effect chain config, returns processed audio
- Frontend: Send audio to backend for processing, cache results, show processing indicator
- Effects trimming: Remove redundant/low-quality effects (megaphone, resonant_filter_sweep, basic gain); keep only professional ones
- Arrangements: Add effect presets/chains (e.g., "Vocal Polish", "Podcast Master", "Music Master") as one-click apply
- A/B comparison: Already implemented — keep and improve

### Spotify Pedalboard Effects to Use
- Reverb (room size, damping, wet/dry)
- Delay (time, feedback, mix)
- Chorus (rate, depth, mix)
- Compressor (threshold, ratio, attack, release)
- Limiter (threshold, release)
- EQ (low/mid/high shelf + parametric bands)
- Gain (dB)
- Distortion (drive)
- Phaser (rate, depth, mix)
- Flanger (rate, depth, mix)
- PitchShift (semitones)
- Resample (quality)

### Files to modify
- backend/requirements.txt — add pedalboard>=0.9.0
- backend/backends/effects.py — new module wrapping Pedalboard
- backend/api/routes/effects.py — new endpoint
- app/src/features/audioStudio/buildEffectChain.ts — remove or deprecate client-side effects
- app/src/features/audioStudio/PluginChainPanel.tsx — update UI for new effect list
- app/src/features/audioStudio/pluginCatalog.ts — update catalog with Pedalboard effects

## 4. Model Loading Tags (Speed & Performance)

### Current State
- ModelConfig has min_ram_mb, min_vram_mb, size_mb but no speed/performance tags
- No preloading or priority system

### Plan
- Add to ModelConfig: preload_priority (0-3), cold_start_ms, warm_start_ms, streaming (bool), quant, execution_provider
- Display speed badges in UI: "Fast", "Medium", "Slow" based on warm_start_ms
- Add model loading progress bar during preload
- Show "Ready" indicator when high-priority models are loaded

### Files to modify
- backend/backends/protocols.py — extend ModelConfig
- backend/backends/configs/*.py — add tags to all configs
- app/src/features/models/ — display speed badges

## 5. Moonshine STT (Not Whisper)

### Current State
- Moonshine backend exists (moonshine_backend.py) using transcribe.cpp
- Whisper backend exists (whisper_cpp_backend.py) via pywhispercpp
- Both are available as model options

### Plan
- Default to Moonshine for English STT (faster, lower latency, MIT license)
- Whisper available as fallback for multilingual needs
- Moonshine Streaming Small (189 MB) for real-time STT with streaming
- Remove Whisper from default recommendations; keep as advanced option
- Ensure Moonshine is properly wired in frontend model selection

### Files to modify
- backend/backends/configs/stt.py — reorder configs (moonshine first)
- app/src/features/models/ — default selection logic

## 6. UI Compacting & Layering (from Phase 5, continued)

### Plan
- Reduce track strip default height
- Improve visual layering with subtle shadows/borders between stacked tracks
- Make the audio studio feel more spacious while being compact
- Add "compact mode" toggle for ultra-dense view

## Implementation Order

1. Week 1: Streaming TTS/STT endpoints + frontend streaming playback
2. Week 2: Model loading tags + preloading + speed badges
3. Week 3: Spotify Pedalboard backend integration + effects re-wiring
4. Week 4: Effects trimming + presets + A/B improvements
5. Week 5: Moonshine default + Whisper demotion + UI polish

## Quick Wins (can do immediately)
- Add pedalboard to backend requirements
- Create backend/backends/effects.py wrapping Pedalboard
- Add /api/audio/effects endpoint
- Update pluginCatalog.ts with Pedalboard effect list
- Add streaming support to Kokoro backend (already has generator)
- Add model loading progress to frontend
- Set Moonshine as default STT in model configs
