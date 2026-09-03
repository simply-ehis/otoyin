# 27 — New Audio Effects

Extended effects library added to the effects registry and built-in presets.

## New Effect Types (backend/services/effects.py)

| Effect | Description | Key Parameters |
|--------|-------------|----------------|
| gender_swap | Pitch + formant shifting for gender transformation | amount (-1 to 1) |
| age_shift | Shift perceived voice age | amount (-1 to 1) |
| helium | High-pitched helium voice | intensity (0–1) |
| vocoder | Robotic vocoder via amplitude modulation | rate_hz, depth, mix |
| telephone | Bandpass filter simulating telephone/radio | low_cutoff, high_cutoff, compression |
| megaphone | Distortion + bandpass for megaphone effect | distortion_gain, low/high_cutoff |
| underwater | Lowpass + reverb + tremolo | cutoff, reverb_amount, tremolo_rate/depth |
| whisper_transform | Remove fundamental, enhance breathiness | breathiness, pitch_factor |
| auto_tune | One-tap scale-aware pitch correction | speed, strength |
| spectral_duck | Dynamic EQ sidechaining | duck_amount_db, freq_low/high, threshold |
| multi_band_pitch | Isolate and shift frequency bands | low/mid/high_semitones, low/high_cutoff |
| resonant_filter_sweep | LFO-swept filter with resonance | cutoff_start/end, resonance, lfo_rate |
| spectral_repair | Remove clicks, sibilance, plosives | strength |
| multi_mic_phase | Smart phase cancellation for bleed removal | strength |
| smart_crossfade | Non-linear adaptive crossfade | fade_length_ms |

## New Built-in Presets

| Preset | Description |
|--------|-------------|
| chipmunk | High-pitched chipmunk (+7 semitones) |
| radio_host | Warm radio host with compression |
| monster | Deep, menacing voice (-5 semitones) |
| whisper | Soft whispery voice (+2 semitones, highpass) |
| reverb_cathedral | Large cathedral reverb (room_size 0.95) |
| reverb_hall | Large hall reverb (room_size 0.8) |
| reverb_room | Small room reverb (room_size 0.3) |
| reverb_plate | Metallic plate-style reverb |

## Existing Effects (preserved)

chorus, reverb, compressor, gain, highpass, lowpass, delay, pitch_shift — all via pedalboard.

## Agent Callable
- **MCP Tools:** `21labs.emotion_tone`, `21labs.breath_pause`, `21labs.adjust_pauses`, `21labs.fade_in`, `21labs.fade_out`, `21labs.splice`, `21labs.delete_region`, `21labs.insert_silence`, `21labs.trim_silence`, `21labs.apply_audio_tags`, `21labs.list_audio_tags`, `21labs.sample_manifest`
- **REST Endpoints:** `GET /effects/available`, `POST /audio/emotion-tone`, `POST /audio/breath-pause`, `POST /audio/adjust-pauses`, `POST /audio/fade-in`, `POST /audio/fade-out`, `POST /audio/splice`, `POST /audio/delete-region`, `POST /audio/insert-silence`, `POST /audio/trim-silence`, `POST /audio/apply-tags`, `GET /audio/tags`, `GET /audio/sample-manifest`, `POST /audio/tag-preview`
- **Key Backend Files:** `backend/services/effects.py`, `backend/services/effects_extended.py`, `backend/routes/audio_effects.py`, `backend/services/audio_tags.py`, `backend/services/audio_sample_library.py`
- **Key Frontend Files:** `app/src/components/Workspace/EffectsView.tsx`, `app/src/components/EffectsTab/EffectsTab.tsx`
