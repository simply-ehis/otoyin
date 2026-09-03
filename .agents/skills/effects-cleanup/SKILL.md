---
name: effects-cleanup
description: De-esser, spectral denoise, noise_gate, and RNNoise/VAD cleanup for otoyin — which to use, real params, and that deesser/spectral_denoise are the only ones run_recipe accepts per segment.
---
# Effects — Cleanup (De-esser, Denoise, Gate, RNNoise)

## Purpose
Remove unwanted artifacts: sibilance (**deesser**), stationary background noise
(**spectral_denoise**, **RNNoise**), and low-level floor between phrases
(**noise_gate**). This is the "clean before you shape" layer.

## When to use
- Harsh "s"/"sh" (de-esser).
- Fan/AC/hiss under the voice (spectral_denoise or RNNoise).
- Hum/breath/room tone between words (noise_gate).
- Bulk cleaning of a raw capture (RNNoise via `/audio/noise-reduce`).

## CRITICAL — which cleanup effects `run_recipe` accepts
`run_recipe` (`21labs.run_recipe`, `recipe_runner.recipe_run`) applies per-segment
`effects` containing **ONLY** `deesser` and `spectral_denoise`. `noise_gate` and
RNNoise are NOT part of the recipe path — they live in the 10-effect chain
(path A) or the noise-reduce route respectively.

So: put `deesser`/`spectral_denoise` inside the recipe segment `effects`; add
`noise_gate` via the effects_chain (`/effects/preview`) before/around the recipe.

## Parameters (REAL)
### deesser (`effects_extended.apply_deesser`)
| param | range | default |
|-------|-------|---------|
| threshold_db | -40..0 | -18.0 |
| reduction_db | -18..0 | -6.0 |
| freq_low | 2000..6000 | 4000.0 |
| freq_high | 6000..12000 | 8000.0 |
| strength | [0,1] | 0.6 |

Attenuates the 4–8 kHz band only when its RMS exceeds a relative threshold.
Reduction scales by `reduction_db * strength`.

### spectral_denoise (`effects_extended.apply_spectral_denoise`)
| param | range | default |
|-------|-------|---------|
| amount | [0,1] | 0.7 |

Estimates noise profile from the **FIRST 100 ms** (assumed room tone), spectral
subtraction. Safe to run BEFORE de-esser in a chain.

### noise_gate (10-effect chain, `plugins.py`)
threshold [-60,0] dB, default -40. (See effects-dynamics.)

### RNNoise (`backend/services/noise_reduction.py`)
- `POST /audio/noise-reduce` → `reduce_noise_rnnoise(audio_path, vad_threshold)`.
- The RNNoise path (`_apply_rnnoise`) **ignores `vad_threshold`** — it denoises every
  frame (480 samples @48k) of the whole signal; it never spares "clean" passages.
- `vad_threshold` [0.0–1.0], default **0.5** is used ONLY by the spectral-gate fallback
  (when RNNoise is not installed).
- Falls back to spectral gating if RNNoise not installed.

## When to use each
| problem | tool | note |
|---------|------|------|
| Sibilance "s/sh" | deesser | end of vocal chain; recipe-compatible |
| Steady hiss/fan | spectral_denoise | needs 100 ms clean head; recipe-compatible |
| General raw cleanup | RNNoise `/audio/noise-reduce` | deep-learning denoise (whole signal; ignores `vad_threshold`) |
| Gate floor between phrases | noise_gate | 10-effect chain only |
| Hum/plosives/breath | spectral_repair (extended) | see 27-new-effects |

## Worked example (recipe segment + gate)
```json
// run_recipe segment.effects (Path B — only these two allowed)
{"effects":[
  {"type":"spectral_denoise","params":{"amount":0.7}},
  {"type":"deesser","params":{"threshold_db":-18,"reduction_db":-6,"strength":0.6}}
]}
```
Then apply a noise_gate via the chain path before/around the recipe, or run
`POST /audio/noise-reduce` on the raw capture first.

## Pitfalls
- `spectral_denoise` reads the FIRST 100 ms as noise — if the clip starts mid-word,
  it subtracts speech onset. Leave room tone at the head.
- deesser `reduction_db >= 0` or `strength == 0` → returns audio unchanged.
- `noise_gate` is not accepted by `run_recipe` — don't put it in segment `effects`.
- RNNoise absent → silent fallback to spectral gating (weaker).
- RNNoise's denoise path **ignores `vad_threshold`** — it always processes every frame and
  does NOT spare clean passages. `vad_threshold` only gates the spectral-gate fallback.

## Cross-links
- [effects-field-guide](../../effects-field-guide/SKILL.md)
- [effects-dynamics](../../effects-dynamics/SKILL.md)
- [mastering](../../mastering/SKILL.md)

## Validation
- De-esser: "s" less piercing, consonants still intelligible.
- Denoise: background lowered, no metallic "watery" artifact on voiced parts.
