---
name: procedural-instruments
description: Render lightweight, SoundFont-free instrument hits — additive piano, synth waveform, single drum hit, and procedural noise. Use for quick deterministic beds/FX without loading a SoundFont. MCP play_piano_note / play_synth_note / play_drum_pad / generate_noise.
---
# Procedural Instruments (no SoundFont)

## Purpose
Synthesizes instrument/noise audio purely in numpy — no SoundFont, no ML model.
Faster and lighter than General-MIDI (`virtual-instruments-gm`); use these for
quick deterministic hits, test beds, or when `data/soundfonts/` is absent.

## When to use
- A simple piano/synth/drum/noise hit without GM realism.
- Low-latency or SoundFont-free environments (these never 501 on a missing SoundFont).
- Layering a bed under voice (e.g. piano comp, noise sweep).

## Tool surface
- MCP: `21labs.play_piano_note`, `21labs.play_synth_note`,
  `21labs.play_drum_pad`, `21labs.generate_noise`.
- REST: `POST /instruments/piano`, `/instruments/synth`, `/instruments/drum`,
  `/instruments/noise`. Discovery: `GET /instruments/drum-types`,
  `GET /instruments/noise-types`.

## Parameters (REAL ranges from code)
| tool | param | range | default | notes |
|------|-------|-------|---------|-------|
| piano_note | note | [21,108] | 60 | MIDI note |
| piano_note | duration | [0.1,10.0] | 1.0 | s |
| piano_note | velocity | [0.0,1.0] | 0.8 | additive synth |
| synth_note | note | [21,108] | 60 | MIDI note |
| synth_note | waveform | sine/square/sawtooth/triangle | sawtooth | |
| synth_note | duration | [0.1,10.0] | 1.0 | s |
| synth_note | velocity | [0.0,1.0] | 0.8 | |
| drum_pad | drum_type | kick/snare/hihat/clap/tom | kick | see drum-types |
| drum_pad | duration | [0.01,5.0] | 0.5 | s |
| drum_pad | velocity | [0.0,1.0] | 0.8 | |
| generate_noise | noise_type | white/pink/brown/blue/violet | white | **5 types** (see Pitfalls) |
| generate_noise | duration | [0.1,30.0] | 1.0 | s |
| generate_noise | amplitude | [0.0,1.0] | 0.5 | peak == amplitude |

All return **mono float32, 48000 Hz**. (GM instruments return stereo — upmix
when mixing the two layers.)

## Worked example
```python
TWENTYLABS.play_piano_note(note=60, duration=1.0, velocity=0.8)   # C4
TWENTYLABS.play_synth_note(note=48, waveform="sawtooth")
TWENTYLABS.play_drum_pad(drum_type="kick")
TWENTYLABS.generate_noise(noise_type="pink", duration=2.0, amplitude=0.4)
```
REST:
```bash
curl -X POST http://localhost:17493/instruments/piano \
  -H 'Content-Type: application/json' -d '{"note":60,"duration":1.0}'
```

## Pitfalls / Gotchas
- **PIANO PEAK EXCEEDS 1.0.** Measured peak 1.102 at velocity 0.8 → it WILL clip
  if bounced/exported without normalization. Always run `master_audio` /
  `normalize_to_lufs` (or a limiter) before mixing piano into a stereo bed.
- **Mono output.** These are mono 48k; GM (`virtual-instruments-gm`) is stereo.
  Stack with `21labs.bounce` and set channel layout intentionally.
- **Noise types drift:** the MCP `generate_noise` description lists only
  white/pink/brown, but the code (`NOISE_TYPES`) supports **5** —
  white/pink/brown/blue/violet. Use blue/violet freely; the description is stale.
- No SoundFont needed — these never raise the 501 that GM does.

## Cross-links
- [virtual-instruments-gm](../virtual-instruments-gm/SKILL.md)
- [drum-machine](../drum-machine/SKILL.md)
- [mastering](../mastering/SKILL.md)

## Validation
- Verified live: piano peak 1.102, synth 0.800, drum_pad 0.800, noise peak == amplitude.
- All at `sample_rate == 48000`, 1 channel. GM confirmed separately at 48000 stereo.
