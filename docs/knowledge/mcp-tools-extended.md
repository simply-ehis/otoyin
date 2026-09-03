# MCP Tools — Extended Catalog

PURPOSE: The MCP tools catalog — 106 tools total in `backend/mcp_server/tools/` (10 core audio tools in `mcp-audio-orchestration.md`, 96 extended here) that expose every coded otoyin capability to external agents (Claude/Cursor via the `21labs-mcp` shim).
OWNS: backend/mcp_server/tools/
READ-WHEN: Wiring an external agent to a feature beyond the 10 core tools (channels, stories, projects, plugins, scripting, audio primitives, batch, presets, models, telemetry, CUDA, import, DSP, freesound, spatial).
KEY-FILES: backend/mcp_server/tools/, backend/routes/assistant_tools/ (mirrors the same ENDPOINT_MAP surface)
INVARIANTS: Every tool calls the REST API on loopback (127.0.0.1:17493, override with twentylabs_PORT). Audio-returning tools return `{ audio_base64, sample_rate, duration, bytes }`; data tools return parsed JSON.
GOTCHAS: Audio-primitive tools (noise_reduce/normalize/compress/duck/silence_removal) send args as query params; the server must be running for the in-process HTTP call to resolve. `POST /conversation/render` does NOT exist — use `21labs.speak` per line + auto_duck/auto_level.
UPDATED: 2026-08-19

## Tools (grouped)

| Tool | Endpoint | Returns |
|------|----------|---------|
| `21labs.list_conversation_presets` | GET /conversation/presets | JSON |
| `21labs.conversation_auto_duck` | POST /conversation/auto-duck | JSON |
| `21labs.conversation_auto_level` | POST /conversation/auto-level | JSON |
| `21labs.list_batch_jobs` / `get_batch_job` / `create_batch_job` / `cancel_batch_job` | /batch/jobs* | JSON |
| `21labs.list_community_presets` / `list_community_preset_categories` | /community-presets* | JSON |
| `21labs.list_builtin_presets` / `export_preset` / `import_preset` | /presets/* | JSON |
| `21labs.voice_changer_capabilities` | GET /voice-changer/capabilities | JSON |
| `21labs.list_channels` / `get_channel` / `get_channel_voices` / `create_channel` | /channels* | JSON |
| `21labs.list_stories` / `get_story` / `create_story` / `export_story_audio` | /stories* | JSON / audio |
| `21labs.list_project_templates` / `create_project` / `save_project` / `load_project` / `import_script` | /project/* | JSON |
| `21labs.list_plugins` / `plugin_status` / `plugins_scan` / `plugins_process` | /plugins/* | JSON / audio |
| `21labs.list_scripting_functions` / `scripting_execute` | /scripting/* | JSON |
| `21labs.spectrogram` | POST /audio/spectrogram | JSON |
| `21labs.noise_reduce` / `normalize_audio` / `compress_audio` / `duck_audio` / `silence_removal` | /audio/* | audio |
| `21labs.bounce_preview` | POST /audio/bounce-preview | audio |
| `21labs.captures_refine` / `captures_retranscribe` | /captures/{id}/* | JSON |
| `21labs.generation_version_audio` | GET /audio/version/{id} | audio |
| `21labs.model_cache_dir` / `model_progress` / `models_download` / `models_load` / `models_unload` | /models/* | JSON |
| `21labs.session_save` / `session_load` | /session/* | JSON |
| `21labs.telemetry_status` / `telemetry_toggle` | /telemetry/* | JSON |
| `21labs.cuda_status` / `cuda_download` | /backend/* | JSON |
| `21labs.list_import_formats` / `import_info` | /import/* | JSON |
| `21labs.play_gm_instrument` / `play_drum_machine` / `analyze_loudness` / `export_subtitles` | /instruments/gm, /instruments/drum-machine, /audio/analyze-loudness, /transcription/export-subtitles | audio / JSON |
| `21labs.play_piano_note` / `play_synth_note` / `play_drum_pad` / `generate_noise` | /instruments/piano, /instruments/synth, /instruments/drum, /instruments/noise | audio |

## Agent workflow
1. `list_models` → valid engine values (original set).
2. `speak` / `generate_sfx` → clips (base64).
3. Extended tools for arrangement: `conversation_auto_duck`/`auto_level`, `list_stories`/`export_story_audio`, `create_project`, `plugins_process`, audio primitives.
4. `bounce` (original) or `bounce_preview` to mix; `export` is via the assistant surface (`export_audio`) or platform presets through the REST API.
5. Verify with `measure_loudness` (assistant) before delivery.

See also `33-agent-operating-guide.md`, `34-content-recipes.md`, `35-dialogue-methodology.md`.
