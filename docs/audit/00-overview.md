# Otoyin Workspace Completeness Audit — Overview

**Phase 1 (read-only).** Generated 2026-11-07. Confidence labels: `RAN` / `TRACED` / `GUESS`.

## 1. Repo structure (plain words)

- `app/` — React 19 + TypeScript (Vite, TanStack Router/Query, Zustand, Tailwind 4). UI only; talks to backend via Tauri IPC + HTTP to FastAPI on port 17493 (`app/src/lib/api/client*.ts`).
- `tauri/` — Tauri 2 Rust shell; hosts the Python backend as a sidecar process in the same app (not a separate service).
- `backend/` — FastAPI + Python. Routes auto-discovered from `backend/routes/*.py` (~79 modules). Services in `backend/services/`. TTS/STT/music backends in `backend/backends/`. Models declared in `backend/backends/configs/` + `backend/services/model_registry.py`.
- `landing/`, `docs/` — marketing site and documentation (Fumadocs).
- `data/`, `scripts/`, `bin/` — dev tooling.

Invariant: Tauri IPC only for inter-window; no cloud for core features; all models offline/on-device; marketplace is the only download path for non-small models.

## 2. Workspace registry (routes + nav)

Workspace (tab) routes are registered in `app/src/router.tsx`. Nav grouping lives in `app/src/layouts/Sidebar/Sidebar.tsx` (`NAV_GROUPS`). Many `/workspace/*` paths redirect to top-level canonical paths.

Canonical workspace routes (from router.tsx):
/ (Generate), /stories, /songwriter, /launcher, /instruments, /audiobooks, /captures, /voices, /effects, /dubbing, /audio-studio, /timeline, /pitch, /mixer, /studio, /dsp, /adr, /audio-plan, /conversation, /comping, /automation, /noise-reduction, /audio-enhance, /vocal-isolation, /spectrogram, /export, /transcript, /spatial, /music-gen, /diarize, /video, /download, /batch, /sounds, /translate, /voice-converter, /library, /store, /help, /whats-new, /projects, /community-presets.

Redirects: /models→/store, /voice-changer→/voice-converter, /stem-separation→/vocal-isolation, /live-transcript→/transcript, /server→/settings, /workspace*→top-level.

