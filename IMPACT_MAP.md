# IMPACT_MAP.md — otoyin Architectural Impact Map

> Updated on structural changes. Outdated maps are worse than none.

## Core Systems

| System | Key Files | Owner | Dependencies |
|---|---|---|---|
| **AI Assistant panel** | `app/src/features/assistant/` (`AssistantPanel.tsx` resizable + `assistantWidth.ts` clamp/persist, `AssistantMessage.tsx` bubbles, `MarkdownBody.tsx` + `CodeBlock.tsx` markdown rendering, `AudioTransport.tsx`, `assistantTabs.ts`, `assistantStreamEvents.ts`, `useAssistantMessageActions.ts`, `settings/` sections), `app/src/stores/uiStore.ts` (`assistantWidth`), backend `routes/assistant*.py`, `routes/memory.py` (message edit/delete/branch), `services/memory.py`, `agents/manifest.py` + `agents/instructions.py` (AGENT_INSTRUCTIONS) | Both | react-markdown (lazy chunk), Prism, SSE `/assistant/chat`, MCP tools |
| **API Client** | `app/src/lib/api/client.ts`, `client*.ts` | Frontend | Backend REST API |
| **TTS Engine** | `backend/backends/*.py`, `routes/generate.py` | Backend | Model configs, database |
| **Story Editor** | `app/src/features/stories/editor/StoryTrackEditor.tsx` | Frontend | API Client, Story Store |
| **Audio Studio** | `app/src/features/audioStudio/AudioStudio.tsx`, `usePlaybackEngine.ts`, `AudioStudioStore.ts` (moved from `components/AudioStudio/` 2026-08-19), `lib/hooks/useAudioRecording.ts` | Frontend | Web Audio API, AudioStudioStore |
| **Voice Profiles** | `app/src/features/voices/` (live UI, moved from `components/VoiceProfiles/` 2026-10-09; the `components/VoiceProfiles/` dir now holds dead legacy only), `backend/services/profiles.py` | Both | TTS engines, database |
| **Model Downloads** | `app/src/features/store/` (download UI is the Marketplace; the old `components/ServerSettings/` detail/list was removed), `backend/routes/models/` | Both | HuggingFace API |
| **On-Demand Pip Install** | `backend/backends/protocols.py` (`ModelConfig.pip_packages`, `ModelConfig.venv_name`), `backend/routes/models/download.py` (`_ensure_engine_pip_deps`, `_ensure_venv`), `backend/backends/configs/*.py` (all model configs) | Backend | 16 engines declare pip deps; 3 engines (rvc, seed_vc, demucs) get dedicated venvs at `data/venvs/{name}/` for dependency conflicts |
| **Marketplace Store** | `app/src/features/store/` (`StorePage.tsx` + `StoreProductCard.tsx` + `StoreDetailModal.tsx` + `storeUtils.ts`), `app/src/features/store/storeUtils.ts` (rich descriptions), `backend/routes/marketplace.py`, `backend/services/marketplace_catalog.py`, `backend/routes/models/status.py` (TTL cache) | Both | Signed catalog, offline licensing. Checkout binds licenses to the machine fingerprint via `GET /marketplace/device-id`; the verifying key resolves env → bundled `backend/data/marketplace_public_key.txt` (frozen builds) → dev placeholder |
| **Remote Marketplace Hosting** | `marketplace/Dockerfile`, `marketplace/worker/index.ts`, `marketplace/wrangler.jsonc`, `marketplace/web/next.config.js`, `.github/workflows/marketplace-cloudflare.yml` | Platform | Cloudflare Workers Containers, Pages, Neon, Dodo; origins must match CORS config |
| **Vocal Isolation (Demucs)** | `backend/services/stem_separation*.py`, `backend/routes/audio_processing.py` (`/audio/separate`), `app/src/features/workspace/VocalIsolationView.tsx`, `app/src/lib/audio/ensureModel.ts`, Audio Studio toolbar isolate | Both | ONNX weights `MrCitron/demucs-v4-onnx` (downloaded via Store), optional torch demucs |
| **MCP Server** | `backend/mcp_server/` | Backend | All backend services |
| **Database** | `backend/database/`, `backend/models.py` | Backend | SQLAlchemy, SQLite |
| **Server Config** | `backend/config.py` (`get_server_base_url/host/port`) | Backend | Env vars `TWENTYLABS_HOST/PORT` |
| **ONNX Device Strategy** | `backend/backends/_onnx_precision.py`, `bin/setup-onnx.ps1` | Backend | onnxruntime-directml, `data/runtime/onnx_provider.json` |
| **API Keys Manager** | `backend/routes/model_providers.py`, `app/src/features/settings/ApiKeysPage.tsx` | Both | model_providers table, Fernet encryption |
| **Voice-Changer** | `backend/voice_changer/` (`__init__`, `pipeline`, `server`, `__main__`) | Backend | VAD, DeepFilterNet, Whisper, Kokoro TTS, LavaSR |
| **Streaming LavaSR** | `backend/services/streaming_lavasr.py` | Backend | audiosronnx, sliding window + overlap-add crossfade |
| **Emotion DSP** | `backend/services/audio_tags.py` (`apply_emotion_dsp`, `EMOTION_PRESETS`) | Backend | scipy resample, numpy |
| **Silero VAD (ONNX)** | `backend/services/vad.py` | Backend | onnxruntime, `silero_vad_16k_op15.onnx` |
| **faster-whisper STT** | `backend/backends/faster_whisper_backend.py`, `backend/routes/transcript_edit.py` | Backend | CTranslate2 int8, Systran HF repos, word timestamps + confidence |
| **Transcript Editing** | `backend/routes/transcript_edit.py`, `app/src/lib/transcript/` (TranscriptService, useTranscriptEditor, TranscriptEditor, TranscriptDrawer), `app/src/features/audioStudio/` (moved from `components/AudioStudio/` 2026-08-19), `app/src/features/workspace/TranscriptEditView.tsx` | Both | faster-whisper STT, non-destructive audio splicing with crossfade |
| **GGUF Planner LLM** | `backend/backends/gguf_server_backend.py` (spawns llama.cpp `server.exe` sidecar on a free localhost port) | Backend | jackrong Qwen3.5 GGUF repos, Ministral GGUF, llama-server binary, huggingface_hub, aiohttp |
| **Fish Audio S2 Pro** | `backend/backends/fish_speech_s2_backend.py`, `backends/registry.py:124`, `configs/tts.py:187`, `routes/models/download.py:242` | Backend | s2.cpp binary (`TWENTYLABS_S2_CPP`), `rodrigomt/s2-pro-gguf` Q4_K_M + tokenizer |
| **Performance Mode** | `backend/database/models.py:297` `PerformanceSettings`, `services/settings.py:124`, `routes/settings.py:71`, `utils/model_lifecycle.py:141`, `app/src/features/settings/GeneralPage.tsx`, `VoiceProfiles/ProfileCard.tsx:46` | Both | SQLite singleton, lifecycle 30s poll |
| **Workflow Skills** | `backend/agents/manifest.py:40` `SkillSpec`×6, `routes/assistant.py:168` `GET /assistant/skills`, `mcp_server/tools/skills.py:1` `21labs.list_skills` | Both | `TOOL-REFERENCE.md`, `SKILL_SPECS` |
| **App Loading** | `app/src/ui/AppLoadingScreen.tsx`, `app/src/lib/hooks/useBootReadiness.ts`, `app/src/router.tsx`, `LoadingState.tsx:12`, `.agents/skills/app-ui-loading/SKILL.md:1` | Frontend | `/health/ready`, Tauri backend URL handoff, restart lifecycle, `aria-busy` |
| **ADR** | `backend/routes/adr.py` (13 endpoints), `backend/services/adr.py` (DB + scoring + align + waveform), `app/src/features/workspace/adr/ADRView.tsx` (654 lines, waveform + auto-select + align), `app/src/lib/api/clientADR.ts` (score/autoSelect/align/waveform) | Both | DB ADRSession/Line/Take, soundfile, numpy correlate, AudioContext |
| **Cloud BYOK (STT/Music/VC)** | `backend/services/cloud_provider.py` (`transcribe_via_cloud`, `generate_music_via_cloud`, `convert_voice_via_cloud`), `backend/backends/cloud_music_backend.py`, `cloud_vc_backend.py`, `cloud_stt_backend.py`, `backend/routes/transcription.py`, `generate.py`, `voice_convert.py`, `app/src/features/generate/engines.ts` + `app/src/lib/constants/engines.ts` (`cloud` engine; `components/Generation/EngineModelSelector.tsx` was removed), `app/src/features/workspace/VoiceConverterView.tsx` (`cloud` toggle), `types.ts` (`WhisperModelSize` includes `cloud`) | Both | BYOK `model_providers` encrypted, httpx, soundfile |

## Change Impact Rules

### Frontend changes
- **Layout/chrome change** (`app/src/layouts/` — AppFrame, Sidebar, Banner, AudioPlayer, ErrorBoundary, Notifications): touches shared shell; check every route's mount path
- **Feature change** (`app/src/features/<area>/`): isolated to that area unless it edits a shared store/API client
- **`app/src/components/ui/` change**: shared primitives — all consumers affected (grep `@/components/ui`)
- **API client change**: all consumers across `features/` affected
- **Store change**: all consumers of that store affected
- **Type change in `types.ts`**: all importers affected
- **GenerationControlsRow.tsx change**: affects all generation flows (main editor, stories)

### Backend changes
- **Route change**: frontend API client may need update
- **Backend change**: routes calling that backend may need update
- **Model/schema change**: database migration may be needed
- **MCP tool change**: agent tooling may need update
- **generation.py change**: affects all TTS generation paths (generate, retry, regenerate, edit)

### Cross-cutting
- **Dependency upgrade**: run `just setup`, verify `bin/check.ps1`
- **Config change**: check `biome.json`, `tsconfig.json`, `pyproject.toml`
- **Icon change**: grep for heroicons imports across all components
- **ONNX provider change**: run `bin/setup-onnx.ps1`, affects all ONNX backends + VAD

## Phases 0–7 Implementation Log

### Phase 0 — API Dynamization (done)
- Centralized `config.get_server_base_url()` / `get_server_host()` / `get_server_port()`
- Fixed hardcoded `http://127.0.0.1:8000` in `voice_chat.py:218`
- MCP `_common.py` reads `TWENTYLABS_HOST` env
- `main.py` / `server.py` default port 17493, read env as fallback
- **Impact**: all HTTP calls to backend now resolve dynamically

### Phase 1 — ONNX Device Strategy (done)
- `bin/setup-onnx.ps1`: GPU detection → `onnxruntime-directml` or `onnxruntime`
- `_onnx_precision.py`: `resolve_providers()` reads `data/runtime/onnx_provider.json`
- `record_onnx_provider()` persists choice
- **Impact**: all ONNX backends + VAD use resolved providers

### Phase 2 — Unified API Keys Manager (done)
- `model_providers` domain enum extended: `tts|music|sfx|vc|llm|stt`
- `freesound.py` rewritten: DB key via `_get_api_key()` with env fallback
- `clientProviders.ts` API client for CRUD
- `ApiKeysPage.tsx` settings UI (grouped by domain, CRUD, encrypted keys)
- Router wired `/settings/api-keys`
- **Impact**: all provider keys now centralized in DB, BYOK wired

### Phase 3 — Headless Voice-Changer Service (done)
- `backend/voice_changer/` package: subprocess spawn/kill/status
- Pipeline: VAD → denoise → transcribe → TTS → enhance (LavaSR)
- WS endpoint: OpenAI-Realtime protocol on port 17494
- `VoiceChatSettings`: `voice_changer_enabled`, `voice_changer_port`
- Settings UI: spawn/kill buttons, status indicator
- **Impact**: separate process, settings persistence, auto-spawn on startup

### Phase 4 — LavaSR Streaming Wrapper (done)
- `StreamingLavaSR`: sliding 2–4s windows, overlap-add crossfade, 16k→48k
- `audio_enhancer.py`: `get_streaming_lavasr()` factory
- Voice-changer pipeline uses streaming as primary, batch fallback
- **Impact**: real-time audio enhancement without batch latency

### Phase 5 — Emotion Tags Tier 1 (done)
- `EMOTION_PRESETS` dict (11 presets) in `audio_tags.py`
- `apply_emotion_dsp()`: pitch shift, energy scaling, jitter, brightness filter
- `GenerationRequest.emotion` field (backend + frontend)
- Emotion selector dropdown in `GenerationControlsRow.tsx`
- `/audio/emotion-presets` endpoint
- Wired into `run_generation()` post-normalization
- **Impact**: all generation paths support emotion post-processing

### Phase 7 — UI Polish (done)
- Settings two-column layout, sidebar collapsible
- Darker palette, pulse animations, logo CSS breath
- Amplitude-reactive warm rose glow

