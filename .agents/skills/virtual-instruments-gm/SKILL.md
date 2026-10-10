---
name: virtual-instruments-gm
description: Render General-MIDI instrument notes (piano/bass/strings/brass/pads/bells) offline via a SoundFont (tinysoundfont). Use when a user asks to "play a piano note", "add strings", "give me a bell sound", or any single GM instrument hit.
---
# Virtual Instruments — General MIDI

## Purpose
Renders one General-MIDI instrument note offline using `tinysoundfont` plus a
GM SoundFont in `data/soundfonts/`. Non-destructive: every call returns a fresh
synthesized stereo WAV. Not a generative model — a precise sampler.

## When to use
- User asks for "a piano note", "strings under the voice", "a trumpet stab", "a tinkle bell".
- Need a controlled, deterministic instrument hit.

## Prerequisites
- Engine/model: a SoundFont must exist in `data/soundfonts/` (`FreePats.sf2`, `FluidR3_GM.sf2`, or `FluidR3_GS.sf2`). See [engine-atlas](../engine-atlas/SKILL.md).
- Tool surface: MCP `21labs.play_gm_instrument` OR REST `POST /instruments/gm`.
- Package: `pip install tinysoundfont` (else 501 with install hint).
- Discovery: `GET /instruments/gm-types`.

## Parameters / Schema (REAL ranges from code)
| param | range | default | notes |
|-------|-------|---------|-------|
| program | [0, 127] | (required) | GM program, **0-BASED** (0 piano, 32 bass, 40 strings, 56 trumpet, 73 pad, 112 tinkle bell) |
| note | [21, 108] | 60 | MIDI note number |
| duration | [0.1, 10.0] | 1.0 | seconds (plus 0.3 s release tail appended) |
| velocity | [0.0, 1.0] | 0.8 | mapped to MIDI 0–127 |

Return (MCP): JSON with `audio_base64` (WAV). REST streams `audio/wav`.
Output: **stereo float32, 48000 Hz**, peak-normalized to 0.9.

## Agent procedure
1. `GET /instruments/gm-types` → confirm program mapping / SoundFont presence.
2. Call `21labs.play_gm_instrument(program, note, duration, velocity)`.
3. Decode WAV; bounce/mix via `21labs.bounce_preview` using base64 `audio_data` tracks if layering.
4. Finish with [mastering](../mastering/SKILL.md).

## Worked example
```python
21labs.play_gm_instrument(program=0, note=60, duration=1.0, velocity=0.8)   # piano C4
21labs.play_gm_instrument(program=112, note=84, duration=0.8)               # tinkle bell
```
REST:
```bash
curl -X POST http://localhost:17493/instruments/gm \
  -H 'Content-Type: application/json' \
  -d '{"program":40,"note":60,"duration":2.0,"velocity":0.7}'
```

## Pitfalls / Gotchas
- **GM program is 0-BASED.** 0 = piano, NOT 1. Do NOT add 1.
- **501 if no SoundFont** (or `tinysoundfont` missing) — raises `RuntimeError` → HTTP 501 with install hint. Never a fake render.
- Output is stereo 48000 Hz (differs from Stable Audio's 44100).
- Voices here are melodic GM programs; percussion/drums belong to [drum-machine](../drum-machine/SKILL.md).

## Cross-links
- [drum-machine](../drum-machine/SKILL.md)
- [engine-atlas](../engine-atlas/SKILL.md)
- [effects-field-guide](../effects-field-guide/SKILL.md)

## Validation
- Confirm `sample_rate == 48000` and 2 channels. Peak ≈ 0.9 (normalized).
- Note pitch matches requested MIDI number (e.g. note 60 ≈ 261.6 Hz fundamental).
