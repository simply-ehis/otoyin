# Changelog

All notable changes to otoyin will be documented in this file.

## [Unreleased]

### Added
- **Audio Studio plugin catalog is registry-driven** — `pluginCatalog.ts` merges `GET /effects/available` over an offline fallback, so all ~30 renderable backend effects (telephone, vocoder, auto-tune, de-esser, formant shift, …) appear with real ranges; render-only items carry an R badge and a grouped Live/Backend-render dropdown
- **Live Web Audio previews** for chorus, distortion, telephone, megaphone, resonant filter sweep (`buildEffectChain.ts`), with oscillator disposal on stop
- **Render FX** — Tools menu renders the selected track's full chain through `POST /audio/effect-chain` onto a new track, original preserved (`useStudioRenderFx.ts`)
- **Stitch Tracks dialog** — join two tracks end-to-end with crossfade, silence gap, and fade curve via `/audio/blend` (`StitchDialog.tsx`, `useStudioStitch.ts`)
- **Track duplication** — per-track copy button cloning audio, chain, and automation (`duplicateTrack`)
- **Per-stem colors** — isolated stems get a tag, waveform color, and spectrogram hue (vocals/drums/bass/other)
- **Paddle launch checklist** — `docs/PADDLE_LAUNCH_CHECKLIST.md` owner-side steps to take payments live
- **In-app Help catalog v2** — `backend/data/app_features.json` force-tracked (was gitignored, so fresh clones served empty Help), mojibake repaired, new stitch/duplicate/render-FX/stem entries; bundled into frozen builds via `build_binary.py`
- **Fish Audio S2 Pro (GGUF, 4.5B Dual-AR) via s2.cpp** — `rodrigomt/s2-pro-gguf` Q4_K_M (3.4 GB) + tokenizer, subprocess one-shot, 10 languages, `[emotion]` bracket tags, voice cloning, `gpu_only` — `backend/backends/fish_speech_s2_backend.py:1`, `configs/tts.py:187`, `registry.py:124`, marketplace `$80` anchor (overrides $91 equation, `PRICING_PLAN.md:64`)
- **Performance Mode** — `performance_settings` singleton (`database/models.py:297`), `GET/PUT /settings/performance` (`routes/settings.py:71`), `lifecycle_manager` skips idle-unload when on (`utils/model_lifecycle.py:141`), frontend `GeneralPage.tsx:221` toggle + `ProfileCard.tsx:46` `content-visibility:auto` bypass + `usePerformanceSettings` optimistic
- **Workflow skill catalog** — `backend/agents/manifest.py:40` `SkillSpec` ×6 (`voiceover`/`podcast`/`audiobook`/`clean-master`/`adr`/`voice-design`), `GET /assistant/skills` + `21labs.list_skills` (`mcp_server/tools/skills.py:1`), `AppLoadingScreen.tsx:1` branded fallback wired at `router.tsx:388` + `LoadingState.tsx:12` `output[aria-busy]`
- Fish Speech, Piper, and XTTS v2 engines now available in the UI
- List virtualization for History and Captures tabs (large list performance)
- Frontend code splitting for faster initial load
- Real-time generation status via pub/sub (replaces polling)
- Path traversal protection on audio processing endpoints
- Docker container now runs as non-root user
- **Tab consolidation** — merged duplicate tabs: Stems+StemSeparation, Noise Reduction+Enhance, Pitch Map+Spectrogram, Transcript+Live Transcript, Voice Changer+Voice Converter, Music Generator→Studio (AI Generate tab); 36 → 21 sidebar tabs
- **Voice Converter fixed** — engine IDs aligned with backend (rvc_onnx/openvoice_onnx), OpenVoice branch implemented, save-to-library + RVC voice-pack download
- **Conversation** — `POST /conversation/generate` stitches multi-speaker audio; per-speaker voice picker; Generate button
- **Audio Plan** — per-track voice picker; exposed as assistant tool `plan_audio`
- **Comping** — save comp to Library + send to Audio Studio
- **Timeline** — waveform peaks per track, zoom control
- **Enhance** — A/B compare original vs enhanced + save to Library
- **Music** — songwriter composer (lyrics + beats markdown, export .md), import beats, playback, send to Audio Studio/Timeline
- **Video** — floating global video player (visible across tabs), `POST /video/mux` (audio+video → MP4 via ffmpeg)
- **ADR** — auto-label speakers from guide audio via diarization
- **Dubbing** — "Export to story" stub replaced with working "Download dubbed video"
- **Assistant tools** — added `plan_audio`, `audio_enhance`, `mux_video_audio`, `download_voice_pack`, `conversation_generate` (222 tools)
- **README** — updated feature highlights and tab count