### Audit D — Plugin manifest schema v1 (P0 deliverable, 2026-08-19, done)
- `backend/plugins/manifest_schema.json` — JSON Schema draft 2020-12, strict (`additionalProperties: false` everywhere): id (reverse-domain), name, version (semver), kind (6 enums), developer (name required, `ed25519:` pubkey format), entry (required for mcp-server/ui-panel; mcp needs command, ui needs file), tools/models/permissions (closed enum, unique)/min_version/checksums (POSIX paths only, `sha256:<64hex>`). Meta-validated against draft 2020-12 at import.
- `backend/plugins/manifest.py` — `validate_manifest(dict|str)`, `load_manifest(path)`, `verify_checksums(manifest, bundle_dir)` (sha256 of declared files). New package `backend/plugins/`.
- `docs/PLUGIN_MANIFEST_SCHEMA.md` — the schema doc (P0 deliverable); knowledge index entry #53.
- `jsonschema>=4.20.0` declared in `backend/requirements-core.txt` (was transitive, now explicit).
- Tests: `tests/test_plugin_manifest.py` — 33 tests (meta-schema validity, required fields, id/version/pubkey/checksum rejection, entry conditionals, duplicate/unknown permissions, checksum verify ok/mismatch/missing, file load). Full suite: 762 passed, 16 skipped, 0 failed; ruff clean.
- NOT in v1 (P1): bundle-wide Ed25519 signature verification, install/execution flow, version negotiation.

### Audit C — In-app Log viewer (2026-08-19, done)- Gap: logs streamed into `logStore` (Tauri `server-log` events) + persisted to `appData/logs/server_{stdout,stderr}.log` — but nothing displayed them.
- `app/src/features/settings/LogsPage.tsx` (was `components/ServerTab/`): search, stream filter, copy, export (.log, ANSI-stripped), open log folder (Tauri), no-match state, toasts. Route `/settings/logs` already existed.
- `PlatformFilesystem.getLogsDir()` added (types.ts + webPlatform "" + `tauri/src/platform/filesystem.ts` → `appDataDir()/logs`). i18n ×4 locales (16 keys under `settings.logs`).
- Verification: lint/format clean; zero typecheck errors in touched files (both app + tauri). Full gate red from USER in-progress work (AssistantPanel, StoryTrackEditor, MixerView/TimelineView, useEditorDrag, index.css) — untouched.

### Phase 8 — GGUF Planner LLM Swap (done, runtime smoke passed 2026-08-19)
- `lfm_gguf_backend.py` (llama-cpp-python) deleted → `gguf_server_backend.py`: spawns llama.cpp `server.exe` sidecar, OpenAI-compatible `/v1/chat/completions`, `/health` poll, `_resolve_gguf_filename` (list_repo_files + quant tag, never snapshot)
- Engine id `lfm_llm` → `gguf_llm` across: `protocols.py`, `registry.py`, `config.py` (`DEFAULT_LLM_ENGINE`), `model_lifecycle.py` (`ALWAYS_ON_ENGINES`), `app.py` registration, `capabilities.py`, `routes/llm.py`, `models.py` (2 request patterns), `build_binary.py`, `scripts/download_required_models.py`
- Catalog `_get_lfm_llm_configs` → `_get_gguf_llm_configs`: planner-2b (free default), planner-0.8b (free fallback), planner-4b-v3 (paid), planner-ministral-3b (paid)
- `llm_context.py` RAM tiers reworked for 2B/0.8B/4B/3B; recommended pack now `planner-2b`
- `assistant_stream.py` default `model_id` → `2B-Q4_K_M`; assistant tool prompt text updated
- **Impact**: API `model_size` values changed — frontend slice done 2026-08-19: `types.ts` `Qwen3ModelSize` → `PlannerModelSize` (4 ids), CapturesPage + CapturesTab defaults/options, i18n ×4 locales, `database/models.py` `llm_model` default → `2B-Q4_K_M`, AssistantSettings RAM lookup exact-key-first; runtime smoke passed (health, /assistant/models lists 4 planners, capabilities by_size 2B/0.8B/4B-v3/3B-Reasoning, /llm/generate → graceful "being downloaded", invalid `1.7B` → 422, /capture/readiness → planner-2b not-ready); GGUF downloaded + generation proven end-to-end 2026-08-19 (`llama-server.exe` + DLLs in `data/models/`)
- **Bug fixed 2026-08-19** (`_resolve_gguf_filename`, `gguf_server_backend.py:58`): filter compared uppercase `quant_tag` against lowercased filenames (`quant_tag in f.lower()`), so candidates were ALWAYS empty and every GGUF download silently fell back to the alphabetically-first quant (Q3_K_M instead of catalog Q4_K_M). Fixed to `quant_tag.lower() in f.lower()`; verified live: 2B→`Qwen3.5-2B.Q4_K_M.gguf` (1212MB), 0.8B→`Qwen3.5-0.8B.Q5_K_M.gguf`. Wrong-quant partial (1GB Q3_K_M) cancelled + purged; correct Q4_K_M download running (~6MB/s).
- **Bug fixed 2026-08-19** (`routes/__init__.py` router discovery): `pkgutil.iter_modules` yields extensionless names, so the `not name.endswith(".py")` guard skipped every plain module — only health + `models` registered ("Routes: registered 2 routers"). Every backend since the break served 18 paths; the `/llm/generate` 404 traced here, not to stale processes. Loop simplified; now "Routes: registered 64 routers", 305 paths.
- **Env knob 2026-08-19** (`gguf_runner.py`): `TWENTYLABS_LLAMA_GEN_TIMEOUT` (default 180s) replaces hardcoded read timeout in `chat_completion`/`text_completion` — same pattern as `TWENTYLABS_LLAMA_STARTUP_TIMEOUT`.
- **Runtime proof 2026-08-19**: `/llm/generate` 200 (70s, first app run) with downloaded planner-2b; direct chat completion → "hello world" in 16.8s (~30 tok/s warm on 2-core). Known pre-existing: Opus-Distilled reasoning model can exhaust small token budgets with empty content (500 "spent its token budget thinking" — by design).
- **Sidecar lifecycle fixed 2026-08-19** (`gguf_runner.py`): adopt-or-reap. Before spawning, scan running llama-server processes (psutil): adopt a healthy one already serving the same model file + n_ctx (incl. orphans whose parent died — saves the 25-40s cold load), kill stale *orphan* duplicates and orphans running a *different* model (prevents the pile-up that crashed the active sidecar at ~1.3GB each), leave live-parent foreign sidecars alone. Same-model servers that are still cold-loading (parent alive, not yet healthy) are waited for, never torn down. **Refcounted ownership** (`_OWNERS` pid→count): a sidecar shared by two backends is only killed when the LAST owner stops — one backend shutting down can never yank the server out from under another mid-generation. `is_alive`/`stop()` handle adopted (`psutil.Process`) vs spawned (`Popen`) handles. **Memory-frugal spawns**: `--cache-type-k/v q8_0` (halves KV RAM, env `TWENTYLABS_LLAMA_KV_CACHE_TYPE`) + `--parallel 1` single slot (env `TWENTYLABS_LLAMA_PARALLEL`) — 4 concurrent KV allocations were the exact OOM pressure that crashed the sidecar; measured 0.19GB free on this box while a server runs. Startup timeout default raised 60s→120s (observed 60-180s under memory pressure). Unit tests: `tests/test_gguf_runner.py` (11 tests: arg parsing, finder filtering/orphan flagging, adopt/stale-kill/reap/leave-live/wait-for-loading decisions, refcounted stop). Live proof: spawn → healthy → second instance adopted in 0.9s (vs 25-40s cold) → shared pid/port → A.stop leaves it up → B.stop kills → zero processes remain.
- **Token budget wired 2026-08-19** (`routes/llm.py`): `/llm/generate` now honors the user's saved `max_tokens` from the Assistant settings panel (which already existed — Slice C2 "Context & Token Budget", `GET/PUT /settings/assistant`) via `get_budget_max_tokens(model_size)` when `request.max_tokens` is None; same policy as assistant_stream/captures-refine/personality. Agent does NOT decide budgets — users choose in the panel.
- **Pre-existing (not from this change)**: `test_audio_enhancer.py::test_enhance_invalid_mode` fails — `routes/features.py:111` returns structured error dict, test expects string

### Audit B — AudioStudio + configs fixes (2026-08-18, done)
- `StudioTrack.channels` field added (default 1) — set at decode/import/MIDI-render sites; bounce config uses it (`AudioStudioStore.ts`, `templates.ts`, `AudioStudio.tsx`)
- Ducking rebuilt: `duckGain`+`duckMeter` sidechain in `startPlayback`; RMS duck in `updateTime`; `applyDuckEnvelope.ts` (new) applied to offline export
- Export now mirrors live playback: per-track `buildEffectChain` + `source.start(0)` in `handleExport`
- Recording switched to id-based (`recordingTrackIdRef`); `useAudioRecording` gains `onRecordingError` teardown
- `ModelStatus.supports_instruct` (backend `models.py`, `routes/models/status.py`) → frontend `types.ts`, `useGenerationForm.ts`, `useEngineSync.ts`, `EngineModelSelector.tsx` (instruct gate = `emotion_control || supports_instruct`)
- `biome.json` overrides added: `tauri/dist/**`, `web/dist/**` (linter+formatter disabled — build artifacts)
- **Impact**: pan/loop/duck/export paths share one graph; `channels` flows through store → templates → bounce; instruct toggle visible for engines flagged `supports_instruct` in the model catalog; the generated `app/src/lib/api/models/ModelStatus.ts` was dropped — hand-maintained `types.ts` is the source of truth

### Phase 9 — P0 Engine Removals (2026-08-19, done; marketplace launch prep)
- Removed engines: `qwen` (Qwen3-TTS PyTorch), `qwen_custom_voice`, `step_audio_editx`, `pocket_emo` (EmoShift), MLX whisper variant, `bark` non-verbal, `acestep` (music). Kept as P1 paid plans: Qwen3-TTS 1.7B GGUF, Bark Small/Large TTS, ACE-Step 1.5.
- Deleted backend files: `pytorch_backend.py`, `mlx_backend.py`, `qwen_custom_voice_backend.py`, `step_audio_editx_backend.py`, `pocket_emo_backend.py`, `bark_backend.py`, `acestep_backend.py`, `mcp_server/tools/music_generation.py`, `mcp_server/tools/sound_generation.py`.
- Wiring: `configs/__init__.py` (configs dropped: qwen 0.6B/1.7B, qwen_custom_voice, step_audio_editx, pocket_emo, bark, acestep, MLX whisper), `protocols.py` (`TTS_ENGINES` 17→13, `MUSIC_ENGINES` = stable_audio only, STT = faster-whisper + whisper.cpp), `registry.py` (engine branches removed), `routes/` (qwen/pocket-emo/bark/music endpoints removed), `assistant_tools/` (`generate_music`, `generate_sound`, `list_sounds`, `arrange_music` removed), `mcp_server` tools 110→106.
- Frontend: `ENGINE_OPTIONS`, Sound Studio (Music/Bark tabs removed; StudioView = Instruments/SFX/Noise), Models tab, API client domain files, `useEngineSync`/`EngineModelSelector`.
- Docs: README (13 engines, 106 MCP tools), PROJECT_STATUS, root+docs FEATURES, engine-atlas + 15+ skill pages (REMOVED banners on tts-qwen/tts-qwen-custom-voice/music-acestep/bark-sfx; 63-pocket-emo REMOVED), GROUNDING-PACK gotchas (incl. corrected `engine_has_model_sizes` note), mcp-tools-extended/audio-orchestration/TOOL-REFERENCE, 01/05/18/33/34/38 knowledge docs, USE_CASES, CLARITY_CAPABILITIES, DEPLOYMENT_TEST_PLAN.
- **Impact**: default TTS engine `kokoro` everywhere; `engine_has_model_sizes()` True only for kokoro/styletts2/f5_tts/pocket_tts/neutts_2e/orpheus; cloned profiles route only to CLONING_ENGINES = {fish_speech, zonos, styletts2, f5_tts, pocket_tts}; `generations.engine="import"` still valid; `migrations.py` untouched (historical); `services/marketplace_catalog.py` keeps P1 entries (qwen3-tts-1.7b, acestep-1-5) intentionally.
- **Verification**: all touched files `py_compile` clean; `bin/check.ps1` ALL CHECKS PASSED (2026-08-19); pytest 647 passed / 7 skipped / 0 failed.
- **Drift fixed 2026-08-19** (marketplace work landed since Phase 9 green run): Biome lint+format — AnnouncementBanner/OffersPage/StorePage/WhatsNewPage (useBlockStatements, noNonNullAssertion, noArrayIndexKey, formatting) + NotificationBell/SupportPage format; TS — AudioStudio.tsx missing `getPeakWaveform` import; Ruff — `audio_tags.py`/`audio_tags_synth.py` import sort + unused re-exports removed + E402 (`dataclasses` import moved to top) + `routes/__init__.py` import sort; **tests broken at collection** — `assistant_tools/execution.py` was an async generator with valued `return`s (SyntaxError): rewrote `execute_tool` as plain coroutine, removed dead `stream` param + `_STREAMING_TOOLS` + SSE passthrough branch (no caller ever passed `stream=True`; `sse_event` kept — used by `assistant_stream.py`), re-exported `execute_tools_parallel` + `format_tool_error` from `assistant_tools/__init__.py`.
- **Pre-existing failures fixed 2026-08-19** (all flagged issues resolved): Biome lint — NotificationBell extra `open` dep removed, ApiKeysPage `load` wrapped in `useCallback`, useBlockStatements wrapped in EventTimeline + TelemetryPage, generated `app/src/lib/api/**` now skipped via `biome.json` override (linter+formatter disabled, matching `.biomeignore` intent); Ruff lint — RET505 unnecessary `else` removed in `utils/chunked_tts.py:386`; Ruff format — `services/generation.py` + Biome format drift fixed; `test_audio_enhancer.py::test_enhance_invalid_mode` updated to assert the real structured contract (`detail.code == "invalid_mode"`), the route at `routes/features.py:111` intentionally returns `{code, detail}` dicts.

