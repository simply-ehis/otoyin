---
name: drum-machine
description: Render a 16-step (or N-step) drum loop offline from synthesized hits (kick/snare/hihat/clap/tom). Use when a user asks for a "drum beat", "drum loop", "hi-hat pattern", or any step-sequenced percussion.
---
# Drum Machine — 16-Step Sequencer

## Purpose
Renders a looped drum pattern from synthesized drum hits using
`render_drum_pattern`. Offline, non-destructive; returns a stereo WAV loop.

## When to use
- User asks for "a drum beat", "a 4-on-the-floor loop", "add hi-hats", "a trap pattern".
- Need rhythmic percussion under music/voice (distinct from GM melodic instruments).

## Prerequisites
- Tool surface: MCP `21labs.play_drum_machine` OR REST `POST /instruments/drum-machine`.
- No SoundFont needed — drums are additive synth hits (`generate_drum_pad`).
- Voices: `GET /instruments/drum-types`. See [virtual-instruments-gm](../virtual-instruments-gm/SKILL.md) for melodic GM.

## Parameters / Schema (REAL ranges from code)
| param | range | default | notes |
|-------|-------|---------|-------|
| pattern | list[step] | (required) | each step = voice name `"kick"` OR list `["kick","hihat"]`; **unknown voices silently skipped** |
| step_duration | [0.02, 1.0] | 0.125 | seconds per step; **0.125 s = 120 BPM sixteenths** |
| bars | [1, 16] | 1 | pattern repeats this many times |
| velocity | [0.0, 1.0] | 0.8 | hit loudness |

Voices: `kick`, `snare`, `hihat`, `clap`, `tom` (anything else is dropped, no error).
Output: **stereo float32, 48000 Hz**, peak-normalized to 0.9.

## Agent procedure
1. `GET /instruments/drum-types` → confirm the 5 supported voices.
2. Build `pattern` as a list of steps (a 16-step list is typical).
3. Call `21labs.play_drum_machine(pattern, step_duration, bars, velocity)`.
4. Decode WAV; bounce with other tracks via `21labs.bounce`; finish with [mastering](../mastering/SKILL.md).

## Worked example
```python
pattern = ["kick", ["kick","hihat"], "snare", "hihat"] * 4   # 16-step loop
TWENTYLABS.play_drum_machine(pattern=pattern, step_duration=0.125, bars=2, velocity=0.8)
```
REST:
```bash
curl -X POST http://localhost:17493/instruments/drum-machine \
  -H 'Content-Type: application/json' \
  -d '{"pattern":["kick",["kick","hihat"],"snare","hihat","kick",["kick","hihat"],"snare","hihat"],"step_duration":0.125,"bars":1,"velocity":0.8}'
```

## Pitfalls / Gotchas
- `pattern` is a **list of steps**, each a voice name or list of names — NOT a per-voice dict.
- Unknown voice names are **silently skipped** (no error) — double-check spelling.
- `step_duration=0.125` ⇒ 120 BPM sixteenths; for 8th notes use 0.25, etc.
- Output is stereo 48000 Hz (differs from Stable Audio's 44100).
- Loops `bars` times; total length = `len(pattern) * step_duration * bars`.

## Cross-links
- [virtual-instruments-gm](../virtual-instruments-gm/SKILL.md)
- [engine-atlas](../engine-atlas/SKILL.md)
- [effects-field-guide](../effects-field-guide/SKILL.md)

## Validation
- Confirm `sample_rate == 48000`, 2 channels, and length ≈ `len(pattern)*step_duration*bars`.
- Verify each intended voice fires on its step (non-silent energy at expected offsets).
