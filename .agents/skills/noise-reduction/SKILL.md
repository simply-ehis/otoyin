---
name: noise-reduction
description: Clean noisy speech with DeepFilterNet, spectral-denoise, or the noise_gate effect; use when an agent must "remove background noise", "de-noise", or "clean up a take".
---
# Noise Reduction

## Purpose
Two offline cleaners remove unwanted noise from speech. `noise_reduce` uses DeepFilterNet;
`spectral_denoise` and `noise_gate` are effects applied inside the segment effects chain (recipe) or the
10-effect chain. All non-destructive.

## When to use
- "This recording has hum/hiss/room noise" → `noise_reduce` or `spectral_denoise`.
- Build a recipe segment with cleanup → add `spectral_denoise` to `effects`.
- Hard gating of silence between words → `noise_gate` (10-effect chain).

## Prerequisites
- Tool surface: MCP `21labs.noise_reduce`; REST `POST /audio/noise-reduce`.
- `spectral_denoise` / `noise_gate` via `run_recipe` segment `effects` or
  `POST /effects/preview/{id}` (10-effect chain).

## Parameters / Schema (REAL ranges from code)
`noise_reduce(audio_path, vad_threshold=0.5)`
| param | range | default | notes |
|-------|-------|---------|-------|
| vad_threshold | 0.0–1.0 | 0.5 | accepted by the API, but currently unused by the DeepFilterNet path |

`spectral_denoise` (effect): `amount` [0,1] def 0.7 — estimates noise from FIRST 100 ms
(room tone), spectral subtraction. Safe to chain BEFORE deesser.

`noise_gate` (10-effect chain): `threshold` [-60,0] dB def -40 — gain to zero below
threshold. See GROUNDING-PACK.

## Agent procedure
1. Decide cleaner:
   - General speech noise → `noise_reduce`.
   - Light broadband hiss/room tone → `spectral_denoise` (amount 0.5–0.8).
   - Gaps between phrases only → `noise_gate` (threshold ~ -40 dB).
2. Endpoint: `POST /audio/noise-reduce` `{audio_path, vad_threshold}` → streaming WAV.
   MCP: `21labs.noise_reduce(audio_path="clip.wav", vad_threshold=0.5)`.
3. Recipe cleanup: `run_recipe(segments=[{"audio_path":p,"effects":[{"type":"spectral_denoise","params":{"amount":0.7}}]}], recipe="podcast")`.

## Worked example
```bash
curl -X POST http://localhost:17493/audio/noise-reduce -H 'Content-Type: application/json' \
  -d '{"audio_path":"raw_take.wav","vad_threshold":0.5}' --output clean.wav
```

## Which tool, when
| situation | use |
|-----------|-----|
| General-purpose speech noise | `noise_reduce` (DeepFilterNet path) |
| Recipe/segment cleanup, in-pipeline | `spectral_denoise` effect |
| Remove silence between words, keep transients | `noise_gate` effect |
| Per-word sibilance | deesser (see mastering) |

## Pitfalls / Gotchas
- `vad_threshold` is accepted by the API but currently unused by the DeepFilterNet path.
- `noise_reduce` returns a base64/streaming WAV, not a stored path — save it before
  passing to `run_recipe`/`master_audio`.

## Cross-links
- [mastering](../mastering/SKILL.md)
- [effects-field-guide](../effects-field-guide/SKILL.md)
- [loudness-metering](../loudness-metering/SKILL.md)

## Validation
- A/B the cleaned WAV against the source; speech should be intact, noise floor lowered.
- Re-measure loudness (`analyze_loudness`) — cleaning can shift integrated LUFS slightly.
