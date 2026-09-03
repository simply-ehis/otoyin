---
name: effects-field-guide
description: Consolidated reference for all otoyin effects — the 10 BUILTIN_EFFECTS plus deesser/spectral_denoise, their REAL parameter ranges, and the TWO effect application paths. Load when an agent must choose or apply any effect.
---
# Effects Field Guide (otoyin)

## Purpose
otoyin has two **independent** effect layers that agents constantly conflate.
This guide is the single index for *which* effects exist, *what their real ranges
are*, and — critically — *where each is applied*. Read this before using any
`apply_effects` / `run_recipe` call.

## When to use
- User asks for EQ, compression, reverb, de-essing, denoise, pitch/formant, etc.
- You must decide whether to route through the effects_chain path or `run_recipe`.
- You need the real param range/default for any built-in effect.

## CRITICAL — The two effect paths (gotcha #1)

**Path A — 10-effect chain (EQ/compressor/reverb/delay/chorus/distortion/pitch/
formant/time/noise_gate).** Applied via the chain array, NOT by `run_recipe`:
- REST `POST /effects/preview/{generation_id}` (assistant tool `apply_effects`) → streams WAV, does not save.
- REST `POST /generations/{generation_id}/versions/apply-effects` → saves a new version.
- Mixer per-track `effects_chain` (used by `POST /mixer/preview`).
- Scripting API `apply_effects(audio_path, effects_chain)`.
- Chain format: `[{"type": "...", "enabled": true, "params": {...}}]`; validated against `backend/utils/effects.py` `EFFECT_REGISTRY`.

**Path B — per-segment cleanup inside `run_recipe` (`21labs.run_recipe`).**
`backend/services/recipe_runner.py` `recipe_run` accepts per-segment `effects`
containing **ONLY** `deesser` and `spectral_denoise`, then crossfades, optionally
ducks a music bed under speech, and masters to a recipe LUFS target.
`run_recipe` does NOT apply EQ/compressor/reverb/etc — those are ignored there.

> To actually get EQ + compressor on a clip, apply the effects_chain (Path A)
> **before** calling `run_recipe` (Path B). Order: generate → `/effects/preview`
> (or save version) → `run_recipe`.

## Parameters (REAL — from `plugins.py` BUILTIN_EFFECTS / `effects_extended.py`)

| effect | path | key params (min–max, default) |
|--------|------|-------------------------------|
| pitch_shift | A | semitones [-12,12] def 0 |
| formant_shift | A | shift_factor [0.5,2.0] def 1.0 |
| time_stretch | A | factor [0.5,2.0] def 1.0 |
| reverb | A | room_size [0,1] 0.5, damping [0,1] 0.5, wet [0,1] 0.3 |
| delay | A | delay_ms [10,1000] 200, feedback [0,0.9] 0.4, mix [0,1] 0.3 |
| chorus | A | depth [0,0.01] 0.002, rate [0.1,5] 1.5 Hz, mix [0,1] 0.5 |
| distortion | A | gain [1,10] 2.0, mix [0,1] 0.5 |
| eq | A | low_gain/mid_gain/high_gain [-12,12] 0 dB (3-band SHELVING) |
| compressor | A | threshold [-60,0] -20 dB, ratio [1,20] 4, attack [0.001,0.1] 0.01 s, release [0.01,1] 0.1 s |
| noise_gate | A | threshold [-60,0] -40 dB |
| deesser | A + B | threshold_db -18, reduction_db -6, freq_low 4000, freq_high 8000, strength [0,1] 0.6 |
| spectral_denoise | A + B | amount [0,1] 0.7 (noise profile = first 100 ms) |

Full per-effect rationale: see sibling skills (effects-dynamics / -tone / -space / -cleanup).

## Worked example — EQ → compressor via the chain
```bash
curl -X POST "http://localhost:17493/effects/preview/{generation_id}" \
  -H "Content-Type: application/json" \
  -d '{"effects_chain": [
    {"type":"eq","enabled":true,"params":{"low_gain":-2,"mid_gain":0,"high_gain":3}},
    {"type":"compressor","enabled":true,"params":{"threshold":-20,"ratio":4,"attack":0.01,"release":0.1}}
  ]}'
# Returns streamed WAV with a brightness lift (high shelf +3 dB from 3 kHz up)
# followed by 4:1 compression. To keep it: POST .../versions/apply-effects.
```

## "I want X" → effect + starting params
| goal | effect | start params |
|------|--------|--------------|
| Presence/brightness lift | eq | high_gain +2..+4 |
| Warmer/less boom | eq | low_gain -2..-4 |
| Tame loud peaks (podcast) | compressor | threshold -20, ratio 4, attack 0.008, release 0.08 |
| Cut hum/room between words | noise_gate | threshold -40 (raise toward -30 to cut more) |
| Kill "s" hiss | deesser | threshold_db -18, reduction_db -6, strength 0.6 |
| Remove fan/AC noise | spectral_denoise | amount 0.7 (needs 100 ms room tone at head) |
| Big studio room | reverb | room_size 0.8, damping 0.4, wet 0.3 |
| Slap/echo | delay | delay_ms 250, feedback 0.4, mix 0.3 |
| Deeper/younger voice | pitch_shift + formant_shift | semitones -3, shift_factor 1.2 |

## Common anti-patterns
- Calling `run_recipe` expecting EQ/compressor to apply — they won't (Path B only does deesser/spectral_denoise).
- Setting `spectral_denoise` on a clip whose first 100 ms is *not* silence → it subtracts the speech onset as "noise".
- Forgetting `enabled:true` — `build_pedalboard` skips effects with `enabled:false`.
- Out-of-range params → `validate_effects_chain` returns 400 with the offending index.

## Cross-links
- [effects-dynamics](../../effects-dynamics/SKILL.md)
- [effects-tone](../../effects-tone/SKILL.md)
- [effects-space](../../effects-space/SKILL.md)
- [effects-cleanup](../../effects-cleanup/SKILL.md)
- [mastering](../../mastering/SKILL.md)
- [conversation-mode](../../conversation-mode/SKILL.md)

## Validation
- After `/effects/preview`, A/B the returned WAV against the clean source.
- For cleanup, confirm sibilance/room tone reduced without audible artifacts on consonants.