Nav groups (Sidebar): Create (Generate, Voices, Voice Converter, Songwriter, Sounds), Studio (Audio Studio, Stories, Launcher, Instruments, Audiobooks, Mixer, Studio, Comping, Spatial, DSP, Automation), Voice & Transcription (Captures, Translate, Pitch Map, Spectrogram, Diarize), Processing (Effects, Noise Reduction, Audio Enhance, Vocal Isolation), Video (Dubbing, Video, Download), Music (Music Gen), Library (Library), Store (Store), Settings (Settings), Help (Help, What's New, Projects, Community Presets). /sounds (SoundEffectsView, SFX) moved from Help into Create in Phase 2 slice 1 (BUG-001 fix).

## 3. Backend surface (summary)

- FastAPI app `backend/app.py`; routers auto-discovered from `backend/routes/` (79 modules incl. audio_pipeline subpackage). Health registered first.
- HTTP routes cover: generate, speak, profiles, models, marketplace, library, files, stories, dubbing, effects, mixer, spatial, dsp, automation, noise reduction, enhance, vocal isolation, spectrogram, transcript edit, spatial, music gen, diarize, video, youtube download, batch, sounds, translate, voice convert, captures, audiobooks, conversation, comping, audio plan, adr, launcher, instruments, assistant (+stream), voice chat (WS), streaming stt/tts, websocket, tasks, history, settings, shortcuts, etc.
- Websockets: `voice_chat`, `streaming_stt`, `streaming_tts`, `websocket`, `realtime`.
- Background jobs: `backend/services/task_queue.py`, `batch.py`, `utils/tasks.py`, `utils/progress.py`.
- MCP server: `backend/mcp_server/` (110 tools) — separate tool surface.

## 4. Model registry

- Declared in `backend/backends/configs.py` (~941 lines, known large) + `backend/backends/configs/` package + `backend/services/model_registry.py`.
- Backends: 40+ in `backend/backends/` (TTS: kokoro, qwen3, chatterbox, xtts, piper, luxtts, bark, neutts, orpheus, fish_speech, moss, kitten, pocket, parakeet-stt, whisper, faster-whisper, moonshine, qwen3-asr; music: acestep, heartmula, minimax, stable_audio; SFX: sa3; VC: rvc, seed_vc, openvoice; enhance: deepfilter, lavasr; stems: demucs; spatial: steam_audio).
- Marketplace is the only download path for non-small models; small (LavaSR, DeepFilter) may auto-download. Model lifecycle: `backend/utils/model_lifecycle.py`, `model_status.py`, `memory.py`, `vram_pressure.py`. Single-slot TTS loading enforced (tests `test_tts_single_slot.py`).
- Cloud providers: `cloud_models.py` route + `services/cloud_provider.py` (BYOK).

## 5. Shared state

- Audio files: `backend/services/files.py`, `library.py`, `audio_metadata.py`, `audio_sample_library.py`. Frontend `app/src/features/library/LibraryTab.tsx`, stores in `app/src/stores/`.
- Projects: `services/standalone_project.py`, `projects.py` route, `StandaloneProjectPage`.
- History: `services/history.py`, `generations.py` route, `features/generate/HistoryList.tsx`.
- Settings: `services/settings.py` (backend) + `features/settings/*`.
- Cross-tab handoff: `CapturePill`, `AudioPlayer`, clipboard; `app/src/features/clipboard/`. No single universal asset library confirmed — needs tracing (GUESS: partial).

## 6. Build / lint / test commands

- Frontend: `cd app && npm run typecheck` (tsc), `npm run lint` (biome), `npm run test` (vitest), `npm run build` (vite).
- Backend: `cd backend && python -m pytest` (config in pyproject.toml), ruff (per pyproject). `bin/check.ps1` runs full check.
- Tauri: `npm run dev` (root) starts Tauri + backend.
- Backend venv: `backend/venv/Scripts/python.exe`.

## 7. Master table (workspaces)

Completeness 0-5. Scores are GUESS where not traced end-to-end.

| # | Workspace | Route / component | In nav? | Models used | Completeness | One-line verdict |
|---|-----------|-------------------|---------|-------------|--------------|------------------|
| 1 | Generate | `/` GeneratePage | yes | TTS engines | 4 | Full model+voice+generate+history; solid |
| 2 | Stories | `/stories` StoryEditor | yes | TTS | 3 | Sequencing wired; heavy (1000+ lines) |
| 3 | Songwriter | `/songwriter` SongwriterTab | yes | LLM | 3 | Lyrics craft; path to music/TTS |
| 4 | Launcher | `/launcher` LauncherTab | yes | various | 3 | Step sequencer |
| 5 | Instruments | `/instruments` InstrumentLibrary | yes | GM/synth | 3 | Library + previews |
| 6 | Audiobooks | `/audiobooks` AudiobooksTab | yes | TTS | 3 | Chapter render |
| 7 | Captures | `/captures` CapturesTab | yes | STT | 3 | Capture flow |
| 8 | Voices/Clone | `/voices` ClonePage | yes | cloning | 4 | Clone + consent? (verify) |
| 9 | Effects | `/effects` EffectsTab | yes | none | 4 | FX chain complete |
| 10 | Dubbing | `/dubbing` DubPage | yes | TTS/STT | 3 | Segments PATCH/DELETE just wired |
| 11 | Audio Studio | `/audio-studio` AudioStudio | yes | none | 4 | DAW-like; large |
| 12 | Timeline | `/timeline` TimelineView | yes | none | 2 | Clip drag/drop, snap missing (per TAB_AUDIT) |
| 13 | Pitch Map | `/pitch` PitchMapView | yes | none | 3 | Analysis |
| 14 | Mixer | `/mixer` MixerView | yes | none | 4 | Channel strips |
| 15 | Studio | `/studio` StudioView | yes | none | 3 | Piano/drums/synth/SFX |
| 16 | Comping | `/comping` MultiTakeCompingView | yes | none | 3 | Take lanes |
| 17 | Spatial | `/spatial` SpatialView | yes | steam_audio | 3 | 3D audio |
| 18 | DSP | `/dsp` DspView | yes | none | 3 | Synth/DSP |
| 19 | Automation | `/automation` AutomationView | yes | none | 3 | Lanes/cues |
| 20 | Noise Reduction | `/noise-reduction` | yes | denoise | 3 | AI/profile modes |
| 21 | Audio Enhance | `/audio-enhance` | yes | LavaSR/DF | 3 | Bandwidth ext |
| 22 | Vocal Isolation | `/vocal-isolation` | yes | demucs | 3 | Stems |
| 23 | Spectrogram | `/spectrogram` | yes | none | 3 | Viz |
| 24 | Export | `/export` PlatformExportView | yes | none | 3 | Platform presets |
| 25 | Transcript | `/transcript` TranscriptEditView | yes | STT | 3 | Word-level edit |
| 26 | Music Gen | `/music-gen` MusicGenView | yes | music models | 3 | Model picker added |
| 27 | Diarize | `/diarize` DiarizationView | yes | STT | 3 | Speaker labels |
| 28 | Video | `/video` VideoPreviewView | yes | none | 3 | Preview/extract |
| 29 | Download | `/download` YouTubeDownloadView | yes | none | 3 | YT/SoundCloud |
| 30 | Batch | `/batch` BatchQueueView | yes | various | 3 | Queue |
| 31 | Sounds | `/sounds` SoundEffectsView | yes | SFX | 3 | Freesound + gen |
| 32 | Translate | `/translate` TranslateView | yes | STT/MT | 3 | Text translate |
| 33 | Voice Converter | `/voice-converter` VoiceConverterView | yes | VC | 3 | AI voice-to-voice |
| 34 | Library | `/library` LibraryTab | yes | none | 3 | Unified library |
| 35 | Store | `/store` StorePage | yes | marketplace | 4 | Marketplace |
| 36 | ADR | `/adr` ADRView | yes | TTS/STT | 3 | Dialogue replace |
| 37 | Audio Plan | `/audio-plan` AudioPlanView | yes | TTS | 2 | voice_profile_id not in UI |
| 38 | Conversation | `/conversation` ConversationView | yes | TTS | 2 | No backend gen endpoint; per-speaker voice picker missing |
| 39 | Help | `/help` HelpPage | yes | none | 3 | Help center |
| 40 | What's New | `/whats-new` WhatsNewPage | yes | none | 3 | Changelog |
| 41 | Projects | `/projects` StandaloneProjectPage | yes | none | 3 | Project mgmt |
| 42 | Community Presets | `/community-presets` | yes | none | 3 | Presets |

Duplicates/overlaps:
- Stem separation exists as both `/vocal-isolation` (Demucs ONNX) and redirected `/stem-separation` → `/vocal-isolation`. Plus `stems/` feature dir. Overlap with Vocal Isolation.
- Audio Studio vs individual workspace tabs (effects, mixer, spatial, etc.) — Audio Studio embeds many; duplication of surfaces.
- `/captures` vs capture pill / live transcript.
- Effects tab vs processing views.
- `/voice-changer` redirect to `/voice-converter` (two concepts collapsed).
- `/live-transcript` redirect to `/transcript`.

Orphan components: `app/src/features/stems/` (StemSeparator, StemMixer, StemTrack) — verify routed. `app/src/features/capture/` vs `captures/`. `app/src/features/assistant/` — assistant UI. Need tracing (GUESS).

## 8. Top 10 findings (verified where noted)

1. BLOCKER: Sidebar nav malformed (Sidebar.tsx:163-166) breaks typecheck+lint (RAN).
2. Conversation voice selection ignored: UI picker exists but linePayload drops engine/profileId (TRACED).
3. Audio Plan voice selection ignored: generateAutoPlan omits voiceProfileId (TRACED).
4. Timeline has no clip drag/drop or snap (TRACED).
5. Voice clone has no consent confirmation UI (TRACED).
6. Model picker missing/partial on most AI tabs; MusicGen uses hardcoded engine list without installed state (TRACED).
7. Dubbing segments PATCH/DELETE are wired (TRACED) — not a gap.
8. No single universal asset library confirmed; files move via library/captures/clipboard (GUESS).
9. `backend/backends/configs.py` ~941 lines (known issue) — risk (TRACED).
10. Heavy model memory on 8GB target needs tracing (GUESS).

## 9. Next

Tab Job Cards written in batches of 5 under `docs/audit/tabs/`. See `_progress.md`.