### Fixed
- API transport mismatch: 11 client methods (separate, blend, copy/cut/paste, time-stretch, shout-to-whisper, compress, normalize, master, loudness) POSTed JSON bodies to query-param routes and 422'd — now send query params via `postQuery` (`clientCore.ts`)
- Windows basename bug broke blend/export downloads (`split("/")` on backslash paths) — separator-agnostic `_basename` in `backend/services/audio_edit.py`
- Unknown `/audio/effect-chain` types now 400 instead of 500 (and unknown effects raise instead of silently passing audio through)
- Export-with-FX mistranslation: panel params (ms, seconds, registry keys) are translated to engine params via `effectChainAdapter.ts`
- Empty studio tracks showed overlapping "No audio" + "Import audio or record" texts — single empty state
- EQ effect crash (scipy.signal not imported)
- Pitch shift crash (float passed where dict expected)
- Effects chain errors now propagate instead of being silently dropped
- Cancelled generations now clean up orphaned audio files
- Malformed effects_chain JSON no longer crashes version listing
- Profile update now validates against the correct voice_type
- Audio player no longer leaks when switching between clips
- Streaming STT mic now releases on component unmount
- Assistant chat handles empty response bodies gracefully
- Tauri: async sleep no longer blocks the runtime
- Tauri: Mutex poisoning no longer crashes the app
- Duplicate SSE connections eliminated on rapid generation starts
- Docker container now runs as non-root user
- `bin/check.ps1` now runs end-to-end on Windows PowerShell 5.1: fixed `ParseError` (em-dash inside string) and `Join-Path` multi-arg calls that silently dropped path segments, aborting the typecheck/format gates
- Removed unused imports (`base64`, `io`, `soundfile`) in `mcp_server/tools/audio_tools.py`
- Deduplicated repeating dict keys in `routes/assistant_tools/mappings.py` (video_preview/audio_preview) that silently shadowed routes
- `raise` in `except` blocks now chained with `from None`/`from err` (B904) in `backends/registry.py` and `mcp_server/tools/_common.py`

### Changed
- Cache key hashing reads only 64KB instead of entire audio file
- Audio import now uses asyncio.to_thread to avoid blocking
- 4 backends now use empty_device_cache for consistent XPU support
- Kokoro pipeline cache is now thread-safe
- LuxTTS model loading is now thread-safe

## [0.1.0] — TBD

### Added

- Initial release
- Multi-engine TTS (Qwen, Kokoro, Fish Speech, Zonos, StyleTTS2, ChatTTS, F5-TTS, Pocket-TTS, Parler-TTS, MOSS-TTS-Nano, KittenTTS, NeuTTS, Orpheus)
- Voice cloning and voice profiles
- Waveform editing with pitch map
- Multi-track mixer
- Effects chain (25+ effects)
- Music/SFX generation (ACE-Step, Stable Audio Open, Bark)
- ADR mode
- Audio Plan
- Batch processing
- Live voice changer
- Lottie export
- Spectrogram visualization
- Timecode display
- Scripting API
- Community preset sharing
- Telemetry (opt-in)
- MCP server (111 tools)
- 3D spatial audio (Steam Audio SDK)
- Conversation/podcast mode
- Multi-take comping
- Transcript-driven editing
- Platform export presets
- Emotion tags
- BYOK model providers

### Deferred

- VST3/AU plugin hosting (backend stub exists, full hosting pending)
