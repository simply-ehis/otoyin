PURPOSE: How an AI renders General-MIDI instruments (piano/bass/strings/brass/pads/bells) and 16-step drum loops from synthesized hits — fully offline via a SoundFont.

OWNS: `backend/services/gm_instrument.py` (`render_gm_note`, `render_gm_pattern`, `get_soundfont_path`), `backend/services/drum_machine.py` (`render_drum_pattern`), `backend/routes/instruments.py` (`/instruments/gm`, `/instruments/drum-machine`, `/instruments/gm-types`), `backend/routes/assistant_tools/` (`play_gm_instrument`, `play_drum_machine`), `backend/mcp_server/tools/`.

READ-WHEN: An AI is asked to "play a piano note", "add strings under the voice", "make a drum beat / loop", or "give me a bell sound effect".

KEY-FILES: `37-professional-finishing.md` (mastering the rendered clip), `38-recipe-runner-and-interchange.md`, `mcp-tools-extended.md`.

INVARIANTS:
- Offline only. Rendering uses `tinysoundfont` (a SoundFont synthesizer) — no network, no cloud.
- Non-destructive: every call returns a freshly synthesized WAV; no source file is touched.
- A SoundFont must exist in `data/soundfonts/` (FreePats, `FluidR3_GM.sf2`, or `FluidR3_GS.sf2`). If none is found the tool raises `RuntimeError` → HTTP 501 with a clear install hint.

GOTCHAS:
- GM `program` is 0-based: 0 piano, 32 bass, 40 strings, 56 trumpet, 73 pad, 112 tinkle bell. Do NOT add 1 (0 is piano, not 1).
- `play_drum_machine` takes `pattern` as a **list of steps**, where each step is a voice name (`"kick"`) or a list of names (`["kick","hihat"]`). It is NOT a per-voice dict. Loops `bars` times.
- Stereo output: both endpoints return 2-channel float32 audio (48000 Hz). Concatenating a pattern step reuses the same step length so steps line up.
- Drum voices are limited to kick/snare/hihat/clap/tom (unknown names are silently skipped).
- `tinysoundfont` is a gated dependency; if the package is missing the import fails fast with a 501 hint, never a fake render.

## Tools

### play_gm_instrument
- Assistant: `play_gm_instrument(program, note=60, duration=1.0, velocity=0.8)`
- MCP: `21labs.play_gm_instrument(program, note, duration, velocity)`
- Endpoint: `POST /instruments/gm` → WAV.
- Renders one GM note. Use `render_gm_pattern` server-side for a short melodic loop.

### play_drum_machine
- Assistant: `play_drum_machine(pattern, step_duration=0.125, bars=1, velocity=0.8)`
- MCP: `21labs.play_drum_machine(pattern, step_duration, bars, velocity)`
- Endpoint: `POST /instruments/drum-machine` → WAV loop.
- `pattern` example: `["kick",["kick","hihat"],"snare","hihat"] * 4`. `step_duration` 0.125 s = 120 BPM sixteenths.

### gm-types (discovery)
- `GET /instruments/gm-types` → describes the GM program range and example programs.

## Agent loop
Render the instrument/drum clip, then `master_audio` (target LUFS for the platform) and `export_audio` with a platform preset. Verify with `analyze_loudness` (see `40-loudness-and-subtitles.md`).

## Agent Callable
- **MCP Tools:** `21labs.play_gm_instrument`, `21labs.play_drum_machine`, `21labs.play_piano_note`, `21labs.play_synth_note`, `21labs.play_drum_pad`, `21labs.generate_noise`
- **REST Endpoints:** `POST /instruments/gm`, `POST /instruments/drum-machine`, `POST /instruments/piano`, `POST /instruments/synth`, `POST /instruments/drum`, `POST /instruments/noise`, `GET /instruments/gm-types`, `GET /instruments/drum-types`, `GET /instruments/noise-types`
- **Key Backend Files:** `backend/services/gm_instrument.py`, `backend/services/drum_machine.py`, `backend/services/instruments.py`, `backend/routes/instruments.py`
- **Key Frontend Files:** `app/src/components/Workspace/StudioView.tsx`

UPDATED: 2026-07-15
