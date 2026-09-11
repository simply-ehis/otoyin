# Otoyin — Full Repository Architecture

> Comprehensive documentation of the otoyin codebase: structure, data flow, and how every section works.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Project Structure](#2-project-structure)
3. [Backend Deep Dive](#3-backend-deep-dive)
4. [Frontend Deep Dive](#4-frontend-deep-dive)
5. [Tauri Desktop Shell](#5-tauri-desktop-shell)
6. [MCP Server](#6-mcp-server)
7. [Data Flow Diagrams](#7-data-flow-diagrams)
8. [Database Schema](#8-database-schema)
9. [Build & Dev System](#9-build--dev-system)
10. [Key Abstractions](#10-key-abstractions)
11. [Testing](#11-testing)
12. [Environment & Config](#12-environment--config)
13. [Skills & Agent System](#13-skills--agent-system)

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    OTOYIN DESKTOP APPLICATION                    │
├─────────────────────┬───────────────────────────────────────────┤
│   TAURI SHELL (Rust)│  Native window, menus, updater, audio    │
│   ─────────────────  │  capture, global keyboard shortcuts      │
├─────────────────────┼───────────────────────────────────────────┤
│   REACT FRONTEND    │  16 tabs, 260+ components, 15 stores     │
│   (Vite + Tailwind) │  Zustand state, TanStack Query/Router    │
│   Port: 21132       │  Web Audio API, WaveSurfer, DnD          │
├─────────────────────┼───────────────────────────────────────────┤
│   PYTHON BACKEND    │  FastAPI, 84 route modules, 85 services  │
│   (FastAPI+UVicorn) │  15 TTS, 4 STT, 3 VC, 3 Music engines   │
│   Port: 17493       │  SQLite (WAL), HuggingFace Hub cache     │
├─────────────────────┼───────────────────────────────────────────┤
│   MCP SERVER        │  201 tools, Streamable HTTP transport     │
│   (FastMCP)         │  Auto-discovered from REST endpoints      │
└─────────────────────┴───────────────────────────────────────────┘
```

**Communication:** Tauri IPC (desktop) or HTTP (web) between frontend ↔ backend. No localhost HTTP for inter-window comms.

**Offline-first:** All core features work without internet. Cloud BYOK (bring your own key) for optional services.

---

## 2. Project Structure

```
otoyin/
├── app/                          # React frontend (Vite workspace)
│   ├── src/
│   │   ├── components/           # 37 reusable component directories
│   │   ├── features/             # 21 feature directories (pages)
│   │   ├── stores/               # 15 Zustand stores
│   │   ├── lib/api/              # 27 API client files (inheritance chain)
│   │   ├── hooks/                # Custom React hooks
│   │   ├── router.tsx            # TanStack Router (1048 lines)
│   │   └── index.css             # Tailwind + theme definitions
│   ├── ui/                       # Shadcn/ui-style primitives (35 files)
│   ├── test/                     # Vitest tests (~50 files)
│   └── package.json
├── backend/                      # Python FastAPI backend
│   ├── app.py                    # App factory, middleware, lifecycle (715 lines)
│   ├── main.py                   # Entry point for uvicorn
│   ├── routes/                   # 84 route modules
│   ├── services/                 # 89 service modules
│   ├── backends/                 # 41 engine implementations
│   │   ├── registry.py           # Declarative ENGINE_REGISTRY table
│   │   ├── configs/              # ModelConfig definitions
│   │   └── protocols.py          # Backend type contracts
│   ├── database/                 # SQLAlchemy ORM, 25+ tables
│   ├── utils/                    # 30 utility modules
│   ├── mcp_server/               # MCP tool server (201 tools)
│   ├── tests/                    # pytest suite (100+ files)
│   └── requirements.txt
├── tauri/                        # Tauri v2 desktop shell
│   ├── src-tauri/
│   │   ├── src/                  # Rust: lib.rs, audio.rs, server.rs
│   │   ├── tauri.conf.json       # Window config, plugins, bundler
│   │   └── Cargo.toml            # Rust dependencies
│   └── package.json
├── landing/                      # Marketing landing page
├── docs/
│   └── knowledge/                # 106 knowledge documents
├── .agents/skills/               # 63 agent skills
├── justfile                      # Command runner (579 lines)
├── package.json                  # Monorepo root (workspaces)
├── biome.json                    # JS/TS lint config
└── AGENTS.md                     # Project rules for AI agents
```

---

## 3. Backend Deep Dive

### 3.1 Entry Point & Lifecycle

**`backend/app.py`** — `create_app()` (line 90)

```
Startup sequence:
  1. Set GPU env vars (AMD ROCm defaults)
  2. init_db() — create SQLite tables, run migrations, seed presets
  3. init_queue() — serial generation queue (maxsize=20)
  4. start_worker() — batch processing background worker
  5. purge_stale_state() — clean orphaned files
  6. Log platform info (GPU, ONNX providers)
  7. Signal readiness → accept requests
  8. Init ProgressManager event loop
  9. Spawn voice-changer subprocess
 10. Log memory stats

Middleware stack (outermost first):
  CrashCaptureMiddleware    — captures unhandled exceptions
  ReadinessMiddleware       — holds requests until startup complete
  MCPLazyBuildMiddleware    — builds MCP sub-app on first /mcp hit
  ClientIdMiddleware        — tracks MCP client identity
  OriginGuardMiddleware     — validates request origins
  CORSMiddleware            — standard CORS
```

### 3.2 Routes (84 modules)

Routes are auto-discovered via `pkgutil.iter_modules` — any file with a module-level `router` attribute is registered.

**Major route groups:**

| Group | Files | Purpose |
|-------|-------|---------|
| **TTS Generation** | `generate.py`, `generations.py`, `history.py` | Submit generation, track status, view history |
| **Voice Profiles** | `profiles.py` | CRUD for cloned/preset/designed voices |
| **Model Management** | `models/download.py`, `models/load_unload.py`, `models/status.py` | Download, load, unload, check model status |
| **Audio Studio** | `audio_studio.py`, `mixer.py`, `channels.py` | DAW session management |
| **Stories** | `stories.py` | Multi-generation story sequences |
| **Marketplace** | `marketplace.py`, `community_presets.py` | Licensing, entitlements, presets |
| **Assistant** | `assistant.py`, `assistant_stream.py`, `assistant_tools/` | AI assistant with tool calling |
| **STT** | `transcription.py`, `streaming_stt.py`, `diarization.py` | Speech-to-text |
| **Voice** | `voice_chat.py`, `voice_convert.py`, `reference_voices.py` | Voice conversion, real-time chat |
| **Audio Processing** | `audio_pipeline/`, `effects.py`, `recipe.py` | DSP, effects chains, recipes |
| **Batch** | `batch.py` | Background job queue |
| **Tasks** | `tasks.py` | Active download/generation status |

### 3.3 Services (89 modules)

**Core generation pipeline:**

```
User submits text + voice profile
        │
        ▼
  generation.py::run_generation(ctx)
        │
        ├─── _resolve_engine()     → pick best TTS engine
        ├─── profiles.create_voice_prompt_for_profile()  → compose voice
        ├─── _synthesize_local()   → run TTS inference
        │       ├── load_engine_model()  → load model (single TTS slot)
        │       └── backend.generate()   → actual inference
        ├─── _postprocess()        → effects chain, normalize
        ├─── _persist()            → save WAV to disk
        └─── notify via SSE        → update frontend in real-time
```

**Key services:**

| Service | Purpose |
|---------|---------|
| `generation.py` | Orchestrates TTS generation (GenerationContext dataclass) |
| `profiles.py` | Voice profile management, voice prompt composition |
| `model_registry.py` | Download manifest gate (is_downloaded, record_download) |
| `task_queue.py` | Serial asyncio queue for generation (prevents GPU contention) |
| `marketplace_catalog.py` | Signed product catalog (PRODUCTS list with pricing) |
| `batch.py` | Background batch job worker |
| `history.py` | Generation history, status updates |
| `effects.py` | Audio effects chain processing |
| `mixer.py` | Multi-track mixer state |
| `personality.py` | Voice personality/character rewrites |
| `translation.py` | Multi-language translation |
| `stem_separation.py` | Vocal/drum/bass isolation |

### 3.4 TTS Engine System

**Registry pattern** (`backends/registry.py`):

```python
ENGINE_REGISTRY = [
    _TTSBackendEntry(
        engine="kokoro",
        onnx_module=".kokoro_onnx_backend",   # preferred
        torch_module=".kokoro_backend",         # fallback
    ),
    # ... 14 more engines
]
```

**Resolution** (`_resolve_tts_backend`, line 123):
1. Try ONNX path → check `is_onnx_available()` + `_is_model_cached()`
2. If ONNX unavailable → fall back to torch
3. If `onnx_only` → raise ValueError
4. Register with `lifecycle_manager` for idle-unload

**15 TTS Engines:**

| Engine | Type | Size | Languages | Voices |
|--------|------|------|-----------|--------|
| Kokoro 82M | ONNX+torch | 340MB | 8 | 45 |
| Pocket-TTS | ONNX+torch | ~200MB | 6 | 20 |
| MOSS-TTS-Nano | ONNX only | 763MB | 20 | zero-shot clone |
| KittenTTS | ONNX only | 80MB | 1 | 8 |
| Zonos GGUF | Subprocess | ~1GB | multi | zero-shot clone |
| Parler-TTS | Subprocess | ~500MB | 1 | text-described |
| NeuTTS-Air/2E | Singleton | ~300MB | en | clone |
| Orpheus 3B | Singleton | ~3GB | en | clone |
| Qwen3-TTS | Subprocess | ~1GB | 10 | zero-shot clone |
| Bark Small | Subprocess | ~500MB | multi | preset |
| Fish S2 Pro | Subprocess | ~4GB | multi | zero-shot clone |

**Single TTS slot:** Only one TTS engine can be loaded at a time. Loading a new one auto-unloads the previous.

**Model lifecycle:**
- Idle-unload after 5 minutes (configurable)
- Circuit breaker: 3 failures → 5min cooldown
- VRAM pressure detection before loading
- Performance mode: suspend idle-unload

### 3.5 Database

**ORM:** SQLAlchemy with SQLite (WAL mode, 5s busy timeout)

**25+ tables organized by domain:**

```
Voice Domain          Generation Domain       Studio Domain
──────────────        ─────────────────       ─────────────
VoiceProfile          Generation              Project
ProfileSample         GenerationVersion       AudioStudioSession
AudioChannel          GenerationSettings      CompingSession
ChannelDeviceMap      EffectPreset            MixerSession
ProfileChannelMap                             SessionAutosave

Conversation Domain   Story Domain            Marketplace Domain
──────────────────    ─────────────           ──────────────────
Conversation          Story                   License
ConversationMessage   StoryItem               Entitlement
AgentMemory           StoryEditSnapshot       InstalledPlugin
MCPClientBinding
ADRSession/Line/Take  Misc Domain
                      ──────────
                      ModelDownload
                      Capture
                      ClipboardItem
                      AppSetting
                      TelemetryEvent
                      CustomSkill
                      SongDraft
```

---

## 4. Frontend Deep Dive

### 4.1 Bootstrap Flow

```
main.tsx
  └─ Platform detection (Tauri vs Web)
  └─ Global error handlers
  └─ React root
       └─ QueryClientProvider (TanStack Query, 5min stale)
       └─ PlatformProvider (filesystem, updater, audio)
       └─ App
            └─ RouterProvider (TanStack Router)
                 └─ RootLayout
                      └─ AppFrame (sidebar + banners + AudioPlayer)
                           └─ Route outlet
```

### 4.2 Router — 16 Main Tabs + Settings + Workspace

| Tab | Path | Component | Purpose |
|-----|------|-----------|---------|
| Generate | `/` | GeneratePage | Main TTS generation |
| Audio Studio | `/audio-studio` | AudioStudio | Multitrack DAW (46 files) |
| Stories | `/stories` | StoriesTab | Story timeline editor |
| Songwriter | `/songwriter` | SongwriterTab | Song DNA + lyrics |
| Launcher | `/launcher` | LauncherTab | Clip launcher |
| Instruments | `/instruments` | InstrumentLibrary | MIDI instrument packs |
| Audiobooks | `/audiobooks` | AudiobooksTab | Audiobook production |
| Voices | `/voices` | VoicesTab | Voice profile management |
| Captures | `/captures` | CapturesTab | Dictation/recording |
| Effects | `/effects` | EffectsTab | Audio effects presets |
| Dubbing | `/dubbing` | DubbingTab | Dubbing workflow |
| Library | `/library` | LibraryTab | Unified audio library |
| Store | `/store` | StorePage | Model marketplace |
| Voice Changer | `/voice-changer` | VoiceChangerView | Real-time voice changer |
| Voice Converter | `/voice-converter` | VoiceConverterView | RVC voice conversion |
| Sounds | `/sounds` | SoundEffectsView | Freesound SFX search |

**Settings** (`/settings/*`): General, Generation, Captures, MCP, GPU, System, Logs, About, Shortcuts, Timecode, Scripting, Plugins, Lottie, Telemetry, Privacy, API Keys, Workspace, Support

**Workspace** (`/workspace/*`): Timeline, PitchMap, Mixer, Effects, Studio, DSP, ADR, AudioPlan, BatchQueue, NoiseReduction, AudioEnhance, VocalIsolation, Spectrogram, Conversation, Export, Transcript, Spatial, Automation, Comping, LiveTranscript, Diarize, Video, Download

### 4.3 State Management — 15 Zustand Stores

| Store | Purpose |
|-------|---------|
| `playerStore` | Global audio player (URL, playback, volume, analyser) |
| `generationStore` | Pending/in-progress generations (Set of IDs, isGenerating) |
| `uiStore` | Theme (7 themes), sidebar, modals, profile form draft |
| `serverStore` | Backend URL, connection status, local/remote mode |
| `storyStore` | Story editor playback, track mute/solo, undo/redo |
| `workspaceStore` | Active tab, use-case profiles, tab visibility |
| `contentStore` | Dismissed announcements, seen What's New versions |
| `effectsStore` | Effects editor state, working chain |
| `productStore` | Marketplace "New" badge tracking |
| `logStore` | Server log buffer (2000 entries) |
| `onboardingStore` | First-visit per-tab intro tracking |
| `voiceChatStore` | Voice chat session, SSE streaming, tool confirmations |
| `voiceChangerStore` | Voice changer parameters |
| `clipboardStore` | Audio clipboard for copy/cut/paste |
| `audiobookStore` | Selected audiobook ID |

### 4.4 API Client — Inheritance Chain

```
ApiClientCore (clientCore.ts)
  ├─ ClientPrivacyMethods
  │   └─ CrashesMethods
  │       └─ ProfilesMethods
  │           └─ GenerationsMethods
  │               └─ CapturesMethods
  │                   └─ ModelsMethods
  │                       └─ ChannelsMethods
  │                           └─ StoriesAMethods
  │                               └─ StoriesBMethods
  │                                   └─ ADRMethods
  │                                       └─ SpatialMethods
  │                                           └─ MemoryMethods
  │                                               └─ HelpMethods
  │                                                   └─ AgentMethods
  │                                                       └─ ContentMethods
  │                                                           └─ DubbingMethods
  │                                                               └─ DiarizeMethods
  │                                                                   └─ ApiClientLibrary
  │                                                                       └─ AudiobooksMethods
  │                                                                           └─ SongwriterMethods
  │                                                                               └─ ClientLauncherMethods
  │                                                                                   └─ ClientInstrumentPackMethods
  │                                                                                       └─ ApiClient (singleton)
```

**27 API files**, each adding domain-specific methods. Base handles: HTTP, error formatting, 503 retry, circuit breaker.

### 4.5 Styling

- **Tailwind CSS v4** with `@tailwindcss/vite` plugin
- **7 themes:** system, light, dark, di-stefano (default), stripe, coastal-light, mesh-dark
- **"Di Stefano" design system:** warm single-source light (Caravaggio), flat rose accent (`hsl(348 68% 58%)`)
- **50-step perceptually-spaced grayscale** (`--gs-0` through `--gs-49`)
- **Typography:** Geist variable font, Geist Mono for code
- **No glassmorphism** — all surfaces solid
- **Icons:** Heroicons only (no Lucide)
- **Component library:** Shadcn/ui-style built on Radix UI primitives

---

## 5. Tauri Desktop Shell

**Tauri v2** with Rust backend:
- **Window:** 1400×900, min 800×600, no native decorations (custom title bar)
- **Audio capture:** Platform-specific (`wasapi` on Windows, `cpal` cross-platform)
- **Global keyboard:** `keytap` for push-to-talk chords
- **Bundled server:** PyInstaller `--onedir` (~1GB) as sidecar binary
- **Auto-updater:** GitHub releases with NSIS/WiX installers
- **Plugins:** Dialog, filesystem, shell (URL open), process, updater

**Rust source files:** `lib.rs`, `main.rs`, `audio.rs`, `audio_mac.rs`, `audio_win.rs`, `mic_webview.rs`, `server.rs`

---

## 6. MCP Server

**201 tools** exposed via Streamable HTTP at `/mcp`.

**Architecture:**
- `server.py` — builds FastMCP instance
- `tools/` — 17 tool modules
- Two-layer registration:
  1. TR dispatcher — auto-registers REST-proxy tools from unified registry
  2. Manual decorators — custom tools calling services directly

**Tool categories:** speech (TTS/STT/clone), studio, instruments, workflow, generation, audio manipulation, dubbing, skills, misc utilities

---

## 7. Data Flow Diagrams

### 7.1 TTS Generation Flow

```
User                    Frontend                Backend               Engine
  │                        │                      │                     │
  │  type text + pick voice│                      │                     │
  │───────────────────────>│                      │                     │
  │                        │  POST /generate      │                     │
  │                        │  {profile_id, text}  │                     │
  │                        │─────────────────────>│                     │
  │                        │                      │  resolve engine     │
  │                        │                      │  validate profile   │
  │                        │                      │  create Generation  │
  │                        │                      │  enqueue_generation │
  │                        │  202 {id, status}    │                     │
  │                        │<─────────────────────│                     │
  │                        │                      │                     │
  │                        │  SSE /events/{id}    │  run_generation()   │
  │                        │<─────────────────────│  load_engine_model  │
  │                        │  status: loading     │                     │
  │                        │                      │──── load ──────────>│
  │                        │                      │<─── loaded ─────────│
  │                        │                      │  create_voice_prompt│
  │                        │                      │──── generate ──────>│
  │                        │                      │<─── audio[] ────────│
  │                        │                      │  postprocess        │
  │                        │                      │  persist WAV        │
  │                        │  status: completed   │                     │
  │                        │<─────────────────────│                     │
  │  play button           │                      │                     │
  │<───────────────────────│  GET /audio/{id}     │                     │
  │                        │─────────────────────>│                     │
  │                        │  WAV bytes           │                     │
  │                        │<─────────────────────│                     │
  │  ▶ audio plays         │                      │                     │
```

### 7.2 Model Download Flow

```
User                    Frontend                Backend               HF Hub
  │                        │                      │                     │
  │  click Download        │                      │                     │
  │───────────────────────>│                      │                     │
  │                        │  POST /models/download│                    │
  │                        │─────────────────────>│                     │
  │                        │                      │  _ensure_pip_deps   │
  │                        │                      │  snapshot_download  │
  │                        │                      │────────────────────>│
  │                        │  SSE progress        │<─── files ──────────│
  │                        │<─────────────────────│                     │
  │                        │  progress: 45%       │                     │
  │                        │  progress: 100%      │                     │
  │  ✓ installed           │                      │  record_download()  │
  │<───────────────────────│                      │  (manifest row)     │
```

### 7.3 Engine Resolution Flow

```
generate_speech()
        │
        ▼
  _resolve_generation_engine()
        │
        ▼
  pick_cached_tts_engine(preferred)
        │
        ├── is_downloaded(model_name, model_size)?  ← manifest gate
        │       NO → skip
        │       YES ↓
        │
        ├── is_engine_cached(engine)?  ← actual files on disk
        │       NO → skip
        │       YES ↓
        │
        └── return engine (e.g. "kokoro")
                │
                ▼
        load_engine_model(engine)
                │
                ├── offload current TTS if any
                ├── check circuit breaker
                ├── check VRAM pressure
                └── backend.load_model()
                        │
                        ▼
                backend.generate(text, voice, ...)
```

---

## 8. Database Schema

**SQLite with WAL mode** — concurrent readers, 5s busy timeout.

**Key tables:**

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `voice_profiles` | Voice presets/clones/designs | id, name, voice_type, preset_engine, preset_voice_id |
| `generations` | TTS generation records | id, profile_id, text, status, engine, audio_path, duration |
| `generation_versions` | Audio versions per generation | id, generation_id, audio_path, version_type |
| `model_downloads` | Download manifest (entitlement gate) | model_name, model_size, engine |
| `stories` | Multi-generation sequences | id, name, description |
| `story_items` | Story → generation links | story_id, generation_id, timecode, trim, volume |
| `projects` | Studio sessions | id, name, session_data (JSON) |
| `mixer_sessions` | Mixer channel strips | id, channel_data (JSON) |
| `licenses` | Marketplace licenses | id, product_id, license_key |
| `entitlements` | Fast entitlement lookup | product_id |
| `conversations` | Agent chat sessions | id, session_type |
| `conversation_messages` | Chat messages | conversation_id, role, content, tool_calls |

---

## 9. Build & Dev System

### Commands (via `just`)

| Command | What it does |
|---------|-------------|
| `just setup` | Create Python venv, detect GPU, install deps, npm install, enable git hooks |
| `just dev` | Start backend + Tauri desktop app |
| `just dev-backend` | Start backend only |
| `just dev-web` | Start backend + Vite browser (no Tauri) |
| `just build` | Full production build (PyInstaller + Tauri bundler) |
| `just check` | Run all linters (Biome + Ruff + async-blocking + placeholders) |
| `just test` | Core harness gate (5 critical test files) |
| `just test-all` | Full pytest suite |
| `just kill` | Kill all dev processes |

### Build Pipeline (`just build`)

```
1. download-models    → fetch ONNX weights (DeepFilterNet, Demucs)
2. build-server       → PyInstaller --onedir (~1GB binary)
3. build-mcp-shim     → stdio-to-HTTP proxy (tiny, no ML deps)
4. build-tauri        → npm run tauri build → installable app
```

---

## 10. Key Abstractions

| Abstraction | Location | Purpose |
|-------------|----------|---------|
| `GenerationContext` | services/generation.py:38 | Frozen dataclass bundling all TTS generation parameters |
| `TaskManager` | utils/tasks.py:29 | In-memory tracker for active downloads/generations |
| `ProgressManager` | utils/progress.py:12 | Thread-safe SSE progress with throttled updates |
| `ModelLifecycleManager` | utils/model_lifecycle.py:66 | Idle-unload scheduler, circuit breaker, performance mode |
| `ENGINE_REGISTRY` | backends/registry.py:77 | Declarative TTS engine table (add engine = one row) |
| `ModelConfig` | backends/protocols.py:48 | Declarative descriptor for every downloadable model |
| `Deferred Startup` | utils/startup_defer.py | Lazy init with asyncio.Event+Lock per service |
| `ApiClient` | lib/api/client.ts | Singleton API client (27-domain inheritance chain) |
| `usePlayerStore` | stores/playerStore.ts | Global audio player state (WaveSurfer) |

---

## 11. Testing

### Backend (pytest)
- **Location:** `backend/tests/` (100+ files)
- **Config:** `pyproject.toml` — asyncio_mode=auto, default marker excludes E2E
- **Core gate:** 5 critical test files (tool registry, TR dispatch, STT backends, STT self-check, generation subfunctions)

### Frontend (Vitest)
- **Location:** `app/src/test/` + scattered feature tests (50 files)
- **Libraries:** Testing Library (React, jest-dom, user-event)
- **E2E:** Playwright (configured, tests in `tests/e2e/`)

---

## 12. Environment & Config

**All env vars have sane defaults** (`.env.example` shows all, all commented out):

| Variable | Default | Purpose |
|----------|---------|---------|
| `OTOYIN_PORT` | 17493 | Backend port |
| `OTOYIN_HOST` | 127.0.0.1 | Backend host |
| `OTOYIN_MODELS_DIR` | `./data/models` | Model storage |
| `LICENSE_SIGNING_KEY` | auto-generated | Marketplace signing |
| `TWENTYLABS_SECRET` | auto-generated Fernet | Encryption |
| `FREESOUND_API_KEY` | — | Freesound SFX search |

---

## 13. Skills & Agent System

**63 agent skills** in `.agents/skills/` covering:
- TTS engines (Kokoro, Piper, Chatterbox, Qwen, XTTS, TADA, LuxTTS)
- Audio processing (cleanup, enhance, noise-reduction, mastering, loudness)
- Music production (ACE-Step, Stable Audio, drum machine, instruments)
- Studio operations (stories, conversation, ADR, comping, batch)
- Voice (cloning, profiles, changer, chat)
- Video (dubbing, dubbing pipeline)
- Publishing (audiobooks, podcast, platform export, subtitles)
- Agent operations (operating guide, troubleshooting, PR triage)

**Each skill** is a `SKILL.md` file with trigger conditions, workflow steps, and references to backend code.

---

*Generated for otoyin codebase — 15 TTS engines, 4 STT, 3 VC, 3 Music, 201 MCP tools, 260+ React components, 84 route modules, 89 services, 25+ database tables.*
