---
name: noise-reduction
description: Clean noisy speech with RNNoise (preferred) or spectral-denoise/spectral-gate, and know when to use the noise_gate effect; use when an agent must "remove background noise", "de-noise", or "clean up a take".
---
# Noise Reduction

## Purpose
Three offline cleaners remove unwanted noise from speech. `noise_reduce` (RNNoise,
falls back to spectral gating) is a REST/MCP endpoint; `spectral_denoise` and
`noise_gate` are effects applied inside the segment effects chain (recipe) or the
10-effect chain. All non-destructive.

## When to use
- "This recording has hum/hiss/room noise" → `noise_reduce` or `spectral_denoise`.
- Build a recipe segment with cleanup → add `spectral_denoise` to `effects`.
- Hard gating of silence between words → `noise_gate` (10-effect chain).

## Prerequisites
- Tool surface: MCP `21labs.noise_reduce`; REST `POST /audio/noise-reduce`.
- `spectral_denoise` / `noise_gate` via `run_recipe` segment `effects` or
  `POST /effects/preview/{id}` (10-effect chain).
- RNNoise needs `rnnoise_wrapper` (optional); missing → spectral-gate fallback.

## Parameters / Schema (REAL ranges from code)
`noise_reduce(audio_path, vad_threshold=0.5)`
| param | range | default | notes |
|-------|-------|---------|-------|
| vad_threshold | 0.0–1.0 | 0.5 | used ONLY by spectral-gate fallback (see Pitfall) |

`spectral_denoise` (effect): `amount` [0,1] def 0.7 — estimates noise from FIRST 100 ms
(room tone), spectral subtraction. Safe to chain BEFORE deesser.

`noise_gate` (10-effect chain): `threshold` [-60,0] dB def -40 — gain to zero below
threshold. See GROUNDING-PACK.

## Agent procedure
1. Decide cleaner:
   - Light broadband hiss/room tone → `spectral_denoise` (amount 0.5–0.8).
   - Heavy non-stationary noise + speech → `noise_reduce` (RNNoise).
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
| General-purpose, best quality, RNNoise installed | `noise_reduce` (RNNoise path) |
| RNNoise missing; mild noise | `noise_reduce` (spectral-gate fallback) |
| Recipe/segment cleanup, in-pipeline | `spectral_denoise` effect |
| Remove silence between words, keep transients | `noise_gate` effect |
| Per-word sibilance | deesser (see mastering) |

## Pitfalls / Gotchas
- `vad_threshold` (0–1) is only consulted by the **spectral-gate fallback**. The
  primary RNNoise path (`_apply_rnnoise`) IGNORES it. Also the gate compares raw FFT
  magnitude means (`np.mean(mag) < vad_threshold`), not a 0–1 probability, so the
  threshold's effective behavior differs from the doc's stated 0–1 VAD semantics.
- `noise_reduce` returns a base64/streaming WAV, not a stored path — save it before
  passing to `run_recipe`/`master_audio`.
- RNNoise frames are 480 samples (10 ms @ 48k); rate is resampled internally if needed.

## Cross-links
- [mastering](../../mastering/SKILL.md)
- [effects-field-guide](../../effects-field-guide/SKILL.md)
- [loudness-metering](../../loudness-metering/SKILL.md)

## Validation
- A/B the cleaned WAV against the source; speech should be intact, noise floor lowered.
- Re-measure loudness (`analyze_loudness`) — cleaning can shift integrated LUFS slightly.
