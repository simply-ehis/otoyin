---
name: agent-operating-guide
description: Consolidated operating loop for any AI agent (in-app assistant or MCP client) driving otoyin — the generate→effects→export loop, the two tool surfaces, the lower-risk control boundary, and the resolve→generate→process→measure→export→master steps. Load before taking any action in the studio.
---
# Agent Operating Guide

## Purpose
One reference for how an agent operates otoyin end-to-end. otoyin is an offline/on-device AI
voice & music studio: TTS, voice cloning, ADR, a multitrack DAW, music/SFX generation, effects, and
export. Every action is a tool call to a real REST endpoint or MCP tool.

## When to use
- "Make a podcast / audiobook / voiceover / YouTube narration."
- "Generate dialogue between two characters." / "Do an ADR pass."
- "Add reverb / clean this noise / master this clip."
- "Export for Spotify / Audible / a movie / TikTok."

## Two tool surfaces
1. **In-app assistant** — `backend/routes/assistant_tools/` (package). OpenAI-style `TOOLS` executed
   backend-side via `ENDPOINT_MAP`. Audio-returning tools persist a file and return its **path**.
   UI-command tools (`ui_navigate`, `ui_set_voice_profile`, `studio_add_track`, `studio_set_master_volume`,
   `studio_import_session`) drive the browser only — the **lower-risk surface**.
2. **MCP (external agents)** — `backend/mcp_server/tools/` (package, 106 tools), mounted at `/mcp` (Streamable HTTP).
   Tools are dotted (`21labs.speak`, …) and return **base64 WAV** so an agent can re-feed audio.

## Executable skill catalog
- In-app assistant: call `list_skills` or `GET /assistant/skills`.
- MCP: call `21labs.list_skills`.
- Pass the user's task description to rank the closest playbook, then use the surface-specific
  tool names returned by that playbook. The catalog validates every referenced tool at runtime.

## Lower-risk control boundary (HARD)
- Allowed: navigation, set selected profile/engine, drive Audio Studio (add track, set master
  volume, import session), and all generation/effects/export/analysis tools.
- **NOT exposed:** live audio-graph mutation for Voice Changer, Timeline, and Multi-Take Comping.
  Those stay human-controlled. Do not attempt to drive them.

## The operating loop (every production)
1. **Resolve** — `21labs.list_profiles` (MCP) / `list_voices` (assistant). For character work,
   prefer a cloned profile with a personality prompt.
2. **Generate** — `21labs.speak` (MCP) / `generate_speech` (assistant) → `generation_id`.
   Poll `GET /generate/{id}/status` if you need completion state.
3. **Process** — `apply_effects(generation_id, effects_chain)` for styling, or primitives
   (`reduce_noise`, `measure_loudness`, `analyze_pitch`, spatial). For a mix: build tracks then
   `bounce` / `POST /audio/bounce`.
4. **Measure** — `measure_loudness` / `21labs.analyze_loudness`; compare to the recipe LUFS target.
5. **Export** — `export_audio(audio_path, preset)` with the platform preset (Podcast −16, etc.).
6. **Master** — `run_recipe` over generated segments for a broadcast-grade master on the recipe LUFS
   target; or `master_audio` directly for a single clip.

## Engine selection
See [engine-atlas](./engine-atlas/SKILL.md). Rule of thumb: smallest engine that sounds right
(Kokoro for fast batch; Zonos for expressive English; Fish Speech for multilingual;
Pocket-TTS for tiny CPU; Stable Audio for music/SFX).

## Dialogue / long-form
- Scripted multi-speaker → Conversation mode (`speak` per line + `conversation_auto_duck` +
  `conversation_auto_level`). NOTE: `POST /conversation/render` does NOT exist.
- Acted-over-picture → ADR (`/adr/*`).
- Long narrative → split into chapters, sequence in Stories (`/stories`).
- Many clips (N>1) → batch queue (see [batch-queue](./batch-queue/SKILL.md)).

## UI feedback for long operations
- Generation, download, export, and model-loading actions must expose a visible pending state;
  never leave the main pane blank while a lazy route or code-split view is loading.
- Use [app-ui-loading](../app-ui-loading/SKILL.md) for route fallbacks, query loading states,
  and action-button progress indicators.
- Preserve the user's current content during background refreshes; loading feedback should not
  replace already-rendered data unless the view has no usable data yet.

## Hard constraints
- **Offline / on-device only.** No cloud. Local models (faster-whisper, Stable Audio, gguf_llm).
- **Non-destructive.** Every step makes new audio; never overwrite a source generation. Use
  versioning (`/generations/{id}/versions`).
- **Two effect paths:** `run_recipe` applies ONLY deesser+spectral_denoise + crossfade + master.
  The 10-effect chain (eq/compressor/reverb/…) is applied via `POST /effects/preview/{id}`
  (`apply_effects`). To get EQ/compressor on a clip, apply the `effects_chain` BEFORE `run_recipe`.
- **Prove, don't claim.** After a render, verify loudness; a tool that "should have worked" is not done.

## Worked example (MCP)
```
21labs.speak(text="Welcome to the show.", profile="Morgan", engine="zonos")
→ { generation_id, poll_url: "/generate/<id>/status", ... }
# measure + master
21labs.analyze_loudness(audio_path="<path>")
21labs.master_audio(audio_path="<path>", target_lufs=-16.0, true_peak_db=-1.0)
```

## Pitfalls / Gotchas
- `21labs.speak` returns a `poll_url` (404 until audio ready — poll, don't assume immediate).
- Missing model → 400; missing SoundFont (GM) → 501; server must run with `PYTHONPATH=<repo root>`.
- Do not wire `POST /conversation/render` — it does not exist.

## Cross-links
- [engine-atlas](./engine-atlas/SKILL.md)
- [effects-field-guide](./effects-field-guide/SKILL.md)
- [mcp-tool-reference](./mcp-tool-reference/SKILL.md)
- [batch-queue](./batch-queue/SKILL.md)

## Validation
- Confirm output loudness ≈ recipe target within 1 LUFS via `analyze_loudness` before declaring done.
