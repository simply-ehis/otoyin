# Otoyin — Complete Feature Inventory

Every entry verified against code (counts: registries, routers, tools, skills).
Branding: 21labs. License model: free open-source app, paid premium models.

## 1. Text-to-speech

- **Runtime registry** (26 engine ids, `backend/backends/registry/tts.py`):
  kokoro, pocket_tts, moss_tts_nano, kitten_tts, parler_tts_gguf,
  neutts, neutts_2e, orpheus, qwen3_tts, bark_small, fish_speech_s2, voxcpm2,
  phonon, inflect_v2, supertonic, piper_tts, chatterbox_turbo, audio8_tts,
  cosyvoice3, magpie_tts, omnivoice, yue2, zonos3, fish_drama3, sa3_music, moss_soundeffect
  (all audio.cpp-supported engines run as audio.cpp one-shots; ONNX/torch runtimes deleted 2026-11-14).
- **Low memory mode** - `low_memory_mode` generation-settings toggle (Settings > Generation). Passes audiocpp's `.mem_saver=true` session option to the families that implement it (fish_audio, qwen3_tts, omnivoice, cosyvoice3, audio8_tts, stable_audio [sfx+music], yue2, voxcpm2) - cached AR/phase graphs are released after each phase instead of staying resident. Slower per chunk, lower peak RAM/VRAM; unsupported engines silently ignore it. Power users can also pass any audiocpp session option via `TWENTYLABS_AUDIOCPP_SESSION_OPTS` (e.g. `qwen3_tts.kv_cache_type=f16`) - no KV-cache quantization exists for TTS upstream today (qwen3_tts KV is f16 max); qwen3 F16 KV and `qwen3_tts.stitch_decode=true` are the available RAM/seam levers.
- **Model catalog** (24 TTS entries in `backend/backends/configs/tts.py`; 7 music + 2 SFX in `configs/music.py`): Kokoro (~181MB GGUF),
  Pocket TTS (26 voices), MOSS TTS Nano, Kitten TTS, Parler-TTS Mini,
  Qwen3 TTS 1.7B (Apache-2.0, 10 langs), Fish Audio S2 Pro (non-commercial-research),
  VoxCPM2 (Apache-2.0, 30 langs), Bark Small (non-verbal tags: [laughter], [laughs], [sighs], ...), NeuTTS-Air (clone), NeuTTS-2E (audio.cpp; 9 voices + emotion),
  Supertonic-3 (31 languages; 10 preset voices, Apache-2.0), Piper (MIT),
  Inflect Micro v2 (69MB tiny English CPU TTS, Apache-2.0, requires eSpeak-ng),
  Phonon-31m (81MB tiny CPU), Chatterbox-Turbo (English only, built-in voice, 19 emotion/style tags),
  Audio8-TTS (clone, 12 langs, Apache-2.0), CosyVoice3 (clone + cross-lingual, Apache-2.0),
  MagpieTTS-357M (10 baked voices, Apache-2.0), OmniVoice (600+ langs, CC-BY-NC-4.0),
  Yue2-3B (music generation, CC-BY-NC-4.0), ZONOS3-Mini (Zyphra, Apache-2.0),
  Drama-3 (FACL v1.0, CUDA-only, 23.5GB), MOSS-SoundEffect v2 (Apache-2.0, SFX),
  Stable Audio 3 Small Music (Stability Community License).
- **Model slot policy** — multiple engines stay resident at once (warm pool), capped by `TWENTYLABS_WARM_POOL_MAX_ENGINES` (default 4) and `TWENTYLABS_WARM_POOL_MAX_MB` (default 16 GB); LRU eviction, Performance-Mode keep-warm pins never evicted. One-shot audio.cpp engines don't occupy slots. VRAM pressure gate + idle-unload still apply.
- **Cloning** — two paths: cloned profiles (`pocket_tts`, `neutts`, `qwen3_tts`, `fish_speech_s2`, `voxcpm2`)
  and generation-time reference (five engines incl. `qwen3_tts`, `fish_speech_s2`, `voxcpm2`).
  NeuTTS-2E is built-in-voices + emotion only (audio.cpp neutts family has no cloning; migrated 2026-11-14).
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
- Word-level timestamps, speaker diarization *(opt-in: requires `pip install resemblyzer silero-vad scikit-learn` — removed from defaults to keep torch out)*, streaming STT, subtitles (SRT/VTT)
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