### Audit E — Engine-removal leftovers sweep (2026-08-19, done; closes Phase 9)
- Backend source removal was already done (Phase 9). This audit swept every remaining live reference to removed engines:
- `backend/requirements.txt`: Step-Audio-EditX git install + `qwen-tts>=0.0.5` removed; curated comment 10→8; Bark/ACE-Step optional comment lines removed.
- `justfile`: chatterbox-tts / hume-tada `--no-deps` installs, Apple Silicon `requirements-mlx.txt` block, and Qwen3-TTS git install removed (Unix + Windows branches).
- Deleted: `backend/requirements-mlx.txt` (MLX Whisper removed), `scripts/test_download_progress.py` (referenced only removed engines).
- `services/tts_enhancer.py` (`qwen-tts`/`qwen-tts-custom` presets dropped), `utils/model_status.py` (`TTS_PREFERENCE_ORDER` → `["chattts","kokoro"]`), `services/audio_tags.py` (chatterbox native tags dropped from `NATIVE_TAG_ENGINES` + `_TAG_NATIVE_MAP`), `build_binary.py` (`--exclude-module` chatterbox + tada dropped; file extend-excluded from ruff by design), `pyproject.toml` (per-file-ignores for deleted backends removed), `tests/test_all_models_e2e.py` (MATRIX → kokoro-only), `tests/E2E_MODEL_TEST_DESIGN.md` + `tests/fixtures/README.md` (rewritten to current matrix), `backend/README.md` (requirements-mlx mention removed).
- **Impact**: install paths (`just setup-python` / setup) no longer pull removed-engine deps; no runtime code references removed engines; e2e matrix matches live `TTS_ENGINES`.
- **Verification**: ruff check + format clean on touched files (build_binary.py findings pre-existing + excluded); full suite 839 passed / 17 skipped / 0 failed.

