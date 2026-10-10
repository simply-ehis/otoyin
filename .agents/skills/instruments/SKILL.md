---
name: instruments
description: Router for otoyin instrument rendering — pick the right synthesis path (procedural no-SoundFont hits, General-MIDI SoundFont instruments, or patterned drum-machine loops) and the matching MCP/REST tool.
---
# Instruments — Router

otoyin renders instruments three ways. Pick by the request:

## 1. Procedural (no SoundFont, never fails) — `procedural-instruments`
Additive numpy synth: piano, synth waveform, single drum hit, procedural noise.
Use for quick deterministic beds/FX when `data/soundfonts/` is absent.
- MCP: `play_piano_note`, `play_synth_note`, `play_drum_pad`, `generate_noise`
- REST: `POST /instruments/piano`, `/instruments/synth`, `/instruments/drum`, `/instruments/noise`
- Mono 48000 Hz. Detail: [procedural-instruments](../procedural-instruments/SKILL.md)

## 2. General MIDI (SoundFont, realistic) — `virtual-instruments-gm`
Renders one GM instrument note (piano/bass/strings/brass/pads/bells) via `tinysoundfont`.
- MCP: `play_gm_instrument` — REST: `POST /instruments/gm` — Discover: `GET /instruments/gm-types`
- Stereo 48000 Hz. **501 if no SoundFont.** 0-based program (0 = piano).
- Detail: [virtual-instruments-gm](../virtual-instruments-gm/SKILL.md)

## 3. Drum machine (synthesized hits, patterned loop) — `drum-machine`
16-step (or N-step) drum pattern loop from synthesized hits.
- MCP: `play_drum_machine` — REST: `POST /instruments/drum-machine`
- `pattern` is a list of steps; each step is a voice name or list of names.
- Detail: [drum-machine](../drum-machine/SKILL.md)

## Cross-links
- Knowledge router: [instruments-router.md](../../docs/knowledge/instruments-router.md)
- Finishing: [mastering](../mastering/SKILL.md), [39-gm-instruments](../../docs/knowledge/39-gm-instruments.md)
