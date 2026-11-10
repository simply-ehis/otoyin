# Tab Audit — otoyin workspace

Generated: 2026-10-27. 36 tabs across 6 groups (Core, Voice, Analysis, Processing, Advanced, Export).

Legend: ✅ = present/wired, ⚠️ = partial, ❌ = missing.

## Core
| # | Tab | Path | Purpose | Generate | Model picker | Voice selector | Other missing |
|---|-----|------|---------|----------|--------------|----------------|---------------|
| 1 | Timeline | /workspace/timeline | Arrange tracks, scrub session | ❌ | ❌ | ❌ | clip drag/drop, snap |
| 2 | Mixer | /workspace/mixer | Channel strips, vol/pan/VU | n/a | n/a | n/a | complete |
| 3 | Effects chain | /workspace/effects | Build/preview/save FX chains | n/a | n/a | n/a | complete |
| 4 | Versions | /workspace/versions | Browse generated audio versions | n/a | n/a | n/a | complete |
| 5 | Studio | /workspace/studio | Piano, drum pads, synth, SFX | ✅ | n/a | n/a | complete |

## Voice
| # | Tab | Path | Purpose | Generate | Model picker | Voice selector | Other missing |
|---|-----|------|---------|----------|--------------|----------------|---------------|
| 6 | Voice Changer | /voice-changer | Real-time pitch/formant | n/a | n/a | n/a | complete |
| 7 | Voice Converter | /voice-converter | AI voice-to-voice | n/a | n/a | n/a | complete |

## Analysis
| # | Tab | Path | Purpose | Generate | Model picker | Voice selector | Other missing |
|---|-----|------|---------|----------|--------------|----------------|---------------|
| 8 | Pitch Map | /workspace/pitch | Piano-roll pitch analysis | n/a | n/a | n/a | complete |
| 9 | Spectrogram | /workspace/spectrogram | Frequency spectrum viz | n/a | n/a | n/a | complete |
| 10 | Spatial | /workspace/spatial | 3D binaural/doppler | n/a | n/a | n/a | complete |
| 11 | Synth / DSP | /workspace/dsp | Offline synthesis & DSP | n/a | n/a | n/a | complete |

## Processing
| # | Tab | Path | Purpose | Generate | Model picker | Voice selector | Other missing |
|---|-----|------|---------|----------|--------------|----------------|---------------|
| 12 | Noise Reduction | /workspace/noise-reduction | RNNoise speech cleanup | n/a | n/a | n/a | complete |
| 13 | Enhance | /workspace/audio-enhance | Bandwidth ext + denoise | n/a | n/a | n/a | complete |
| 14 | Stems | /workspace/vocal-isolation | Split into vocals/drums/bass/other | n/a | ❌ (backend supports) | n/a | complete UI |
| 15 | Stem Separation | /stem-separation | Demucs ONNX separation | n/a | n/a | n/a | complete |
| 16 | Transcript | /workspace/transcript | Edit audio via word timestamps | n/a | n/a | n/a | complete |
| 17 | Live Transcript | /workspace/live-transcript | Real-time Whisper STT | n/a | n/a | n/a | complete |
| 18 | Diarize | /workspace/diarize | Speaker diarization | n/a | n/a | n/a | complete |

## Advanced
| # | Tab | Path | Purpose | Generate | Model picker | Voice selector | Other missing |
|---|-----|------|---------|----------|--------------|----------------|---------------|
| 19 | Music Generator | /workspace/music-gen | Generate music from prompt | ✅ | ✅ | n/a | model picker added |
| 20 | ADR | /workspace/adr | Automated dialogue replacement | n/a (recorded takes) | n/a | ✅ (take manager) | complete: guide, takes, align, score, auto-select |
| 21 | Audio Plan | /workspace/audio-plan | AI scene-based audio planning | ✅ | ❌ (backend supports voice_profile_id) | ❌ (optional polish) | core wired; PlanTrackUpdate supports voice_profile_id/engine |
| 22 | Conversation | /workspace/conversation | Multi-speaker dialogue | ❌ (no backend gen endpoint) | ❌ | ❌ (per-speaker voice picker missing) | backend has no generate endpoint; linePayload omits engine/profile_id |
| 23 | Comping | /workspace/comping | Multi-take lane selection | n/a | n/a | n/a | complete |
| 24 | Automation | /workspace/automation | Parameter lanes & cue matrix | n/a | n/a | n/a | complete |

## Export
| # | Tab | Path | Purpose | Generate | Model picker | Voice selector | Other missing |
|---|-----|------|---------|----------|--------------|----------------|---------------|
| 25 | Batch | /workspace/batch | Process multiple files | n/a | n/a | n/a | complete |
| 26 | Export | /workspace/export | One-tap platform presets | n/a | n/a | n/a | complete |
| 27 | Video | /workspace/video | Video preview + audio extract | n/a | n/a | n/a | complete |
| 28 | Download | /workspace/download | Import from YT/SoundCloud | n/a | n/a | n/a | complete |

## Other pages (not in workspace nav)
| # | Page | Path | Purpose | Notes |
|---|------|------|---------|-------|
| 29 | Generate | /generate | TTS generation (PromptBar) | ✅ full model+voice+generate |
| 30 | Dubbing | /dubbing | Video dubbing | ⚠️ segments PATCH/DELETE just wired |
| 31 | Stem Separation | /stem-separation | Demucs ONNX | ✅ full |
| 32 | Voice Clone | /voices/clone | Clone voice | ✅ model+voice |
| 33 | Store | /store | Marketplace | ✅ real models now |
| 34 | Settings/* | /settings/* | Config | ✅ |
| 35 | Help | /help | Help | ✅ |
| 36 | Community Presets | /community | Presets | ✅ |

## Common gaps across tabs
1. **Model picker** — only Generate/Clone/Store have it. Tabs that do AI work (Music Gen, Audio Plan, ADR, Conversation, Stems, Enhance, Noise Reduction, Diarize, Live Transcript, Voice Converter, Voice Changer) lack a model selector.
2. **Voice selector** — only Generate/Clone have it. Tabs that produce speech (ADR, Audio Plan, Conversation, Transcript edit) lack voice picker.
3. **Generate button** — most tabs are view-only (analysis/processing) and don't need generate. Tabs that produce output (Music Gen, Audio Plan, ADR, Conversation, Stem Separation) should have a clear Generate action.

## Recommended fix order
1. Music Generator — add model picker (musicgen) + generate (already has generate text, wire model).
2. Audio Plan — add model picker + voice picker per scene + generate.
3. ADR — add model picker + voice picker (take mgr already).
4. Conversation — per-speaker voice picker.
5. Stems / Stem Separation — model picker (demucs variant).
6. Voice Converter / Voice Changer — model picker.
7. Enhance / Noise Reduction / Diarize / Live Transcript — model picker.

## Stray comments
- ✅ None in own code (only allowed `custom_token_XXX` in orpheus_backend.py).
- Backend placeholder gate (`check_placeholders.py`) passes.
