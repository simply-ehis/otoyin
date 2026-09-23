# Otoyin — Complete Feature Inventory

Every entry verified against code (counts: registries, routers, tools, skills).
Branding: 21labs. License model: free open-source app, paid premium models.

## 1. Text-to-speech

- **Runtime registry** (13 engine ids, `backend/backends/registry/tts.py`):
  kokoro, pocket_tts, moss_tts_nano, kitten_tts, zonos_gguf, parler_tts_gguf,
  neutts, neutts_2e, orpheus, qwen3_tts, bark_small, fish_speech_s2, voxcpm2
  (torch + ONNX/GGUF variants where available).
- **Model catalog** (11 entries, `backend/backends/configs/tts.py`): Kokoro 82M,
  Pocket-TTS, MOSS-TTS-Nano (20 langs), KittenTTS mini (80MB), Zonos v0.1 (clone +
  emotion), Parler-TTS Mini (text-described voice), Qwen3-TTS 1.7B Base (10 langs,
  zero-shot), Fish Audio S2 Pro, VoxCPM2 2B (30 langs), Bark Small (non-verbal
  sounds), Kokoro-ONNX.
- **Cloning** — two paths: cloned profiles (`zonos`, `styletts2`, `pocket_tts`)
  and generation-time reference (`moss_tts_nano`, `neutts_2e`, `qwen3_tts`).
- **Voice profiles** — preset / cloned / designed, per-engine presets, reference
  voice shelf (`GET /reference-voices`, 1-click clone source).
- **Long-form** — chunked narration with per-chunk timeout, needs-trim handling,
  voice blending (`af_bella,af_sky`), custom `.pt` packs.

## 2. Speech-to-text

- **17 catalog models across 5 families** (`backend/backends/configs/stt.py`):
  Whisper.cpp (tiny/base/large-v3-turbo GGUF), Faster-Whisper (tiny→large-v3
  CTranslate2 int8), Moonshine (tiny 35MB / base / streaming small),
  Parakeet TDT 0.6B v3 (25 European languages, native C++), Qwen3-ASR
  (0.6B/1.7B INT4, 52 languages), Cloud BYOK.
- Word-level timestamps, speaker diarization, streaming STT, subtitles (SRT/VTT)
  with speaker labels.

## 3. Voice conversion

- RVC v2 (file-based packs + ONNX packs), Seed-VC zero-shot (isolated side-venv,
  `data/models/seed_vc_venv`), OpenVoice V2 ONNX tone-color (6 langs),
  NeuTTS-Air/2E and Orpheus pipelines.

## 4. Takes pipeline (captures → video-use)

- Record/listen on `POST /captures`, auto-pack on finalize.
- `GET /captures/{id}/words` — Scribe-shaped word JSON (the video-use contract).
- `GET /captures/{id}/chapters` — chapter marks; highlights API for selects.
- Packed transcript viewer in-app; uncapped markdown packs for export.
- 39–53 backend takes tests + frontend pack tests green.

## 5. Editing & effects

- Waveform editor, pitch map (piano roll), spectrogram, audio clipboard,
  transcript-driven editing (word timestamps → re-render).
- **28 effect types** (`EFFECT_TYPES`) + cleanup suite: de-esser, spectral
  denoise, RNNoise/VAD, noise gate, compressor, EQ, pitch/formant shift,
  time-stretch, reverb/delay, mastering glue + limiter.
- Non-destructive everywhere (undo/redo on every operation).

## 6. Mixing, loudness, export

- Multi-track mixer: VU meters, mute/solo/pan, bus routing, per-track effects,
  auto-duck (speech ducks music bed).
- LUFS metering (integrated/short-term/true-peak), mastering recipes,
  platform export presets (Spotify/YouTube/Audible/podcast/film/social).

## 7. Dialogue production

- **Stories** — ordered story items with per-item fade/gain/trim/split/reverse/
  normalize/silence-removal/version/reorder, one-mix WAV export.
- **Audiobooks** — EPUB/PDF import, chapter render, per-character voice cast,
  Audible-ready export.
- **Conversation mode** — multi-speaker podcast lines, timed staging, auto-duck,
  auto-level to LUFS target.
- **ADR** — guide-track upload, take recording, quality scoring, auto-select,
  lock, alignment.
- **Comping** — take lanes, region select, composite assemble.
- **Podcast recipe** — Conversation → AutoDuck → −16 LUFS master → MP3 stereo.

## 8. Video dubbing

- Transcribe → translate (Argos packs) → re-voice (any TTS engine) → mux.
- Alignment drift diagnostics, per-segment effect path.

## 9. Real-time

- Voice changer (mic → VAD → denoise → transcribe → synthesize → enhance;
  human-controlled live graph, agent reads capabilities only).
- Speech-to-speech voice chat (VAD turn-taking, barge-in, tool calling).
- Streaming STT; floating **dictate window** (separate Tauri window, Rust
  auto-paste pipeline, speaking pill).

## 10. Music, SFX, instruments

- **Engines**: ACE-Step 1.5 GGUF (full songs, no torch), HeartMuLa 3B, MiniMax
  Music 3, Stable Audio Open + Stable Audio 3 Small (SFX), Cloud BYOK.
- Drum machine (N-step synthesized kits), GM SoundFonts (GeneralUser GS,
  FluidR3), procedural hits (piano/synth/drum/noise, no SoundFont needed).
- Songwriter tab (canonical `acestep_gguf` engine), Steam Audio SDK spatial
  (binaural/Doppler/convolution).

## 11. Enhancement & cleanup

- Demucs vocal isolation, neural bandwidth extension + denoising,
  noise-reduction picker (RNNoise preferred), transcript-based filler removal.

## 12. Agents & automation

- **MCP server** (`/mcp`): 202 `21labs.*` tools across 16 files — speech,
  audio, DSP, dubbing, instruments, generation, studio, workflow, skills,
  batch/dispatch.
- **In-app assistant**: on-device LLM (7 planner configs + cloud tiers, llama.cpp
  sidecar) driving refinement; static skill catalog (`backend/agents/manifest.py`)
  + user custom skills (DB, SkillBuilder UI); 78 dev-time skill packs
  (`.agents/skills/`); 113 knowledge docs (`docs/knowledge/`).
- Batch queue (`POST /batch/jobs`, retry policy), content recipes, automation
  lanes + cue matrix, workflow planner.

## 13. App platform

- 22 frontend feature areas; 9 locales; light/dark/special themes (full-surface).
- Adaptive window: work-area fit (never under the taskbar), fractional default
  size per device, persisted geometry, multi-monitor aware.
- Signed auto-updater (minisign, passworded key, CI-fed password), game modal,
  onboarding, help center + skills browser, audio-reactive Rose identity.
- Backend: 540+ endpoints, model gate + integrity checks, marketplace-only
  model pipeline, health/readiness, offline-first (cloud only via BYOK).
