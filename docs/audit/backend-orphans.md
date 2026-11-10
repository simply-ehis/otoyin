# Backend Orphans (backend → UI)

Method: cross-referenced `backend/routes/*.py` (79 modules) + `backend/services/*.py` + `backend/backends/*` against `app/src/router.tsx` and `app/src/layouts/Sidebar/Sidebar.tsx`. Confidence: TRACED for route list, GUESS for UI matching.

## A. Backend capabilities WITH UI (sample)
- TTS engines → Generate (`/`), Voices (`/voices`), Dubbing, Conversation, ADR, Audio Plan. (TRACED)
- STT (whisper/faster-whisper/moonshine/parakeet/qwen3-asr) → Captures, Transcript, Diarize, Dubbing. (TRACED)
- Music gen (acestep/heartmula/minimax/stable-audio) → Music Gen. (TRACED)
- SFX (sa3/stable-audio) + Freesound → Sounds. (TRACED)
- Voice conversion (rvc/seed_vc/openvoice) → Voice Converter. (TRACED)
- Enhance (LavaSR/DeepFilter) → Audio Enhance, Noise Reduction. (TRACED)
- Stem separation (demucs) → Vocal Isolation. (TRACED)
- Spatial (steam_audio) → Spatial. (TRACED)
- Effects chain → Effects, Audio Studio. (TRACED)
- Mixer/buses → Mixer, Audio Studio. (TRACED)
- Automation → Automation. (TRACED)
- Mastering/loudness/platform export → Export. (TRACED)
- Stories/chapters/audiobooks → Stories, Audiobooks. (TRACED)
- Dubbing → Dubbing. (TRACED)
- Batch/tasks → Batch. (TRACED)
- Library/files/metadata → Library. (TRACED)
- Marketplace/models → Store. (TRACED)
- Profiles → Voices, Generate. (TRACED)
- Assistant/LLM/MCP → Help/assistant UI + settings. (TRACED)
- Settings (gpu/cuda/memory/logs/telemetry/privacy/scripting/plugins/lottie/shortcuts/timecode/cloud models/api keys) → Settings pages. (TRACED)
- Instruments/GM/drum machine → Instruments, Studio. (TRACED)
- Captures → Captures. (TRACED)
- Translation → Translate. (TRACED)
- ADR → ADR. (TRACED)
- Audio plan → Audio Plan. (TRACED)
- Conversation → Conversation. (TRACED)
- Comping → Comping. (TRACED)
- Spectrogram/pitch → Spectrogram, Pitch Map. (TRACED)
- DSP/synth → DSP, Studio. (TRACED)
- YouTube download → Download. (TRACED)
- Video preview/extract → Video. (TRACED)
- Timeline → Timeline. (TRACED)

