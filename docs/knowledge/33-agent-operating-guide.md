# 33 — Agent Operating Guide

PURPOSE: Teach any AI agent (in-app assistant or external MCP client) how to operate otoyin through its tools.
OWNS: docs/knowledge/33-agent-operating-guide.md
READ-WHEN: Wiring, debugging, or using the assistant/MCP tool surface.
KEY-FILES: backend/routes/assistant_tools/ (TOOLS/ENDPOINT_MAP), backend/mcp_server/tools/, docs/knowledge/TOOL-REFERENCE.md
INVARIANTS: Every action is a tool call to an existing REST endpoint; audio returned is a saved path (assistant) or base64 WAV (MCP). Nothing runs in a shell.
GOTCHAS: Assistant tools execute backend-side via ENDPOINT_MAP (HTTP to self, real port 17493 in packaged build). MCP tools are thin wrappers returning base64.
UPDATED: 2026-07-15

## The core loop

Every production follows the same shape:

1. **Pick a voice.** `list_voices` (assistant) / `21labs.list_profiles` (MCP). Resolve a
   `profile_id` or name. For character work, prefer a cloned profile with a personality prompt.
2. **Generate.** `generate_speech(text, profile_id)` → returns a `generation_id`. Poll
   `GET /generate/{id}/status` if you need completion state. (MCP: `21labs.speak` returns a
   poll URL.)
3. **Process.** `apply_effects(generation_id, effects_chain)` for voice styling, or the dedicated
   primitives: `reduce_noise`, `measure_loudness`, `analyze_pitch`, `spatial_binaural`,
   `spatial_doppler`. For a full mix, use the DAW: add tracks, then `studio_save_session` /
   `POST /audio/bounce`.
4. **Arrange.** For dialogue, use Conversation mode (`run_recipe` for the mixed master + `auto-duck` +
   `auto-level`) or ADR (`/adr/*`). For sequences, use Stories (`/stories`). For a project, use
   Standalone Project (`/projects`).
5. **Export.** `export_audio(audio_path, preset)` with a platform preset (Podcast −16 LUFS, etc.).
   See `22-platform-export.md`.

## Tool surfaces (two of them)

- **In-app assistant** — `backend/routes/assistant_tools/`. OpenAI-style `TOOLS` schemas executed
  backend-side. Audio-returning tools persist a file and return its path. UI-command tools
  (`ui_navigate`, `ui_set_voice_profile`, `studio_add_track`, `studio_set_master_volume`,
  `studio_import_session`) drive the browser only (lower-risk surface: navigation + Audio Studio +
  store setters). Voice Changer / Timeline / Comping live audio-graph control is deliberately NOT
  exposed.
- **MCP (external agents)** — `backend/mcp_server/tools/`, mounted at `/mcp` (Streamable HTTP).
  Tools are dotted (`21labs.speak`, …) and return base64 WAV so an agent can re-feed audio into
  the next step. See `mcp-audio-orchestration.md` and `mcp-tools-extended.md`.

## Discovery

- `list_models` / `21labs.list_models` → valid `engine=` values (TTS, music, LLM) + STT engine.
- `list_effects` / `GET /effects/available` → effect ids for chains.
- `GET /export/presets` → platform preset names + LUFS/channel targets.
- `36-missing-features-inventory.md` → the 16 coded features not yet on the tool surface.

## Hard constraints (from repo AGENTS.md / CLAUDE.md)

- **Offline / on-device.** No cloud calls. Models are local (faster-whisper, 13 TTS engines, Stable
  Audio Open SFX, gguf_llm). If an engine package is missing, the tool raises a clear "not installed" error, not a 500.
- **Non-destructive.** Edits produce new audio; source generations are never overwritten. Use
  versioning (`/generations/{id}/versions`) to revisit.
- **Every tool ships a doc + test.** When you add a tool, add its knowledge doc to this index.
- **Lower-risk client control only.** Never expose live audio-graph mutation (voice changer,
  timeline, comping) to agents.

## Failure handling

- Tool returns `"Unknown tool: …"` → not wired in `ENDPOINT_MAP`; add it (Phase 2/3).
- `"Error 4xx: …"` → bad args; re-read the endpoint contract in the matching `NN-*.md` doc.
- Audio tool returns a path (assistant) or `audio_base64` (MCP) — never assume raw samples in JSON.

## Agent Callable
- **MCP Tools:** `21labs.speak`, `21labs.list_profiles`, `21labs.list_models`, `21labs.generate_sfx`, `21labs.generate_music`, `21labs.bounce`, `21labs.noise_reduce`, `21labs.normalize_audio`, `21labs.master_audio`, `21labs.separate_audio`, `21labs.run_recipe`, `21labs.plan_workflow`, `21labs.execute_plan`, `21labs.plan_templates`
- **REST Endpoints:** `POST /generate`, `POST /audio/bounce`, `GET /effects/available`, `GET /export/presets`, `POST /recipe/run`, `GET /assistant/tool-parity`
- **Key Backend Files:** `backend/mcp_server/tools/` (all tool files), `backend/routes/assistant.py`, `backend/services/workflow.py`
- **Key Frontend Files:** `app/src/features/assistant/AssistantPanel.tsx`, `app/src/features/voiceChat/VoiceChatOverlay.tsx`
