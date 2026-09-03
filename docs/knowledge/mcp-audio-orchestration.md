# MCP Audio Orchestration Tools

PURPOSE: The MCP tools that let an LM agent create, list, and mix audio end-to-end.
OWNS: backend/mcp_server/tools/
READ-WHEN: Wiring an agent (Claude/Cursor via `21labs-mcp` shim) to generate or arrange audio.
KEY-FILES: backend/mcp_server/tools/, backend/mcp_server/server.py (mount at /mcp), backend/routes/audio.py (`_bounce_mix`)
INVARIANTS: Audio returned by tools is base64 WAV so agents can re-feed it; every generation tool raises `ValueError` (not 500) when its engine package is not installed.
GOTCHAS: `21labs.bounce` takes `tracks: list[dict]` matching `BounceTrackConfig` (each `audio_data` is base64 WAV; `midi_notes` for synth). The server is the same uvicorn process as the REST API on port 17493.
UPDATED: 2026-08-19

## Tools (core set — 10 of the 106 total)

| Tool | Inputs | Returns |
|------|--------|---------|
| `21labs.generate_sfx` | prompt, duration_seconds, seed | base64 WAV + sample_rate, duration |
| `21labs.list_models` | — | tts/music/llm engine keys + stt engine |
| `21labs.bounce` | tracks[], sample_rate, master_volume | mixed base64 WAV + sample_rate, duration, track_count |

> `21labs.generate_music`, `21labs.generate_sound`, and `21labs.list_sounds` were removed
> 2026-08 with ACE-Step and Bark. SFX generation is the only music-domain tool.

Pre-existing: `21labs.speak`, `21labs.transcribe`, `21labs.list_captures`,
`21labs.list_profiles`.

## Agent workflow

1. `list_models` → discover valid `engine=` values.
2. `generate_sfx` → get base64 clips.
3. `bounce` with those clips as `tracks[].audio_data` (+ volume/pan/crossfade/MIDI) → one master WAV.
4. `speak` the master into the user's voice, or `transcribe` to close the loop.

## Extended catalog

The other 96 tools (channels, stories, projects, plugins, scripting, audio primitives, batch,
presets, models, telemetry, CUDA, import, DSP, freesound, spatial) are documented in
`mcp-tools-extended.md`. They follow the
same in-process REST-call pattern and return base64 audio or JSON.
