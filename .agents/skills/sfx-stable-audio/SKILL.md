---
name: sfx-stable-audio
description: Generate one-shot sound effects from a text prompt on-device via Stable Audio Open. Use when a user asks for an SFX, Foley, impact, ambience sting, or any non-musical sound.
---
# Stable Audio Open — Sound Effects

## Purpose
Stable Audio Open (`StabilityAI/stable-audio-open-1.0`) renders one-shot sound
effects from a text prompt. It is the SFX `MusicBackend`. Fully offline, returns
`(audio, sr)`.

## When to use
- User asks for "a door slam", "footsteps", "a laser zap", "wind ambience", "UI click".
- Need a short Foley/sound-design clip (not a musical bed).

## Prerequisites
- Engine/model: Stable Audio Open downloaded via `21labs.models_download` (HF repo `StabilityAI/stable-audio-open-1.0`). See [engine-atlas](../engine-atlas/SKILL.md).
- Tool surface: MCP `21labs.generate_sfx` OR REST `POST /generate/sfx`.
- Package: `stable-audio-open` must be importable (else 503 / `ValueError`).
  No PyPI distribution as of 2026-09-22 — install from upstream source;
  model weights are still required separately.

## Parameters / Schema (REAL ranges from code)
| param | range | default | notes |
|-------|-------|---------|-------|
| prompt | str | (required) | free-text SFX description |
| duration_seconds | [0.1, 30.0] | 5.0 | enforced by `SFXGenerateRequest` Field bounds |
| seed | int \| None | None | sets `torch.manual_seed` for reproducibility |
| engine | `stable_audio`, `sa3_sfx` | `stable_audio` | SFX engines only |

Return shape (MCP): `audio_base64` (WAV), `sample_rate` (44100), `duration`, `engine="stable_audio"`, `prompt`.
REST returns a streamed `audio/wav`.

## Agent procedure
1. `21labs.list_models` → confirm `stable_audio` available.
2. Call `21labs.generate_sfx(prompt, duration_seconds, seed)`.
3. Decode the base64 WAV; bounce/mix with other clips via `21labs.bounce` if needed.
4. Finish with [mastering](../mastering/SKILL.md) / [effects-field-guide](../effects-field-guide/SKILL.md).

## Worked example
```python
TWENTYLABS.generate_sfx(prompt="heavy iron door slam with reverb tail", duration_seconds=3.0)
# -> {"audio_base64": "...", "sample_rate": 44100, "duration": 3.0, "engine": "stable_audio"}
```
REST:
```bash
curl -X POST http://localhost:17493/generate/sfx \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"footsteps on gravel","duration_seconds":4.0}'
```

## Pitfalls / Gotchas
- `generate_sfx` takes only `prompt`, `duration_seconds`, `seed`, and SFX `engine`; genre/mood/tempo/mode belong to live `generate_music` (`acestep_gguf` or `heartmula`).
- Output sample rate is 44100 (hardcoded fallback), not 48000.
- Output is mono (channel-mean'd in `stable_audio_backend.generate`).
- Uncached model → 400 `ModelNotCachedError` (REST) or `ValueError` (MCP).
- Non-verbal human reactions (laugh/cough) have NO dedicated engine since Bark was removed —
  describe them in the Stable Audio prompt instead.

## Cross-links
- [engine-atlas](../engine-atlas/SKILL.md)
- [effects-field-guide](../effects-field-guide/SKILL.md)

## Validation
- Decode WAV; confirm `len(audio)/sr ≈ duration_seconds` and non-silent RMS.
- Verify the prompt concept is audible (no musical structure expected).
