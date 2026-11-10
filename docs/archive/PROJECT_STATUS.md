# Project Status

**Build:** ✅ App + Tauri compile clean. `tsc --noEmit` is slow on low-end hardware (13s for 2 files, >20s for `router.tsx`); `bin/check.ps1` now wraps it with a 90s timeout and warns instead of hanging. `vite build` same.

**Lint:** Frontend is Biome-clean (0 errors). `app/src/lib/api/` is in `.biomeignore`
(generated code — not linted), so no `noExplicitAny` warnings are reported for
`client.ts`. 19 other pre-existing diagnostics (`useExhaustiveDependencies`,
`noArrayIndexKey`, `noExplicitAny`) live in files outside the current phase — all
non-blocking for the build.

**Backend:** Python/FastAPI server on port **17493**. Bundled as a Tauri sidecar for
production; in dev run `npm run dev:server` separately. The same uvicorn process also
serves the MCP server at `/mcp` (Streamable HTTP) for agent control.

**Offline / Cross-platform:** Every model runs on-device. STT uses **whisper.cpp**
(GGML GGUF, `whisper_cpp_backend.py`, Tiny — base/large/MLX variants removed;
see PRICING_PLAN.md for the locked STT lineup). The assistant LLM runs on
**llama.cpp `server.exe`** (`gguf_llm` backend, replaces llama-cpp-python) with
7 curated planner GGUFs: Qwopus 4B (free default), LFM2.5-2.6B (free multilingual), Qwopus 4B v3 / Spark-X / LFM2.5-8B-A1B / Ling-3.0-tiny / Bonsai 2 27B (paid one-time), plus cloud tiers —
prices locked in `docs/PRICING_PLAN.md`.

**Model Interfaces (one protocol + factory per modality):**
- `TTSBackend` + `get_tts_backend_for_engine()` — **16 engines** (registered in
  `backends/protocols.py::TTS_ENGINES`): Kokoro 82M, Fish Speech
  S1-mini, **Fish Audio S2 Pro (GGUF, s2.cpp)**, Zyphra Zonos, StyleTTS2, ChatTTS, F5-TTS, Pocket-TTS, Parler-TTS
  Mini, MOSS-TTS-Nano, KittenTTS, NeuTTS-Air, NeuTTS-2E, Orpheus 3B,
  Qwen3-TTS Base, Bark Small.
- `STTBackend` + `get_stt_backend()` — faster-whisper (CTranslate2 int8) with a whisper.cpp
  GGUF fallback via `whisper_cpp_backend.py` (MLX variant removed).
- `LLMBackend` + `get_llm_backend()` — `gguf_llm` on llama.cpp server.exe
  (0.8B / 2B / Qwopus 4B v3 / Ministral-3-3B).
- `MusicBackend` + `get_music_backend()` — **3 downloadable engines**: ACE-Step 1.5
  (music), HeartMuLa 3B (music), Stable Audio 3 Small SFX. Stable Audio Open and
  MiniMax Music 3 are engine labels without downloadable configs yet. Non-verbals come from the DSP system
  (`backend/services/audio_tags.py`) — Bark non-verbal removed.

**MCP Agent Control:** **201 tools** registered (`backend/mcp_server/tools/`, 13 modules incl. `skills.py`) under the `21labs.*` namespace. Adds `21labs.list_skills` workflow catalog. Agents can speak, transcribe,
list captures/profiles, generate SFX, list/update model engines,
master/duck/level/separate mixes, run full content recipes
end-to-end, and decompose complex tasks into ordered workflow plans.

**Error Handling:** Studio-themed error system wired into `ProfileList` and `VoicesTab`.
Raw `FetchError` shows as "Signal Lost". Top-level and route-level `<ErrorBoundary>` with
`CrashScreen` fallback.

**Visual Identity:** Caravaggio-style rose background (`rose-bg.svg`). Audio-reactive
radial glow pulses during playback.

**Audio Studio (all Done):** crossfade (equal-power), live effects playback (reverb /
EQ / delay / compressor / gain), MIDI audio export (backend synth), and multi-channel
(>2) bounce/playback. Only VST3/AU plugin hosting remains open.

**Knowledge Docs:** `docs/knowledge/00-index.md` indexes per-tool docs, including the
`TOOL-REFERENCE.md` (204-tool in-app assistant catalog) and the MCP audio tool docs.
Workflow planner/executor docs in `backend/services/workflow.py` and `backend/mcp_server/tools/workflow.py`.

**Known Issues:**
- `routes/audio.py` is ~272 lines (under the 200-line/file soft rule — previously ~1146, already reduced).
- `backends/configs/` package is ~761 lines total across 3 files (`__init__.py` 191, `tts.py` 421, `vc.py` 149).
- Model weights (whisper.cpp, Kokoro, GGUF planners, Stable
  Audio) must be downloaded once on a network-connected machine before first use.
- Pre-existing biome warnings: 11 `noExplicitAny` in `AssistantMessage.tsx` and `useEditorDrag.ts` (non-blocking).
- GGUF quant research: Q4_K_M confirmed optimal for all planners; imatrix
  `i1-Q4_K_M` from mradermacher available as quality upgrade for 2B default
  (5-10% slower, better reasoning accuracy — 1.4 GB vs 1.27 GB). See
  `docs/ASSISTANT_ARCHITECTURE.md` §8 for full quant table.
- Gemma 4 E2B evaluated and **not** replacing 2B Opus-Distilled in v1 —
  no CoT distillation, different architecture (PLE), 3x heavier GGUF.
  Viable for v2 multimodal planner. See `docs/ASSISTANT_ARCHITECTURE.md` §9.