## B. Hidden features (backend exists, no dedicated UI — needs surfacing)
- `routes/crashes.py`, `services/crash_reports.py` — crash reporting; only surfaced via settings? UNVERIFIED (GUESS: no dedicated tab).
- `routes/cuda.py`, `services/cuda.py`, `device_capabilities.py` — GPU/capability detection; surfaced in Settings/GPU. (TRACED)
- `routes/memory.py`, `services/memory.py` — memory diagnostics; Settings/System? PARTIAL.
- `routes/events.py`, `services/status_bus.py`, `observability.py`, `telemetry.py` — event bus/telemetry; Settings/Telemetry. (TRACED)
- `routes/integration.py`, `leone_integration.py` — integration hooks; no clear UI. (GUESS hidden)
- `routes/phase2.py` — phase2 utilities; no clear UI. (GUESS hidden)
- `routes/workflow.py`, `services/workflow.py` — workflow orchestration; no dedicated tab. (GUESS hidden)
- `routes/features.py` — feature flags; no UI. (GUESS hidden)
- `routes/extended_import.py`, `services/extended_import.py` — extended import; used by Video? PARTIAL.
- `routes/reference_voices.py`, `services/reference_voices.py` — reference voices; inside Voices (feature-exposure audit). PARTIAL discoverability.
- `routes/clipboard.py`, `services/` clipboard — cross-tab clipboard; indicator in sidebar. (TRACED)
- `routes/announcements.py`? `services/announcements.py` — What's New. (TRACED)
- `routes/realtime.py` — realtime API; used by voice chat? PARTIAL.
- `services/always_on.py` — always-on capture; no dedicated UI? GUESS.
- `services/region_pricing.py`, `currency.py`, `licensing.py` — payments/licensing; Store/Settings. (TRACED)
- `services/plugin_install.py`, `plugins.py`, `routes/plugins?` (scripting) — plugins UI in Settings/Plugins. (TRACED)
- `services/lottie_export.py` — settings/Lottie Export. (TRACED)
- `services/timecode` (route timecode) — settings/Timecode. (TRACED)
- `services/vad.py`, `streaming_lavasr.py` — used by voice chat/enhance. (TRACED)
- `services/emotion_tone.py`, `breath_pause.py` — TTS enhancement; possibly no direct UI controls. (GUESS hidden)
- `services/audio_tags.py`, `audio_tags_synth.py` — audio tags; Captures? PARTIAL.
- `services/channels.py` — channel management; Mixer? PARTIAL.
- `services/automation`? route automation exists; UI Automation tab. (TRACED)

## C. Ghost UI (UI exists, backend missing/broken/stubbed)
- Conversation: historically "no backend gen endpoint" (TAB_AUDIT) — BUT `/conversation/generate` now exists (TRACED this audit). So outdated; still per-speaker voice picker missing.
- Audio Plan: backend supports voice_profile_id/engine but UI missing (TRACED).
- Timeline: clip drag/drop + snap missing in UI (TRACED TAB_AUDIT) — backend n/a (client-side gap).
- `/voice-changer` route redirects to `/voice-converter`, collapsing real-time voice changer into converter. Real-time pipeline exists in `backend/voice_changer/` + `VoiceChangerPanel.tsx`. (TRACED) — discoverability gap.
- `/live-transcript` redirects to `/transcript`, collapsing live capture mode. (TRACED)
- `/stem-separation` redirects to `/vocal-isolation`. (TRACED)

## D. Dead code / orphans
- `app/src/components/VoiceProfiles/` — legacy dead (AGENTS.md: live UI is `features/voices/`). (TRACED)
- `app/src/features/stems/` (StemSeparator/StemMixer/StemTrack) — verify usage; may be orphan or used by VocalIsolationView. (GUESS)
- `app/src/features/capture/` vs `app/src/features/captures/` — possible duplicate dirs. (GUESS)
- `app/src/features/assistant/` — assistant UI; verify routed (Help/assistant). (GUESS)
- `backend/services/leone_integration.py`, `phase2.py` utilities — possibly unused. (GUESS)
- `backend/tools?` no.

## E. Orphan backend routes likely without UI (verify)
crashes, cuda, events, features, integration, memory, phase2, workflow, realtime, standalone, projects, support, help, shortcuts, timecode, telemetry, privacy, scripting, plugins, lottie_export, cloud_models, model_providers, settings, health, files, history, generations, transcription, translate, youtube, batch, tasks, websocket, voice_chat, streaming_stt, streaming_tts, assistant, assistant_stream, mcp_bindings. Many of these are legitimately settings/infra; flag only those with no settings surface: integration, phase2, workflow, features, memory (partial), events (partial), crashes (partial). (GUESS)

## F. Model-rule violations to verify
- Backend must never load model when none active; only cached model loads; only small models auto-download. Need code review of `model_lifecycle.py`, `startup_cleanup.py`, `startup_defer.py`, `model_status.py`, backends `__init__`. (GUESS, not yet traced.)
- Heavy model memory spikes on 8GB target: audiobooks (many chapters), music gen, stem separation, conversation (per-line generation), ADR. (GUESS)