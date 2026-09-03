---
name: effects-dynamics
description: Compressor and noise_gate reference for otoyin — real ranges/defaults, the separate effects_chain path, and voice-appropriate starting points for podcast/speech.
---
# Effects — Dynamics (Compressor & Noise Gate)

## Purpose
Dynamic-range control for voice: a **compressor** to even out loud/quiet passages
and a **noise_gate** to silence low-level room tone between phrases. Both are part
of the 10-effect chain (`plugins.py` BUILTIN_EFFECTS) and are applied via the
effects_chain path — NOT by `run_recipe`.

## When to use
- Speech is uneven (whispers + shouts), needs consistent level.
- Room tone / HVAC noise leaks between words and you want silence gated.
- User asks for "podcast compression", "punch", "gate the noise floor".

## Path reminder (gotcha #1)
Apply via `POST /effects/preview/{generation_id}` (assistant `apply_effects`) or
save with `POST /generations/{generation_id}/versions/apply-effects`. `run_recipe`
does NOT apply these. Chain entry: `{"type":"compressor"|"noise_gate","enabled":true,"params":{...}}`.

## Parameters — compressor (REAL, `plugins.py`)
| param | range | default | meaning |
|-------|-------|---------|---------|
| threshold | [-60, 0] dB | -20 | Level above which gain reduction kicks in |
| ratio | [1, 20] | 4 | Compression amount (4 = 4:1) |
| attack | [0.001, 0.1] s | 0.01 | How fast reduction engages |
| release | [0.01, 1] s | 0.1 | How fast gain returns |

Implementation: `effects_chain._apply_compressor` — smoothed envelope, gain = `threshold + (env-threshold)/ratio` above threshold.

## Parameters — noise_gate (REAL)
| param | range | default |
|-------|-------|---------|
| threshold | [-60, 0] dB | -40 |

`effects_chain._apply_noise_gate` opens when `|sample| > 10**(threshold/20)`, else
ramps down over `release` (fixed 0.1 s internally).

## Voice starting points
**Podcast / spoken-word compressor** (kills peaks, keeps natural):
- threshold **-18 to -20 dB**, ratio **4:1**, attack **0.005–0.010 s** (5–10 ms), release **0.050–0.100 s** (50–100 ms).
- *Why:* speech peaks sit ~-18 to -20 dBFS; a 4:1 ratio tames them without
  heavy pumping; a 5–10 ms attack lets plosive transients through (avoids
  distortion) while still catching the body; 50–100 ms release returns gain smoothly
  between words so the gate/reverb tail isn't chopped.

**Noise gate** for clean VO:
- strength toward **threshold -35 to -45 dB**; raise toward -30 dB to cut more floor
  (risk: clipping word tails). Default -40 is a safe starting point.

## Worked example
```bash
curl -X POST "http://localhost:17493/effects/preview/{generation_id}" \
  -H "Content-Type: application/json" \
  -d '{"effects_chain":[
    {"type":"compressor","enabled":true,"params":{"threshold":-20,"ratio":4,"attack":0.008,"release":0.08}},
    {"type":"noise_gate","enabled":true,"params":{"threshold":-42}}
  ]}'
```

## Pitfalls
- Too-fast attack (<2 ms) + high ratio → "pumping"/distortion on plosives.
- Gate threshold too high removes the tail of soft consonants ("s", "f").
- These are ignored inside `run_recipe`; apply them first, then recipe.

## Cross-links
- [effects-field-guide](../../effects-field-guide/SKILL.md)
- [effects-tone](../../effects-tone/SKILL.md)
- [mastering](../../mastering/SKILL.md)

## Validation
- Compressor: louder quiet passages rise, peaks reduced; no audible pumping.
- Gate: silence between phrases is truly silent, word endings intact.