### Phase 10 — P1 Engine Integrations, Slice A: Qwen3-TTS 12Hz 1.7B Base (GGUF) (2026-08-19, done)
- Research (deep-research, verified): llama.cpp >= b10270 (2026-08-04, PR #26254) ships the `llama-tts` CLI (mtmd pipeline) — NOT in llama-server. Official GGUFs `ggml-org/Qwen3-TTS-12Hz-1.7B-Base-GGUF`: backbone `Qwen3-TTS-12Hz-1.7B-Base-Q4_K_M.gguf` (1.04GB) + mandatory `mmproj-Qwen3-TTS-12Hz-1.7B-Base-Q8_0.gguf` (446MB). Flags `-m -mm -p --tts-lang --tts-speaker-file -n -o` (24kHz WAV, 512-frame ≈ 41s cap). Weights Apache-2.0 → sellable ($40 catalog id `qwen3-tts-1.7b`). CPU RTF 3-6 on 2-core → batch TTS.
- New backend: `backend/backends/qwen3_tts_backend.py` — `Qwen3TTSBackend`, one-shot `llama-tts` subprocess (no resident model), pure `build_tts_args()`, `find_llama_tts()` (env `TWENTYLABS_LLAMA_TTS` → bundled `data/models/llama-tts.exe` → PATH), `TWENTYLABS_LLAMA_TTS_TIMEOUT` default 300s, module singleton `qwen3_tts_backend`.
- Wiring: `protocols.py` (`TTS_ENGINES` += `qwen3_tts`), `registry.py` (singleton `_TTSBackendEntry`), `configs/tts.py` (`model_name="qwen3-tts-1.7b"`, engine `qwen3_tts`, hf_repo_id ggml-org, quant Q4_K_M, size_mb 1486, clone_voice, 10 langs), `routes/models/download.py` qwen3_tts branch (backbone + mmproj), `services/profiles.py` (`CLONING_ENGINES` += `qwen3_tts`).
- Frontend: `EngineModelSelector.tsx` (ENGINE_OPTIONS + ENGINE_DESCRIPTIONS + CLONING_ENGINES), `types.ts` engine union, `profileFormHelpers.ts`, `useGenerationForm.ts` (schema + MODEL_NAME_MAP), `useProfileSync.ts`, `VoiceChatSettings.tsx`, `useModelSections.ts`, `modelUtils.ts` (MODEL_DESCRIPTIONS), `format.ts` (ENGINE_DISPLAY_NAMES), `languages.ts` (10 langs).
- Tests: new `backend/tests/test_qwen3_tts_backend.py` (18 tests — arg building, binary resolution incl. env/bundled/PATH, subprocess lifecycle via monkeypatched `subprocess.run`, timeout/nonzero-exit/no-WAV errors, license-gate catalog id, download branch fetches backbone + mmproj via patched `huggingface_hub.hf_hub_download`).
- **Verification**: ruff check + format clean; targeted 18/18 pass; full suite 857 passed / 17 skipped / 0 failed; `bun run typecheck` clean (0 errors); biome lint+format clean on touched files.
- **Impact**: new resident engine slot for llama-tts (one-shot, unloads immediately); voice chat `pick_cached_tts_engine` picks it up via `TTS_ENGINES`; license gate at `routes/models/download.py:151` covers download; catalog product pre-exists (Phase 9 kept it).

### Phase 11 - P1 Engine Integrations, Slice B: Bark Small (GGUF / CrispASR) (2026-08-19, done)
- **P1-C decision (2026-08-19): Bark Large DROPPED.** No prebuilt bark-large GGUF exists anywhere (cstr org ships bark-small only; cstr/bark-large-GGUF 401; CrispASR TTS table lists only bark-small). Conversion would need in-app torch + suno/bark .pt (~1.2GB) + convert script + quantize - not offline-first. bark-large product removed from marketplace_catalog.py; design doc docs/marketplace/catalog-v1.json entry marked DROPPED with re-add condition.
- Research (deep-research, verified): llama.cpp has ZERO Bark support; path is CrispASR (CrispStrobe whisper.cpp fork, MIT, v0.8.29, Windows CPU zip). Model cstr/bark-small-GGUF: bark-small-q4_k.gguf 235MB (model card authoritative), single GGUF packs 3 GPT-2 sub-models + EnCodec 24kHz decoder. CLI --backend bark -m <gguf> --tts <text> --tts-output <wav> [--voice <path.npz>]; 13 langs baked into speaker prompts (en de es fr hi it ja ko pl pt ru tr zh); MIT - sellable ( catalog id bark-small). CPU RTF ~3.3 - batch TTS.
- Key verified detail: --voice takes a DIRECT .npz path (preset names NOT resolved - crispasr_backend_bark.cpp: "speaker presets not yet supported"); npz parser (bark_tts.cpp bark_set_speaker_npz) matches exact member names semantic_prompt/coarse_prompt/fine_prompt and requires STORED (uncompressed) zip members - pack with np.savez, never savez_compressed. Voices from suno/bark-small speaker_embeddings/v2/<lang>_speaker_<n>_{semantic,coarse,fine}_prompt.npy (13 langs x 10 speakers; curated 2/language = 26).
- New backend: backend/backends/bark_backend.py - BarkBackend, one-shot crispasr subprocess, pure build_tts_args(), find_crispasr() (env TWENTYLABS_CRISPASR -> bundled data/models/crispasr.exe -> PATH), pack_voice_npz() (npy -> npz conversion), BARK_VOICES (26 presets, gender unset - Suno does not document), TWENTYLABS_CRISPASR_TIMEOUT default 600s, module singleton bark_backend.
- Wiring: protocols.py (TTS_ENGINES += bark_small), 
egistry.py (singleton entry), configs/tts.py (model_name="bark-small", engine bark_small, hf_repo cstr/bark-small-GGUF, quant q4_k, size_mb 235, clone_voice=False, 13 langs, structured_preset_voices lazily from BARK_VOICES to avoid import cycle), 
outes/models/download.py bark branch (gguf + per-voice pack_voice_npz), services/profiles.py (_get_preset_voice_ids bark branch).
- Frontend (10 files, mirror qwen3_tts but NOT cloning lists): EngineModelSelector.tsx (ENGINE_OPTIONS + ENGINE_DESCRIPTIONS "13 languages, 26 preset voices, 24kHz, CPU (CrispASR)"), 	ypes.ts engine union, profileFormHelpers.ts, useGenerationForm.ts (schema + MODEL_NAME_MAP bark-small), useProfileSync.ts, VoiceChatSettings.tsx, useModelSections.ts, modelUtils.ts, format.ts, languages.ts (13 langs).
- Tests: new backend/tests/test_bark_backend.py (25 tests - arg building, binary resolution, voice npy->npz packing incl. STORED-member + exact-key assertions, npz idempotency, subprocess lifecycle via monkeypatched subprocess.run, missing voice pack / binary / cache / nonzero-exit / no-WAV / timeout errors, registry/config/catalog gate, preset validation, download branch fetches gguf + packs all 26 voices).
- **Verification**: ruff check + format clean; targeted 25/25 pass; full suite 1021 passed / 17 skipped / 0 failed; bun run typecheck clean (0 errors); biome lint+format clean on 9 touched frontend files.
- **Impact**: second subprocess one-shot TTS slot (CrispASR, unloads immediately); preset-voice profile flow extended to bark_small (26 voices, 13 langs); license gate covers download; catalog product pre-exists (bark-small $5). Voice packs are part of the model download (offline-first).

### Phase 12 - P1 Engine Integrations, Slice C: ACE-Step 1.5 (music) (2026-08-19, done)
- Research (deep-research, verified): `lnearyux/ACE-Step` does NOT exist (404); official org is `ace-step` (GitHub) / `ACE-Step` (HF). arXiv 2411.00925 is NOT the paper (plasma-lens physics); real papers: v1 = arXiv 2506.00045, 1.5 = arXiv 2602.00744. "1.7B" is the LM planner only (acestep-5Hz-lm-1.7B); full stack ~10GB bundle `ACE-Step/Ace-Step1.5` (ungated): DiT 2B turbo (`acestep-v15-turbo`, 4.78GB bf16) + LM 1.7B + Qwen3-Embedding-0.6B + VAE (337MB). Runs via `pipeline("text-to-audio", model=repo, trust_remote_code=True)` (custom modeling code ships in the bundle); transformers range [4.51, 4.58) - app pinned 4.57.6 OK; torch 2.5.1 older than their 2.7.1 rec - runtime-verify by user. 48kHz stereo, 10s-10min, turbo 8 steps no CFG; CPU ~1-3 min per 10s clip (slow - documented, not fixable). License: code MIT (1.5) / Apache-2.0 (v1), weights MIT - sellable ($43 catalog id `acestep-1-5`). GGML alternative exists (acestep.cpp / ace-server + Serveurperso GGUFs ~5.4GB) but is a third-party community port - NOT chosen; official torch path matches existing torch backends.
- Rebuilt backend: `backend/backends/acestep_backend.py` (was deleted in P0) - AceStepBackend, resident transformers pipeline, `load_model()` gated on `is_model_cached` (ModelNotCachedError), prompt folding `{genre}, {mood}, {prompt}` + `{tempo} bpm` when set, `max_duration_seconds` + `seed` kwargs, output channel-mean'd mono at model-native 48000 (old 1.0 contract was mono 44100 - kept the mono convention, native rate), `is_available()` via find_spec (transformers + torch), module singleton `acestep_backend`.
- Wiring: protocols.py MUSIC_ENGINES += acestep; registry.py get_music_backend branch; configs/__init__.py `_get_music_configs()` (model_name="acestep-1-5" == catalog id, engine acestep, hf_repo ACE-Step/Ace-Step1.5, quant bf16, size_mb 10300) wired into get_all_model_configs(); download uses the generic snapshot_download else-branch (bundle ships custom .py code - full snapshot required, no new branch needed); routes/generate.py POST /generate/music (bounds 1-300s, genre/mood/tempo, 503 not-available / 400 uncached / 500 else, WAV stream); mcp_server/tools/generation.py `21labs.generate_music` restored (was removed in P0; list_models auto-includes acestep via MUSIC_ENGINES).
- Key correctness fix: `with_retry` awaits `func()` - the blocking sync `generate()` is wrapped in `asyncio.to_thread` so the event loop stays free during multi-minute CPU runs (SFX route has the same latent await-tuple bug - logged to AGENT_FEEDBACK, NOT fixed in this slice).
- Tests: new `backend/tests/test_acestep_backend.py` (19 tests - engine/config/catalog-gate wiring, registry singleton + unknown engine, availability, cache gate, pipeline build idempotency + trust_remote_code, prompt folding incl. tempo/seed omission, mono-mean + sample-rate default, lifecycle, route 200/503/400/422 bounds, MCP tool via patched source module + asyncio.run).
- **Verification**: ruff check + format clean; targeted 19/19 pass; full suite 1021 passed / 17 skipped / 0 failed (regression-free); no TS changes this slice.
- **Impact**: music generation capability restored (REST + MCP), second MusicBackend engine; license gate covers download via id==model_name; download = one 10GB snapshot (offline-first, includes custom code). Runtime (real inference) deferred to user: 10GB model not downloadable here; pipeline kwargs follow the official README (max_duration_seconds, seed).

### Phase 14 — Marketplace Unification & Polish (2026-08-21, done)
- **Goal:** unify Models + Store into one attractive marketplace that is the ONLY place to buy/download/delete, add rich per-model descriptions, fix tab duplication, speed up load, and polish tiny UX.
- **Marketplace UI:** rebuilt `StorePage.tsx` (298 lines) as the single surface — hero with warm accent, install count + cache path + Open folder, search (name/id/note/description/repo) + category pills (All/Voice/STT/LLM/VC/Music/Extras) + All/Free/Paid filter, grouped-by-category grid with attractive cards. Card shows: gradient accent bar per category, title, 3-line rich description, category/size/capability chips, price badge (Free/$/Installed), footer action is the ONLY buy/download/delete entry (Free→Download, Paid→Buy$/Redeem, Installing→progress+Cancel, Installed→Ready+Delete+Manage). Detail modal is the ONLY delete/redeem surface — includes delete confirm with size, license paste, download progress, specs (license/runs/quality), engine/category chips, HF link, and "why buy" callout.
- **Split for maintainability (500-line cap):** new `storeUtils.ts` (category config, accent gradients, description builder, capability chips, filtering/sorting), `StoreProductCard.tsx` (213 lines), `StoreDetailModal.tsx` (261 lines). Old `StorePage.tsx` was 553 lines and mixed concerns — now each file <300.
- **Rich descriptions:** `ServerSettings/modelUtils.ts` expanded `MODEL_DESCRIPTIONS` for all models (TTS/STT/LLM/VC/music/spatial) from one-liners to 2–3 sentence marketing + use-case copy; new entries for whisper-large-v3, parakeet, qwen3-asr, rvc/openvoice/neutts-air, steam-audio size, acestep/heartmula/stable-audio. `getDisplayDescription()` falls back to rich → catalog note → generic.
- **Tab fix:** `Sidebar.tsx` removed duplicate `Models` tab (`ArchiveBoxIcon`), renamed `Store` → `Marketplace` (`ShoppingBagIcon`, id `marketplace`), kept `Offers` separate. `router.tsx` now redirects `/models` → `/store` (single source). `RecommendedModelsBanner` adds "Browse marketplace →" link and tip that deletes/downloads are marketplace-only.
- **Slow-load fix:** `backend/routes/models/status.py` now TTL-caches `scan_cache_dir()` for 4s and the assembled `ModelStatusListResponse` for 3s (bypassed when a download is active so progress stays live) — cuts repeated 200–600ms scans on marketplace open/polls. Frontend polls reduced: `activeTasks` 2s only when downloading else 8s (was 30s), `model-status` stale 30s + refetch 30s, catalog 10m stale. `vite.config.ts` adds manualChunks for `page-store` / `page-audio-studio` / `page-workspace` so the marketplace chunk is code-split and not in the initial bundle.
- **Tiny polish:** `FolderOpen` + Open button + cache path in hero, problems banner (failed downloads + Clear), empty state with Clear filters, skeletons, `title`/`aria-label` on icon-only buttons (Delete, Cancel, Refresh, Clear search), redeem flow with JSON validation, progress bars on cards + modal, offline-license copy, and "one-time purchase · signed offline" messaging to increase willingness to pay.
- **Verification:** `tsc` clean for new Store files (remaining errors are pre-existing in AudioStudio/TranscriptDrawer/clip.test); `biome check --write` on new files clean after fixes (SVG title, block statements, a11y); manual smoke: `/models` redirects to `/store`, marketplace shows 30+ products with rich copy, installed set flips via `model-status`, download/cancel/delete/license flows delegate to marketplace only.

### Phase 13 - P1 Engine Integrations, Slice D: HeartMuLa 3B (audio.cpp sidecar) (2026-08-19, done)
- Research (deep-research, verified): official GitHub `HeartMuLa/heartlib` (Apache-2.0), HF org `HeartMuLa`, paper arXiv:2601.10547. Model `HeartMuLa-oss-3B-happy-new-year` (3.94B params: 3B global + 300M local, Llama-3.2-based hierarchical AR + HeartCodec flow-matching decoder; 48kHz MONO, up to 6 min, tags = free-text comma-separated style control). LICENSE: Apache-2.0 code AND weights (explicit 2026-01-20 announcement) - SELLABLE, HIGH confidence ($37 catalog id heartmula-3b).
- Runtime decision: official `heartlib` Python stack REJECTED - pinned deps (torchtune==0.4.0, torchao==0.9.0, bitsandbytes which blocks non-CUDA installs, modelscope, vq-pytorch), Windows triton import bug (issue #85), CPU 2-3h/song, 22.45GB F32 weights. Chose audio.cpp (0xShug0, 1.9k*, Apache-2.0, whisper.cpp-style ggml engine, prebuilt Windows binaries): `audiocpp_cli --task gen --family heartmula --model <dir> --text <p> --request-option tags=<tags> --request-option duration_sec=<n> [--seed <n>] --out <wav>`; single GGUF `HeartMuLa-GGUF/heartmula-q8_0.gguf` 7.66GB Q8_0 ungated at audio-cpp/audio.cpp-gguf (packs MuLa generator + HeartCodec decoder - no companion files).
- New backend: backend/backends/heartmula_backend.py - HeartMuLaBackend, one-shot audiocpp subprocess, pure build_args() + build_tags() (genre/mood/tempo -> comma tags, tempo as NNNbpm), find_audiocpp() (env TWENTYLABS_AUDIOCPP -> bundled data/models/audiocpp_cli.exe -> PATH), TWENTYLABS_AUDIOCPP_TIMEOUT default 3600s (CPU songs take minutes), _is_model_cached(required_files=[gguf]), load_model verifies binary+cache, is_available() = binary present, module singleton heartmula_backend. Sync generate (MusicBackend protocol).
- Wiring: protocols.py MUSIC_ENGINES += heartmula; registry.py branch; configs/__init__.py _get_music_configs += heartmula-3b (model_name == catalog id, hf_repo audio-cpp/audio.cpp-gguf, quant Q8_0, size_mb 7660); download.py heartmula branch (single hf_hub_download of the gguf - license gate id==model_name).
- Route refactor: /generate/music now takes `engine` param (default acestep), validates against MUSIC_ENGINES (400 unknown), dispatches via get_music_backend(engine) - one generic music route for all MusicBackend engines. MCP 21labs.generate_music gained engine param too (old contract had one). acestep route tests updated to patch backend.backends.get_music_backend.
- Tests: new backend/tests/test_heartmula_backend.py (25 tests - build_tags incl. tempo omission, args full/minimal/no-seed, binary resolution env/bundled/missing, load_model error paths, is_available/is_loaded, subprocess lifecycle via monkeypatched subprocess.run + soundfile WAV, nonzero-exit/no-WAV/timeout, registry/config/catalog gate, download branch fetches exact gguf path, route dispatch engine=heartmula). test_acestep_backend.py route tests refactored to the dispatch seam + unknown-engine 400 test.
- **Verification**: ruff check + format clean; targeted 25/25 + 19/19 acestep; full suite 1077 passed / 17 skipped / 0 failed; no TS changes.
- **Impact**: third MusicBackend engine (music generation now: acestep, heartmula via one generic /generate/music route); second ggml sidecar slot; CPU-gen slow (minutes/song) - documented; runtime deferred to user (7.66GB GGUF not downloadable here; CLI flags verified from audio.cpp docs/model_specs).

### Phase 15 - Ship-Readiness Audit: bug fixes, test repair, web/docs alignment (2026-08-21, done)
- **Goal:** full audit + fix to ship-ready without building; normal testing + live web testing.
- **Production bugs fixed (backend):**
  - `services/generation.py` `run_generation`: every error/cancel/finally handler referenced undefined bare `generation_id` (9× F821) — any failed/cancelled generation crashed its own error path (DB never marked failed, task leaked). Now uses `ctx.generation_id`. Also `_on_chunk` used unimported `save_audio`.
  - `routes/models/download.py` `download_in_background`: undefined `loop` in ONNX quantize step — post-download quantization always crashed (non-fatal but never ran).
  - `app.py` `graceful_exit()` Windows branch called `asyncio.get_event_loop()` from worker threads (request handler / watchdog) → RuntimeError swallowed at debug level → **`POST /shutdown` and the parent watchdog silently no-op'd**; process never exited (source of zombie servers across sessions). Fix: set `_uvicorn_server.should_exit = True` (works from any thread; uvicorn lifespan runs `_run_shutdown()`), removed CTRL_C_EVENT fallback (hits whole console), fresh-loop `asyncio.run(_run_shutdown())` last resort.
  - `main.py`: `sys` used but not imported — port-in-use friendly message crashed with NameError.
  - `mcp_server/tools/__init__.py` `register_tools()`: TR registry was empty on cold start (`create_app` builds MCP server BEFORE `startup_verify` populates) → live `/mcp` server exposed only 25 of ~216 tools. Fix: populate-if-empty guard inside `register_tools` (single choke point for prod + tests).
  - `routes/generations.py` `/tts/engines`: one asset-less ONNX-only engine raised ValueError → whole endpoint 500 (marketplace/engine list broken on machines without all weights). Now degrades per-engine (debug log, listed uncached).
  - Assistant tool schemas: 6 tools defined twice (`studio_add_track/set_master_volume/import_session` in tools_generation.py, `voice_changer_*` in tools_audio_prim.py) with DIVERGED params vs canonical `tools_mcp_wired.py`; stale copies removed.
  - `routes/features.py`: dead legacy `/batch/jobs*` routes deleted (shadowed by `batch.py`, registered first alphabetically).
- **Test repairs:** shutdown e2e now drains stdout too (uvicorn access logs → stdout pipe filled and hung the child); STT backend/e2e tests use `asyncio.run` instead of order-dependent `get_event_loop().run_until_complete` (closed-loop pollution); audio-enhancer skip helper also checks model-weight cache; smoke tests updated to real contracts (`/tts/engines` shape, batch `func_name`+`id`+wrapped list, session clipless ⇒ `valid:false` warning) and base URL overridable via `TWENTYLABS_SMOKE_BASE_URL`; MCP registration uniqueness test rewritten against final FastMCP tool set (duplicate registration calls are by-design layering); `test_mcp_assistant_tools` schema-uniqueness now satisfied upstream.
- **Frontend/web:** stale nested `@types/react@18` under app/ + web/ shadowed the React 19 types the runtime actually uses (app typechecked v18 while running v19) — nests purged, tauri workspace `@types/react(-dom)` bumped ^18→^19 to match its React 19 runtime (landing stays Next14/React18, self-consistent); `StorePage.tsx` missing imports (`KeyIcon`, `Badge`) fixed after concurrent Codebuff commit landed mid-audit; `StarRating.tsx` a11y role + non-index keys; `StoreDetailModal.tsx` fused-statement line split + conditional `useMemo` moved above early return (Rules of Hooks); biome organize-imports applied.
- **web/ workspace:** added missing `.eslintrc.cjs` (eslint deps were declared but config absent — lint script was dead).
- **docs/ workspace:** `postinstall` (`fumadocs-mdx`) was broken repo-wide — `source.config.ts` imported `defineDocs` from nonexistent `fumadocs` package; corrected to `fumadocs-mdx/config`.
- **Tooling:** `bin/check.ps1` pytest invocation had literal `\n` sequences instead of line continuations (core-test step was broken).
- **Verification:** ruff lint+format clean (436 files); biome check clean (443 files); tsc clean; async-blocking PASS; pytest core 70/70; vitest 201/201; full backend suite green across partitions (973+312+325 passed, skips are missing-model guards); live smoke suite 12/13 pass +1 model-gated skip against restarted dev server on :17493; manual `/shutdown` verified clean exit (~1s, lifespan teardown logged).
- **Follow-up — root WAV pollution fixed (2026-08-21):** `audio-dsp==0.1.10` renders `arpeggio.wav` / `8bit_samples.wav` into CWD at *import time* (module-level demo code in `utils/arpeggio.py` + `synth/chip_tone.py`); `services/dsp_synth.py` imports the package on every server/test run. Fixed with a chdir-to-tempdir guard around the imports in `dsp_synth.py`; verified import from repo root leaves zero WAVs and synth still works (20 passed on dsp/synth/instrument tests).
- **Follow-up — ultra-deep audit P0/P1 fixes (2026-08-22):**
  - **P0 fixed+live-verified:** remote-mode bearer auth was a no-op — `"/"` in RemoteAuthMiddleware EXEMPT_PATHS + prefix matching exempted every path (`server.py`). Removed; live run: no-token→401, with-token→passes, /health exempt.
  - **P1 CSRF guard added:** new `utils/origin_guard.py` `OriginGuardMiddleware` (pure ASGI, registered outside CORS in `create_app`) rejects POST/PUT/DELETE/PATCH carrying a present-but-untrusted Origin header using the same allowlist as CORS. Non-browser clients (no Origin) unaffected. Live: foreign-Origin POST→403, no-Origin reaches route handler. Tests: `tests/test_origin_guard.py` (11 cases incl. exact-match-not-prefix).
  - **P1 zip-bomb bounds:** generation ZIP import in `services/export_import.py` now enforces member-count + declared-expansion limits BEFORE any member read, sharing module constants `MAX_ZIP_MEMBERS`/`MAX_ZIP_UNCOMPRESSED` with the profile importer (limits patchable for tests). Tests: `tests/test_export_import_zip_limits.py` (5 cases incl. end-to-end import into tmp storage).
  - Shutdown-e2e readiness timeout bumped 90→240s after measuring a 137 s cold start under concurrent agent load.

### Phase 16 - Verify-gate greening + BYOK audit & test isolation (2026-08-25, done)
- **Goal:** green the `just verify` pre-commit gate and harden the BYOK (API keys) layer after a security review; no new features.
- **Verify-gate:** `just verify-lint` 8/8; 72 targeted backend tests + 45 voice-chat tests pass; `bin/check.ps1` unicode box-chars fixed for pwsh 5.1; backend normalized to LF via `.gitattributes` (`backend/** text eol=lf`) so cross-OS CRLF churn can't re-break the gate.
- **BYOK audit fixes (5 findings):**
  - Divergent LLM BYOK paths → consolidated. VoiceChat now reads/writes Layer A (`model_providers` idle LLM domain) in `services/memory.py` (`get_voice_chat_settings` overlays Layer A; `save_voice_chat_settings` writes both layers, single source of truth). `routes/model_providers.py` stays the canonical backend; `routes/assistant.py` consumes `get_api_provider`/Layer A for cloud LLM dispatch.
  - Inactive domains (`music`, `vc`, `stt`) surfaced in UI: `app/src/features/settings/ApiKeysPage.tsx` lists them as INACTIVE and disables Add (existing backends are the only supported BYOK path).
  - Free-text domain param → validated `ProviderDomain(StrEnum)` in `routes/model_providers.py` (`domain` query/path now typed; invalid domain → 422).
  - Freesound still legitimately reuses the `sfx` domain (functional, kept).
  - Cloud LLM with no model selected → `routes/assistant.py` `event_stream` yields a clear, recoverable error instead of an opaque crash.
- **tool_dispatch (MCP) hardening:** profile tools renamed `profiles.*` → `21labs.profiles.*` namespace (`tool_dispatch/catalog.py` + `routes/profiles.py`) for consistent MCP tool naming; `backend/tests/test_tr_dispatch.py` gained an autouse `_isolate_global_tr` fixture that snapshots/restores the `TR._tools` singleton so dispatch tests can't pollute the global registry (verified worst-case ordering 26 pass; broader 66 pass).
- **Frontend test hardening:** `app/src/test/clip.test.ts` `afterEach` now also `vi.unstubAllGlobals()` (clip's `fetch`/`Audio` stubs no longer leak into sibling suites) and silences the expected-throw `console.error` noise; still 11/11 green.
- **Verification:** ruff clean; clip vitest 11/11; branch `checkpoint/gate-byok-wip`.

### Phase 17 — ADR Hardening + Cloud BYOK Restore (2026-08-26, done)
- **ADR backend hardening:** `backend/services/adr.py` `add_take` now auto-scores via `score_take_quality` (capped 10s, SF read) so `quality_score` + `auto-select` (quality 0.6 + timing 0.4) work without manual score; `calculate_alignment_offset` (numpy correlate), `score_take_quality` (RMS+speech+clipping), `compute_waveform` tested. `backend/tests/test_adr.py` (17 tests: service CRUD + scoring + alignment + waveform + route create/guide/takes/select/auto-select/score/align/waveform/audio + 404s) — 17/17 pass.
- **ADR frontend:** `app/src/features/workspace/adr/ADRView.tsx` (was `components/Workspace/ADRView.tsx`) — `WaveformBars` fixed to render `s*32px` heights (was constant), new `TakeWaveform` per-take query (`getADRTakeWaveform`), `autoSelectMut` (`POST /adr/auto-select`) with “Auto-Select” button per line, `alignMut` (fetch guide/take WAV → AudioContext decode 24k c10s → `POST /adr/align` → `setShiftMs`), guide-first gate (`hasGuide` disables Record/Align, amber banner, toast), unified errors to `showStudioErrorToast`, delete confirm, `Align` button + shift slider (-500…500). `app/src/lib/api/clientADR.ts` added `autoSelectADRTake`.
- **Cloud BYOK restore:** Tracked backend files (`transcription.py`, `generate.py`, `voice_convert.py`, `registry.py`, `configs/__init__.py`, `protocols.py`, `transcribe.py`, `subtitles.py`, `cloud_provider.py`) restored from stash after `just verify` reset; untracked `cloud_music_backend.py`/`cloud_vc_backend.py`/`cloud_stt_backend.py` fixed (`_decode_audio_bytes` double-decode removed, instances `cloud_music_backend`/`cloud_vc_backend` added); `backend/tests/test_cloud_stt_music_vc.py` recreated (14 tests: unit + route, app readiness patch, backend class patch for thread mocks) — 14/14 pass. Frontend cloud engines already present: `EngineModelSelector.tsx` (`cloud` in ENGINE_OPTIONS + desc), `VoiceConverterView.tsx` (`cloud` toggle), `types.ts` (`WhisperModelSize` includes `cloud`).
- **Verification:** `pytest backend/tests/test_adr.py` 17 passed, `pytest backend/tests/test_cloud_stt_music_vc.py` 14 passed, `ruff check` clean (fixed unused imports), `biome check` fixed formatting on ADRView/clientADR.
- **Impact:** ADR take quality badges + auto-select now meaningful; align staged via REST (no destructive timeline mutate); cloud STT/music/VC one-shot via BYOK provider.

### Phase 18 — Stale-test grind to green + drift fixes (2026-09-12, done)
- **Goal:** fix all 38 pre-existing backend test failures; every fix traced to a root cause, production bugs fixed rather than papered over.
- **P1 verification (no code change):** crash pipeline proven end-to-end — `fatal_handlers` + `CrashCaptureMiddleware` wired in `app.py`, `crash_reports` (scrubbed local JSONL + opt-in forward + last-actions + memory/VRAM/queue diagnostics), `supervisor.py` + Tauri `server.rs` restart monitor (5 restarts, health-gated); backend boots (`/health/live` 200, `/health/ready` true). Fixed 1 order-dependent test (`test_fatal_handlers` keyboard-interrupt asserted a process-global counter — now isolates).
- **Production bugs found by the failing tests (fixed):**
  - Manifest gate blocked remote-only engines (`routes/generate.py` music+sfx): gate now skips configs with empty `hf_repo_id` (cloud BYOK has nothing to download; its backend raises the actionable error).
  - `stt-cloud` missing from `get_all_model_configs()` (catalog listed it, `/models/status` didn't) — added `_get_cloud_stt_configs()`; added 5 missing reverse Argos pairs (`pt/ru/ar/hi/it→en`) that the catalog sold with no config.
  - `vocal_qa.py` swallowed the gate's HTTP 400 into 500 ("Transcription failed") — added `except HTTPException: raise`.
  - `21labs.generate_sfx` MCP tool lost in the GGUF-migration rewrite — restored with the manifest gate (matches `docs/knowledge/TOOL-REFERENCE.md`, which still documented it).
- **Dead code removed (Rule 1):** `reconcile_cached_backfill` no-op + TTL state, its `startup_defer` call, always-False `manifest_backfill_pending` (`health.py`, `status.py`, `types.ts`); tests rewritten to the no-self-heal contract (drift stays `downloaded=True entitled=False`, purchase gate intact).
- **Stale tests updated to deliberate refactors:** music-route gate stubs, `acestep-1-5`→`acestep-1-5-gguf` catalog id, styletts2 removal (ENGINE_MAP + rejected-engines), moss error message, SSRF-gate stubs (cloud/remote-catalog), launch-promo removal, 5→7 export presets (UI renders dynamically), demucs `extras`→`utilities`, entitlement-aware ranking, `or ""` no-default-engine, empty-split `[]`, f5 `load_model_async` removal, bounded voice-chat deque, yield-accurate WS mock, `aiosqlite` pinned in `backend/requirements.txt` for the buy-flow e2e.
- **Verification:** full backend suite 2345 passed / 0 failed (14 skipped, 12 deselected — all pre-existing); `ruff check` clean; `npm run typecheck` clean.
- **Impact:** `/models/status` ↔ catalog agree on every product; cloud engines report actionable errors; MCP SFX generation back; no dead backfill machinery.

### Phase 19 — Settings end-to-end: planner deferred-apply + serving controls (2026-09-12, done)
- **Audit:** mapped every user-facing setting to its backend effect. Working: max_tokens/thinking/system-prompt (per-request), kv_quant (deferred but disclosed), performance mode + keepalive (applied in-route), chunk/crossfade/normalize/autoplay/audio-tags/preload (consumers verified). Broken: `context_tokens` was a silent no-op when the planner was loaded (`load_model` early-return drops `ctx_override`). Missing: GPU layers (env-only), backend port (no in-app control), and the entire Tauri lifecycle bridge (frontend stubs — GPU restart buttons and keep-running toggle were placebo; Rust commands existed but nothing invoked them).
- **Slice 1 — honest deferred apply:** `GET /settings/assistant` now reports live planner state (`planner_loaded`, `loaded_n_ctx/size/kv/gpu`) + effective values; new `POST /settings/assistant/reload-planner` (stateless unload, next chat reloads); AssistantSettings UI shows a reload notice + one-click button and honest toasts. Tests: `backend/tests/test_assistant_settings_reload.py`.
- **Slice 2a — GPU layers:** `assistant_settings.gpu_layers` column + migration, `resolve_gpu_layers` (env wins, else DB, else CPU), load path + tracked instance attrs, UI control with env-override disclosure, staleness covers n_ctx/kv/gpu.
- **Slice 2b — port:** `GET/PUT /settings/server` (`app_settings.server_port`, 1024–65535, free-check with self exception); `main.py:resolve_server_port` (CLI > env > persisted > 17493) + `config.read_persisted_port` (stdlib, best-effort) + `backend_port.json` rendezvous file + `config.set_runtime_port`; Rust `current_port` state threaded through spawn/probes/URLs/monitors with optional `port` on start/restart commands; Tauri `lifecycle` bridge implemented (`invoke` + close handler + log/error subscriptions, mounted via `useServerLifecycle` in AppFrame); shared `useBackendRestart` hook (GpuPage adopted); GeneralPage port row with save-and-restart + dev hint. Tests: port round-trip/validation/resolve-order (12 backend), `tauriLifecycle.test.ts` (5 frontend).
- **Verification:** new tests green; related suites (assistant/gguf/harness/startup) 85 pass; `cargo check` clean (2 pre-existing warnings); `tsc` clean; `biome lint` clean; live boot on `--port 17601` serves + writes the rendezvous file.
- **Impact:** every displayed serving setting now works or honestly says when it applies; backend restarts from the UI are real; custom ports survive app restarts on all launchers.

### Phase 20 — Unified header + i18n leak eradication (2026-09-12, done)
- **Layout:** new `AppHeader` (brand → Home, utility actions, macOS traffic-light clearance); sidebar brand row + top padding removed so header + sidebar form one continuous frame; shared `useIsMacOS` hook extracted (router deduplicated). Verified: `tsc` + `biome lint` clean (visual check needs a running app).
- **i18n:** audited all `t()` calls — 47 true raw-key leaks (entire podcast namespace rendered as `podcast.producer.*`) + 159 fallback-only keys missing from en. Backfilled 200+ en entries (script-extracted inline defaults, hand-authored podcast/labels, plural-aware: existing `_one`/`_other` left authoritative, runtime-computed defaults left untouched). Sidebar "See N more tabs" converted to pluralized key. Permanent guard: `src/test/i18nKeys.test.ts` fails on any unresolvable key (proven sensitive pre-fix).
- **Impact:** no raw translation keys in any language (others fall back to en); future leaks fail the suite instead of reaching users.

### Phase 21 — Marketplace listing content rules (2026-09-12, done)
- **Clean headlines:** 16 product names carried quant/porting tokens (`Q8`, `GGUF`, `ONNX`, `QAD-Q4_0`…) — all renamed to selling-focused headlines with human differentiators where variants collide (`NeuTTS-2E` vs `NeuTTS-2E (high fidelity)`, `Parakeet v3` vs `Parakeet v3 (fast)`, `Pocket-TTS` vs `Pocket-TTS (PyTorch)`); ids stable, nothing keys on names (tests assert ids). `engines.ts` label synced.
- **Technical details section:** `quant` + `model_size` plumbed registry → `/models/status` → storefront (`ModelStatus` both sides); detail modal gains a collapsed Technical details grid (engine, variant, quantization, repo, model ID) and the raw engine-code badge moved out of the badge row. Fixed a caught-along-the-way gap: `model_size` never reached the response either.
- **Capability + quality honesty:** category chips use `CATEGORY_LABELS` ("Voice Engines", …) instead of raw codes (card, modal header, badge row); star ratings carry a "curated score for its category" tooltip (scores are curated per-category until persisted user reviews exist — reviews are still in-memory).
- **Pitch coverage:** 3 RVC listings had no pitch text at all — notes added.
- **Tests:** `test_marketplace_content.py` (name-token ban, pitch presence, quant plumbing, variant distinctness), `CATEGORY_LABELS` coverage in `storeUtils.test.ts`; full store suites 79 pass; catalog/status/gate suites green.
- **Impact:** headlines sell, trivia is one tap away in Technical details, and catalog edits can't regress the contract without failing tests.

### Phase 22 — Review persistence + score grounding (2026-09-12, done)
- **Problem:** reviews lived in a process-memory dict (lost on restart), so the storefront's `avg_rating`/`review_count` display could never show local feedback and curated `quality_score` stood alone.
- **Fix:** `product_reviews` table (`database/marketplace.py`, unique per product+device) with upsert-on-repost semantics (no ballot-stuffing); `get/add/rating-summary` service layer over short-lived sessions; `avg_rating`/`review_count` annotated response-only onto both catalog endpoints (signature-safe, one GROUP BY query); POST validates rating range + 2000-char comment cap. No frontend change — `ProductReviews` already consumed these fields and refetches the catalog after posting.
- **Tests:** `test_marketplace_reviews.py` (round-trip, upsert, catalog grounding, validation); related suites green; ruff clean.
- **Known remainder:** wishlist is still in-memory (`_wishlists`, same file) — same treatment when it earns it.
- **Impact:** user feedback now persists across restarts and grounds the quality display next to the curated score.

### Phase 23 — Translate tab: capability gap closed (2026-09-12, done)
- **Gap:** translation had a backend API (`/translate`), API clients, 20 Store packs, and full i18n strings — but zero UI calling it (§6 "invisible in the UI").
- **Fix:** new `/translate` tab (`TranslateView`: source/target pickers from `/translate/languages`, auto-detect, swap, copy, char count, error box with Store link for offline packs); wired into router tree, sidebar nav (workspace group), `ALL_TAB_PATHS`, and workspace tab labels; 7 new `translate.*`/`sidebar.translate` en keys (lossless JSON edit verified).
- **Found along the way:** the service is Google/cloud-backed via deep-translator despite the offline-first posture and the Argos packs — the UI surfaces failures honestly, and `68-translation-service.md` was corrected (it claimed local-LLM). Argos-offline upgrade tracked as follow-up.
- **Tests:** `TranslateView.test.tsx` (4 pass: load, translate+detected, swap-disabled, error hint); i18n guard still green; `tsc` clean.
- **Impact:** every model capability family now has a reachable interface; translation is one click away in the sidebar.

### Phase 24 — Dependency prune + vendor-core entry-payload fix (2026-10-10, done)
- **Goal:** remove unused workspace deps and fix the boot payload — `vendor-dnd` (150+ KB) was in the entry preloads even though only 4 route chunks use it.
- **Root cause:** rolldown 1.2.7 (vite 8.2.2) `manualChunks` places a module shared between manual chunks into the alphabetically-first manual chunk that imports it, overriding its own returned chunk name. React sorted into `vendor-dnd` (react lives in `vendor-react`'s rules, which sorts after `vendor-dnd`/`vendor-forms`), so the dnd chunk carried react and index.html preloaded all of it. Fix: rename the react chunk to `vendor-core` (sorts before d/f/m/r/s/t/u/w) in `app/vite.config.ts` + `tauri/vite.config.ts`; GOTCHA comments added — never rename `vendor-core` to anything that sorts after `vendor-dnd`.
- **Deps removed (81 packages):** root dropped react/react-dom/zod/pinyin-pro/@testing-library/\*/@types/\*/@neon/env/@vitejs/plugin-react-swc; app dropped @radix-ui/react-avatar+separator+toast, webaudio-peaks, react-sound-visualizer (all verified unused; custom toast kept), moved @types/react-syntax-highlighter to devDeps, added @testing-library/dom + @types/node; tauri slimmed to runtime-only mirrors (dropped ~40 mirrored frontend deps + nested vite 6 / plugin-react 4 — tauri now builds on root vite 8 + plugin-react 6, byte-identical vendor chunks to app). docs/landing untouched (@tailwindcss/postcss has no peers to break).
- **Result:** entry preloads 761.0 → 607.9 KB raw (−153.1 KB, −20%); `vendor-dnd` loads only via AudioStudio/ChainEditor/StoriesTab/StoryTrackEditor; dist total unchanged (bytes redistributed, not duplicated).
- **Guards:** `tsc` clean; scoped `biome lint` at baseline (app 15 pre-existing warnings, tauri 5, edited files clean — full-repo `biome check .` is 8999 pre-existing errors, never the gate); app build 16.7s, tauri build 12.6s; vitest 59 files / 566 pass; smoke2 boot 2.35s, 8 routes, 0 errors; check-encoding 1731 files.

## Critical Flows

### TTS Generation Flow
```
Frontend (useGenerationForm)
  → GenerationRequest (with emotion field)
    → POST /generations
      → run_generation()
        → load_engine_model()
        → generateChunked(tts_model, text, voice_prompt)
        → normalize_audio()
        → apply_emotion_dsp() [if emotion set]
        → _save_generate()
        → notify_generation_status()
```

### Voice-Changer Flow
```
Settings toggle (voice_changer_enabled)
  → auto-spawn on startup (backend/app.py)
    → python -m backend.voice_changer --port 17494
      → FastAPI WS /voice-changer/ws
        → mic → VAD → denoise → transcribe → TTS → enhance → out
```

### GGUF Planner LLM Flow (Phase 8)
```
frontend assistant/chat → routes/assistant_stream.py (stream_local, model_id "2B-Q4_K_M")
  → backend.generate(chat_messages, ctx_override)
    → GGUFServerLLMBackend.load_model() [first call]
      → find_llama_server(): TWENTYLABS_LLAMA_SERVER → data/models/llama-server.exe → PATH
      → _resolve_gguf_filename(): list_repo_files + quant tag (excl. mmproj/mtp/imatrix/embedding/encoder)
      → hf_hub_download (force_offline_if_cached) → spawn server --host 127.0.0.1 --port <free> -c <n_ctx> -ngl <TWENTYLABS_LLAMA_GPU_LAYERS>
      → poll GET /health (60s deadline)
    → POST /v1/chat/completions (top_p 0.9/1.0, max_tokens clamped to n_ctx)
  → tool-call JSON loop (MAX_TOOL_ITERATIONS=10) via assistant_tools middleware
  → lifecycle: gguf_llm is ALWAYS_ON (never idle-unloaded)
```

### ONNX Provider Resolution Flow
```
bin/setup-onnx.ps1
  → detect GPU (WMI)
  → pip install onnxruntime-directml / onnxruntime
  → record_onnx_provider("DmlExecutionProvider")
    → data/runtime/onnx_provider.json

resolve_providers() [at ONNX backend init]
  → read recorded choice
  → return ["DmlExecutionProvider", "CPUExecutionProvider"]
```

### Audit A3/C — Boot readiness and error feedback (2026-09-25)
- `app/src/router.tsx` now waits for `/health/ready` before mounting routes, adopts the Rust-reported backend URL, reports elapsed startup time, and offers a local backend restart after `startup_failed`.
- `app/src/lib/hooks/useBootReadiness.ts` owns the resilient 1.5-second readiness poll and 5-second request timeout.
- `app/src/test/bootReadiness.test.ts` covers healthy startup, transient connection failures, and startup failure propagation.
- `app/src/features/assistant/AssistantPanel.tsx` reports assistant model-list failures through `showStudioErrorToast`.
- `backend/main.py` logs persisted-port and port-handoff failures at debug level instead of silently discarding them.
- **Impact**: cold starts remain visible and recoverable; frontend model-loading failures are user-visible; backend diagnostics remain debug-friendly without changing fallback behavior.

### Audit D — Runtime configuration drift (2026-09-25)
- `backend/server.py` now honors `OTOYIN_HOST`/`OTOYIN_PORT` before legacy `TWENTYLABS_*` names, matching `backend/main.py` and the supervisor.
- `app/src/lib/api/clientCore.ts` reports the actual requested backend address instead of suggesting the default `127.0.0.1:17493` when a custom/fallback port is active.
- Existing defaults in `serverStore.ts`, Tauri `server.rs`, and the voice-changer entry points remain protocol defaults; runtime handoff and environment overrides are the source of truth after startup.
- **Impact**: frozen server, CLI, and frontend error messages no longer disagree about the active host/port.

### Audit E — Orphaned/half-done UI (2026-09-25)
- `scripts/check-wiring.py` reports 79 registered backend routers, 476 OpenAPI paths, and zero orphaned frontend components.
- `MonitorRecorder.tsx` is now wired into `TransportControls.tsx` and receives `useRecordingManager`'s completion callback, so monitor captures use the existing selected-track fallback, waveform decode, undo, and toast path.
- `SourceColumn.tsx` + `InfoColumn.tsx` are now wired via the new `app/src/features/voices/VoiceFormDialog.tsx`, which drives both columns with the existing `useProfileForm` controller (drafts, recording, transcribe, submit) and opens from `VoicesTab` through the "Full form" button (`uiStore.profileDialogOpen`).
- The wiring report also lists 100 stranded endpoints and 107 unwired advisory components from the ongoing frontend rebuild; these are not treated as automatic deletions.
- **Impact**: monitor-to-track capture and the full voice form are no longer orphaned; QuickCloneDialog remains the fast creation path.

### Live Paddle catalog setup (2026-09-25)
- Live account was empty; created all 36 paid catalog products: 33 one-time USD prices plus 3 cloud tiers as monthly subscriptions (`llm-cloud-starter/pro/max`).
- One-time products use the `saas` tax category (`digital-goods` is rejected on this account); probe product created and archived.
- Webhook notification destination created (`ntfset_01m3gz4gz46cte46cq6sk7z4d6`) → `https://marketplace-mauve-five.vercel.app/v1/webhook` with the four required events.
- Fresh Ed25519 license keypair generated (private → Vercel `MARKETPLACE_LICENSE_PRIVATE_KEY`; public → release builds + `TWENTYLABS_ENV=production`).
- Price map (`MARKETPLACE_PADDLE_PRICE_MAP`) staged at `marketplace/live-price-map.json`; still to paste into Vercel along with the webhook secret (copied from the Paddle dashboard).
- **Impact**: catalog/license plumbing is ready pending owner-side Vercel env + dashboard secret + live sale test.

### Audit F — Performance hotspots (2026-09-25)
- Codebase-memory complexity scan identifies the largest measured candidates as `backend/utils/hf_offline_patch.force_offline_if_cached`, `backend/routes/assistant_stream.stream_local`, `backend/app._run_startup`, and `app/src/lib/hooks/useGenerationProgress.ts`.
- `AudioStudio` already throttles waveform state to 10Hz and uses refs for per-frame values; no regression was introduced there.
- Two disposable direct-server launches reached `/health/ready` in 9,024 ms and 8,065 ms; both returned HTTP 200 without rebuilding or packaging.
- No performance refactor was applied without a representative generation workload; the repository has no `bin/bench.ps1`, and rebuilding/packaging remains out of scope.
- **Next measurement**: profile SSE generation progress and AudioStudio playback under a representative generation before changing hot paths.

### Audit G — Backend crash recovery (2026-09-25)
- The local crash log showed repeated FastMCP failures (`StreamableHTTPSessionManager task group was not initialized`) on `/mcp/`.
- `backend/app.py` now owns an `AsyncExitStack` for the parent lifespan; `backend/utils/startup_defer.py` enters the FastMCP child lifespan before mounting `/mcp`.
- The lazy MCP wrapper is pure ASGI instead of `BaseHTTPMiddleware`, preventing AnyIO cancel-scope failures when the MCP endpoint returns a streaming response.
- `/health/ready` now bypasses the readiness middleware so the frontend receives the actual startup status instead of a generic 503.
- Regression test: `backend/tests/test_mcp_http_lifespan.py`; live smoke: initialize request returned HTTP 200 and logged the session manager started; the pure-ASGI wrapper produced zero traceback lines.
- **Impact**: MCP HTTP no longer crashes or 500s on its first request, and backend startup failures remain observable to the client.

### Audit H — Agent discovery and skills bundle (2026-09-25)
- `.mcp.json` now uses the standard `mcpServers` key and launches `node ./bin/otoyin-mcp.mjs` instead of the nonexistent `21-labs-mcp` command.
- `bin/otoyin-mcp.mjs` resolves the target-suffixed shim in `tauri/src-tauri/binaries/`, falling back to `otoyin-mcp` on `PATH`.
- `tauri/src-tauri/tauri.conf.json` now bundles `binaries/otoyin-mcp` as an external sidecar alongside the server.
- Repository skills bundle: `C:\Users\ehis\AppData\Local\Temp\opencode\otoyin-skills-bundle-2026-09-25.zip` — 86 skills, 117 files.
- **Impact**: coding agents reading the project MCP config can start the built shim without a manual PATH edit; the skills archive is available for review before the remake.

### Audit I — Skills audit and cleanup (2026-09-25)
- Corrected stale engine registries, MCP/REST signatures, platform-export targets, STT model keys, recipe/music behavior, and relative skill links.
- Fixed the MCP conversation auto-duck/level wrapper to send the bare array expected by the route, with a regression test.
- **Impact**: generation/production skills now match the current backend instead of removed engines or nonexistent endpoints.

### Audit J — Markdown TODO sweep (2026-09-25)
- `docs/reports/XXX_TODO_AUDIT.md` re-verified via `check_placeholders` (clean); `Last verified` bumped.
- `docs/WHATS_NEXT.md` and `PLAN.md` archived in place (all items done; Phase 2 re-verified in tree).
- `LOOP_STATUS.md` row 20 refreshed: 79 routers, 100 stranded, 1 orphaned (`SourceColumn.tsx`, intentional).
- `PADDLE_TESTING.md` §1 verified: marketplace suite 26/26 pass.
- Remaining open items are owner-gated (Paddle account/payout/prices/webhook/keypair/sale runs; Apple/Windows certs; DNS/repo; signed updater proof; human translations) or need full loop-row refreshes.
- **Impact**: no code changes; docs now agree with the tree.

### Audit K — Frozen bundle / packaged-app parity (2026-10-03)

Found by smoke-testing the built `otoyin-server` against the dev server rather
than trusting the dev suite. Four defects, all dev-invisible:

- **`numba`/`llvmlite` must stay in the bundle.** Excluding them (to save ~115 MB)
  breaks every audio route: `librosa/core/audio.py` does a module-level
  `from numba import guvectorize, jit, stencil`, so `librosa.load()` raises
  `ModuleNotFoundError` and `POST /audio/spectrogram` 500s. Reverted and pinned
  by `test_librosa_load_requires_numba_so_bundle_must_keep_it`.
- **MCP tool sources must be bundled.** `tool_registry_populate.populate()` does
  not import its metadata — it `ast.parse`/`exec`s
  `backend/routes/assistant_tools/*.py` and regex-scans
  `backend/mcp_server/tools/*.py`. PyInstaller ships bytecode, so `/mcp` never
  mounted (404) and the whole MCP surface was dead in the installer. Both
  directories are now added via `--add-data`; the packaged app exposes all
  **203** tools, exactly matching dev.
- **The MCP shim must not exclude `typing`.** `build_shim()` excluded it as an
  "obsolete backport"; no such distribution is installed and on Python 3.12
  `typing` is stdlib that `functools` imports. The shim died on every launch with
  `ModuleNotFoundError: No module named 'typing'`.
- **`populate()` was not idempotent.** The merge branch rebuilt each
  `ToolDef` without carrying `client_command`, so a second call reset it and
  `verify_assistant_vs_tr()` reported 6 phantom errors. Passed in isolation,
  failed only in the full suite.

- **Impact**: `backend/build_binary.py` (data files, shim excludes, guard
  comment), `backend/tool_registry_populate.py` (idempotent merge). Installer
  verified end-to-end after a real install: one server copy, MCP 203 tools,
  bundled ffmpeg 9.0.2, numba/llvmlite/torch present.

### Audit L — Event-loop stalls on the request path (2026-10-03)

- **`GET /health` froze the loop for >10 s.** It is `async def` but ran every
  probe inline; cold, `_get_gpu_snapshot()` alone cost ~5.2 s (torch/CUDA init)
  and `tts.get_tts_model()` ~0.65 s. First call after startup timed out, which
  made `test_graceful_shutdown_unloads_models_and_exits_cleanly` flaky (2 of 3
  runs, each on a different test). Split into a sync `_build_health_response()`
  awaited via `asyncio.to_thread`, and warmed once during startup
  (`_warm_health_snapshot`, before `_signal_ready()`). First `/health` is now
  ~35 ms instead of ~6.2 s, and the suite runs ~30% faster.
- **`silence_removal_audio` had a per-sample Python loop.** `processing.py`
  walked 1.44 M samples one at a time inside `async def` (~0.83 s stall). Fixed
  for duck/compress but missed here. Replaced with a numpy run-length encode;
  differential-tested against the original over 528 cases (random masks plus
  empty/single/all-silent/trailing/alternating edge cases) — byte-identical.

- **Impact**: `backend/routes/health.py`, `backend/app.py`,
  `backend/routes/audio_pipeline/processing.py`. Any future blocking probe added
  to an `async def` route should follow the `asyncio.to_thread` pattern already
  used throughout `utils/async_audio.py`.

### Audit M — Orphaned backend, port ownership, web mode (2026-10-03)

Four defects found by driving the built app, not the dev server.

**Orphaned backend on close (the "ghost server").** Closing the window left
`otoyin-server.exe` alive and holding port 17493, so the next launch adopted a
stale backend or moved to a different port. Three compounding causes:
- The kill was gated on `window.__TWENTYLABSServerStartedByApp` — declared in
  `global.d.ts`, never assigned anywhere, therefore always `false`.
- Two handlers raced on the same close event: Rust `on_window_event` (which
  asked the renderer for permission over `window-close-requested`) and a JS
  `win.onCloseRequested`, each calling `preventDefault`.
- `child.kill()` and `child.wait()` errors were swallowed with `let _ =`, so a
  failed kill looked identical to a successful one.

Fixed by making Rust the sole owner of close: it stops the backend
unconditionally, *before* destroying the window, and kills the process **tree**
(`taskkill /T /F` on Windows, a process group on Unix) because killing only the
direct child can leave grandchildren holding the port. The renderer round-trip
and the dead flag are gone.

**Port ownership instead of trial and error.** The port alone cannot say who owns
the backend. `backend_owner.json` (pid + port) now lives beside the port file,
and `plan_bind` distinguishes four cases: free / stale lock (reclaim) / our own
live backend (adopt, spawn nothing) / foreign occupant (**fail loudly naming the
port**). `find_free_port` and every silent "walk to the next port" fallback were
deleted — they are what desynchronised the frontend from the backend.
`spawn_bundled_silent` (the auto-restart path) previously kept a private copy of
that fallback, so a crash could still relocate the backend; both spawn paths now
share `plan_bind`.

**CSP blocked the backend.** `SERVER_HOST` is `127.0.0.1`, but `connect-src`
allowed only `http://localhost:*`. CSP matches on host string, so every fetch to
the backend was blocked and the boot gate (which polls forever by design) never
cleared — the blank splash. `connect-src` now also allows `http://127.0.0.1:*`
and `http://[::1]:*`.

**Web mode was unusable.** `tauri/src/main.tsx` hardcoded `tauriPlatform` even
when served by `vite dev`, so a plain browser threw
`Cannot read properties of undefined (reading 'transformCallback')` on every
mount. The entrypoint now picks `webPlatform` when `window.__TAURI_INTERNALS__`
is absent; that platform already existed and was simply never selected.

**Also removed:** the "keep server running when app closes" setting, end to end
(Settings row, store field, `PlatformLifecycle` member, both implementations,
the Rust `keep_running` flag + `set_keep_server_running` command, and the
`settings.general.keepServerRunning` block in all 9 locales). Closing now always
stops the backend, so the switch could not change behaviour and would have been a
control that silently did nothing.

- **Impact**: `tauri/src-tauri/src/server.rs` (owner lock, `plan_bind`, tree
  kill, `spawn_bundled_silent`), `tauri/src-tauri/src/lib.rs` (single close
  owner), `tauri/src-tauri/tauri.conf.json` (CSP),
  `tauri/src/main.tsx` + `app/src/platform/*` (runtime platform selection),
  `app/src/features/settings/GeneralPage.tsx`, `app/src/stores/serverStore.ts`,
  9 locale files.
- **Guards**: `backend/tests/test_packaged_runtime_guards.py` (6 tests) and 7
  `server.rs` unit tests. Each was verified to fail when its fix is reverted.
- **Not yet verified**: the ghost fix itself needs one desktop close/relaunch
  cycle, which cannot be exercised in a browser (web mode spawns no sidecar).

### Frontend migration — `components/` → `features/` + `layouts/` (2026-10-09, done)

Moved the 69 app-live files out of `app/src/components/` (nothing deleted except
the 2 confirmed-dead files `layouts/AppFrame.tsx` / `layouts/TitleBar.tsx` that
blocked the target dir):

- App chrome → `app/src/layouts/`: `AppFrame/` (4), `Sidebar/`, `Banner/`,
  `ErrorBoundary/`, `Notifications/`, `AudioPlayer/`, `TitleBarDragRegion.tsx`
- Feature code → `app/src/features/`: `Assistant/`→`assistant/` (14),
  `VoiceChat/`→`voiceChat/`, `StoriesTab/`→`stories/editor/` (24, subdir dodges
  the `timeline.ts` collision), `VoiceProfiles/`→`voices/` (7),
  `Help/`→`help/` (`HelpCenter.tsx` renamed `HelpCenterOverlay.tsx` — distinct
  from the pre-existing `features/help/HelpCenter.tsx` panel),
  `Recording/`→`capture/`, `RecommendedModelsBanner/`→`store/`,
  `WaveformVisualizer/`→`audioStudio/`
- `components/` keeps: `ui/` (25 shared primitives, dedupe vs `src/ui` deferred),
  33 dead legacy files, 7 test-only files, and the `index.ts` barrel (updated,
  kept as a compat shim)
- Import specs rewritten repo-wide (static + dynamic `import()`), including
  left-behind files whose relative targets moved; 54 doc path refs across 27
  living docs updated in the same change. Follow-up judgement sweep 2026-10-09:
  remaining knowledge-doc dead paths rewritten to live equivalents (see
  `AGENT_FEEDBACK.md` doc-drift bullet for the full map); 2 survivors intentional
  (dated change-log entries).

- **Impact**: `router.tsx` (lazy `Sidebar`), `layouts/AppFrame/*` (6 lazy
  children), `components/index.ts` barrel consumers, knowledge docs listing
  moved paths, the codebase flow graph (regenerated after the move)
- **Guards**: `npx tsc --noEmit` clean; `npx vitest run` (from `app/`) 63/607
  pass; `npx vite build` 10.6s; `node smoke2.cjs` 8 routes 0 errors;
  `scripts/check-encoding.py` 1731 files clean

### Audio-studio visual bugs: stem-badge alpha + `--accent` stuck rose (2026-10-09, done)

Two user-visible bugs, both now fixed:

1. **Stem badge invisible.** `TrackVisuals.tsx` built the badge background as
   `` `${track.color}22` `` — but `track.color` is a full `hsl(...)` string, so the
   `22` alpha suffix produced an invalid CSS color and the badge rendered
   transparent. Now uses `color-mix(in srgb, ${track.color} 13%, transparent)`
   (0x22 ≈ 13%).
2. **`--accent` never followed the theme.** `styles/tokens.css` declared
   `--accent: 348 68% 58%` as a hard-coded rose, so every consumer of the
   `--accent` namespace (track palette, EQ curve stroke, WaveSurfer progress,
   `--focus-ring`) stayed brand-rose even under named themes. Now
   `--accent: var(--theme-accent, 348 68% 58%)` — themed when
   `applyThemeAccent` sets the inline `--theme-accent`, falling back to brand
   rose for plain themes. (Chrome probe confirmed `:root { --theme-accent: unset }`
   + `var(--theme-accent, <fallback>)` resolves to the fallback, not to `unset`.)
   - `WaveformCanvas.tsx` and `EqResponseCanvas` gained a tiny
     `resolveCanvasColor`-style helper because canvas `fillStyle` does not
     resolve CSS custom properties (silently paints black); both also now
     subscribe to `useUIStore(s => s.theme)` so they re-draw on a live theme
     swap. Marked with `biome-ignore useExhaustiveDependencies` (intentional
     extra dep) so `check.ps1 -Fix` cannot silently strip it.
3. Also swept `biome format app/src --write` (46 files, whitespace-only) —
   the format gate had been failing on ~37 pre-existing (HEAD) files.

- **Impact**: `app/src/features/audioStudio/{TrackVisuals,WaveformCanvas,PluginChainPanel}.tsx`,
  `app/src/styles/tokens.css` (`--accent` decl). Palette strings and
  `AudioPlayer`/`InlinePlayer` `getCSSVar("--accent")` callers needed no change —
  they inherit the theme automatically once `--accent` is wired to
  `--theme-accent`.
- **Guards**: `npx tsc --noEmit` clean; `npx vitest run` 63/607 pass;
  `npx vite build` 8.1s; `node smoke2.cjs` 8 routes 0 errors;
  `scripts/check-encoding.py` 1731 clean; `npx biome lint` 15 warnings (baseline,
  none in touched files) + `npx biome format` clean; browser probe
  `check_accent2.cjs` 6/6 (default fallback + 4 themes + canvas contract) and
  prior `check_accent.cjs` 7/7 still green.

### Doc archive + orphan dead-code deletion (2026-10-09, done)

**Archive.** Completed docs moved out of the living tree into `docs/archive/`:

- `docs/plan/` (7 plans), `docs/reports/` (22 reports + `loop-logs/` + `README.md`
  + `LOOP_STATUS.md` + `XXX_TODO_AUDIT.md`), `worksheets/` (1),
  `AUDIT_REPORT.md`, `docs/WHATS_NEXT.md`, root `PLAN.md` (header said
  "ARCHIVED 2026-09-25: Phase 2 verified done").
- Living tree keeps: `docs/README.md`, `PROJECT_STATUS.md`, `OWNER_BLOCKERS.md`,
  `PADDLE_LAUNCH_CHECKLIST.md`, `PRICE_MANIFEST.md`, `PRIVACY_POLICY.md`,
  `knowledge/*`, plus the other `docs/*.md` still referenced
  (`ASSISTANT_ARCHITECTURE`, `MARKETPLACE_PLAN`, `AUDIO_PRODUCTION_GUIDE`,
  `FEATURES`, `DEPLOYMENT_TEST_PLAN`, `ARCHITECTURE`, `MODEL_CATALOG`,
  `LANDING_PAGE_PLAN`).
- `docs/README.md` active/archived tables updated; `scripts/check-report-headers.py`
  retargeted `docs/reports` → `docs/archive/reports` and now passes (22 files OK);
  `2026-10-02-release-audit.md` got the missing Date/Status header. Living-doc
  refs to archived paths rewritten (`02-waveform-editor`, `14-voice-profiles`,
  `28-voice-clone`, `47-assistant-settings`, `52-cross-tab-clip-linkage`,
  `80-powershell-redirect-corruption`, `81-waveform-playlist-adapter`,
  `87-voice-design-offerings`, `ABOUT-VOICES`, `01-voice-studio` ProfileList).

**Deletion.** Transitive-orphan audit (zero non-test importers, or importers that
themselves have zero non-test importers) → deleted 25 roots + their private deps:

- Workspace twins (`components/Workspace/{TimelineView,WorkspaceLanding,WorkspaceLayout}.tsx`
  + `Import/ImportModal.tsx`, `Studio/StudioVisualizer.tsx`, `TapeScrubber/`) —
  superseded by `features/workspace/*`
- StoriesTab leftovers (`components/StoriesTab/{ClipItem,Playhead,TimelineRuler,TrackRow,useEditorDrag,clipStyle,ClipWaveform}` + 2 tests) — superseded by `features/stories/editor/*`
- VoiceProfiles leftovers (`components/VoiceProfiles/` 18 files incl. `ProfileList`,
  `QuickCloneDialog`, `VoiceDesignPanel`, tests) — superseded by `features/voices/*`
- Generation panel (`AudioEditorPanel.tsx`, `VoiceCleanABToggle.tsx` + test,
  `WaveformABDiff.tsx`) — unwired; live story editing is `features/stories/editor/StoryTrackEditor`
- Orphan `ui/` twins (`EmptyState`, `ScreenHeader`, `toggle`, `badge`, `circle-button`,
  `skeleton`, `tabs`) — live twins are `@/ui/states` + radix primitives
- `components/index.ts` barrel (zero consumers after the migration; nothing does
  `from "@/components"`)
- `features/generate/VoicePicker.tsx`, `features/audioStudio/useStudioMidi.ts`,
  `features/instruments/instrumentRender.ts` — dead after the PromptBar /
  MidiPianoRoll rewrite (the `instrumentRender` MIDI→waveform port is no longer
  the playback path)

**Impact**: `router.tsx` unchanged (already lazy-loads the features tree);
`features/workspace/{TimelineView,WorkspaceLanding,WorkspaceLayout}.tsx` and
`features/stories/editor/*` are the only Timeline/workspace surfaces left.
**Guards**: `npx tsc --noEmit` clean; `npx vitest run` (from `app/`) 59 files /
566 tests pass (the 4-file / 41-test drop is exactly the deleted orphan tests:
`VoiceCleanABToggle.test`, `StoriesTab/waveformPlaylist.test`,
`StoriesTab/WaveformPlaylistStage.test`, `VoiceProfiles/QuickCloneDialog.test`);
`npx vite build` 9.3s; `npx biome lint` clean; `scripts/check-encoding.py`
1731 files clean; `scripts/check-report-headers.py` 22 files OK.

### Production audit fixes + Store test mode + test-copy build (2026-10-14, done)

- **Store test mode** (`backend/services/licensing.py::store_test_mode`): frozen
  builds honor ONLY the bundled `backend/data/store_test_mode.flag`;
  `bin/build-test.ps1` writes it, `build_binary.py --add-data`s it, and the
  script's `finally` strips it. Source runs use `TWENTYLABS_STORE_TEST_MODE`.
  `active_entitlements(db)` adds `models:*` + per-product `models:<id>` ids.
  Test identity lives in `tauri/src-tauri/tauri.test.conf.json` (productName
  "Otoyin Studio Test", `com.otoyin.app.test`, updater off, `targets: ["nsis"]`,
  `createUpdaterArtifacts: false` — the base `true` would demand the signing key).
- **Audit fixes**: 30 findings across frontend/Tauri/backend, all high + surgical
  medium/low fixed — `docs/knowledge/90-audit-fixes-2026-10.md`. Deferrals in
  `TODO_REMAINING.md`.
- **DeepFilterNet bundling** (`build_binary.py` + `services/deepfilter_onnx.py`):
  the weights were declared bundled by `scripts/download_required_models.py` but
  never staged, and the service only looked in the HF cache
  (`local_files_only=True`) — denoise was dead in every installer. Now
  `<bundle>/deepfilter/deepfilter.onnx` resolves first when frozen, HF cache
  second (same idiom as `yamnet_onnx_backend._resolve_files`). Demucs (303 MB)
  and LavaSR stay runtime-resolved by design.
- **Test-copy artifact**: `tauri/src-tauri/target/release/bundle/nsis/Otoyin Studio
  Test_0.1.0_x64-setup.exe` (372.7 MB, NSIS-only, no updater artifacts) — built
  2026-10-14. Side effect to remember: `tauri/src-tauri/binaries/otoyin-server`
  now holds the TEST backend; re-stage before a production build.

**Guards**: `cargo check` clean; `tsc --noEmit` clean; ruff clean; biome lint +
format clean; backend `pytest` 2495 passed (2 exonerated); `vitest` 607/607;
`test_audio_enhancer` + `test_model_gate` + `test_files_and_health_features`
68 passed with DeepFilterNet weights present (those tests previously skipped).

### App-folder model storage + staged startup + window controls (2026-10-14, done)

- **`data/models/` is the only source of truth for model weights.** New
  `backend/services/model_files.py` owns every "download then read" seam:
  install helpers copy into `data/models/<slug>/` and delete the HF cache
  entry (symlink *and* blob), resolvers read the app folder only. Both
  `deepfilter_onnx` / `stem_separation_onnx` and every TTS/STT/VC/music
  backend (`kokoro`, `orpheus`, `gguf`, `neutts`, `parler`, `zonos`,
  `voxcpm2`, `bark`, `heartmula`, `fish_speech_s2`, `qwen3_tts`,
  `moonshine`, `sa3_sfx`, `minimax`, `stable_audio`, `acestep`,
  `moss_tts_nano`, `openvoice`, `pocket`, `rvc`, `yamnet`, `kitten`,
  `whisper*`) go through it, as do `is_model_downloaded`, the captures
  readiness flags, `download_required_models.py` and `build_binary.py`
  staging. Fixed en route: `force_offline_if_cached=True` was being passed
  to `hf_hub_download` as a parameter (it is not one) in ~10 backends, so
  every one of those load paths raised TypeError.
- **Library-managed loaders are documented, not force-converted**: NeuTTS,
  Kokoro-torch, PocketTTS, KittenTTS receive a repo id and resolve
  internally; their `_is_model_cached()` checks the app folder so the
  Models tab stays truthful, and each call site carries a comment. Tracked
  in `TODO_REMAINING.md`.
- **Staged startup** (`backend/app.py`): readiness after DB + queue + worker
  (core, instant); health warm-up (torch import) at +2 s in a thread;
  stale-state cleanup at +4 s. Voice-changer no longer spawns at boot -
  `routes/voice_chat.py` triggers `ensure_vc_spawned()` on first connect.
- **Frontend no longer blocks on the boot handshake**: `router.tsx` renders
  the shell immediately with a one-line status line instead of a blank pane
  (`startup_failed` still takes over with the restart button).
- **Window**: always opens at the default size (`window_state.rs` no longer
  restores saved geometry; tracking remains for a future restore opt-in) and
  `TitleBarDragRegion.tsx` now renders close/minimize/maximize buttons on
  Windows for the frameless shell.

**Guards**: `cargo check` clean; `tsc --noEmit` clean; ruff check + format
clean; `pytest` 279 passed across the affected model/download suites;
`vitest` for the touched components green; `/health/ready` observed
answering ~2 s after process start with the torch warm-up in the
background. Docs: `docs/knowledge/91-app-folder-models-and-staged-startup.md`.

### Model-operations audit + invisible subprocesses (2026-10-14, done)

- **Console windows eliminated.** New `backend/utils/hidden_subprocess.py`
  (`popen_hidden` / `run_hidden` / `popen_kwargs`) wraps
  `CREATE_NO_WINDOW`; all 38 production spawn sites route through it
  (llama-server, crispasr, s2, parakeet, ffmpeg, model venv scripts,
  voice-changer, backend). Rust `server.rs` does the same with
  `CommandExt::creation_flags` on both backend spawns and the
  `tasklist`/`taskkill` probes — `otoyin-server.exe` no longer flashes a
  terminal at every app launch.
- **HIGH — delete freed nothing**: `DELETE /models/{name}` still targeted
  `~/.cache/huggingface`, so it reported success while `data/models/`
  weights stayed on disk. Now removes the app-folder slug dir *and* the
  legacy cache dir; surviving files are reported, not hidden.
- **HIGH — quantization re-quantified every model**:
  `_quantize_onnx_if_needed` globbed `*.onnx` recursively across the whole
  models dir, rewriting unrelated graphs (yamnet, deepfilter, kokoro
  variants) into duplicate `.int8.onnx` copies. Scoped to this model's own
  directories; its "already quantized" guard compared `Path.suffix`
  against `.int8.onnx`, which can never match, producing
  `<name>.int8.int8.onnx`.
- **MEDIUM — integrity baseline blind**: `model_integrity` hashed the HF
  cache, so it found zero files post-switch and `/models/verify` was
  meaningless. Now hashes `data/models/<slug>/` (legacy cache fallback);
  tamper detection re-verified end-to-end.
- **MEDIUM — interrupted downloads leaked** `.incomplete` files in the HF
  cache (up to the model's full size per cancelled attempt). Cancel and
  failure paths now clear them.
- **LOW — atomic installs** (temp + `os.replace`) so an interrupted copy
  can't leave a truncated file that passes `is_model_installed()`.

**Guards**: `cargo check` + `cargo test` (15) clean; ruff check + format
clean; `pytest` 303 passed across the model/download/audit suites;
encoding + report-header gates clean; delete/scoped-quantize/integrity/
partial-cleanup each verified with a targeted functional test. Docs:
`docs/knowledge/91-app-folder-models-and-staged-startup.md`.

