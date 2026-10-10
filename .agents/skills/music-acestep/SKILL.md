---
name: music-acestep
description: Generate full songs/music from a text prompt on-device via the ACE-Step backend. Use when a user asks for music, a track, a beat, or a sung/played piece (genre/mood/tempo controllable, tempo optional).
---
# ACE-Step Music Generation

> **RENAMED — engine key is now `acestep_gguf`.** `MUSIC_ENGINES` contains
> `acestep_gguf`, `heartmula`, and `minimax_music3` for music, plus
> `stable_audio` and `sa3_sfx` for SFX. `21labs.generate_music` and
> `POST /generate/music` are live. Use this page for ACE-Step-family music; for
> SFX use [sfx-stable-audio](../sfx-stable-audio/SKILL.md).

## Purpose
ACE-Step (`ACE-Step/ACE-Step-1.0`) renders complete songs from a text prompt with
optional genre, mood, and tempo conditioning. It is one of two `MusicBackend`
engines (the other is Stable Audio for SFX). Fully offline, returns `(audio, sr)`.

## When to use
- User asks for "a song", "background music", "a lo-fi beat", "cinematic score".
- Need a musical bed to layer TTS or instruments over.

## Prerequisites
- Engine/model: ACE-Step downloaded via `21labs.models_download` (HF repo `ACE-Step/ACE-Step-1.0`). See [engine-atlas](../engine-atlas/SKILL.md).
- Tool surface: MCP `21labs.generate_music` OR REST `POST /generate/music`.
- Package: `pip install acestep` must be importable (else 503 / `ValueError`).

## Parameters / Schema (REAL ranges from code)
| param | range | default | notes |
|-------|-------|---------|-------|
| prompt | str | (required) | free-text description; genre+mood prepended internally |
| duration_seconds | [1.0, 300.0] | 30.0 | enforced by `MusicGenerateRequest` Field bounds |
| genre | str | "pop" | folded into prompt as `{genre}, {mood}, {prompt}` |
| mood | str | "neutral" | folded into prompt |
| tempo | int \| None | None | if set, appended as `{tempo} bpm`; may be None |
| seed | int \| None | None | sets `torch.manual_seed` for reproducibility |
| engine | str | "acestep_gguf" | `acestep_gguf` (default), `heartmula`, or `minimax_music3` |
| mode | `generate`, `cover`, `repaint` | `generate` | cover/repaint use the same prompt/style controls |

Return shape (MCP): `audio_base64` (WAV), `sample_rate` (44100), `duration`, `engine`, `prompt`.
REST returns a streamed `audio/wav`.

## Agent procedure
1. `21labs.list_models` → confirm `acestep_gguf` is downloadable/available.
2. Call `21labs.generate_music(prompt, duration_seconds, genre, mood, tempo, seed, mode)`.
3. Decode the base64 WAV and bounce/mix with other clips via `21labs.bounce` if needed.
4. Finish with mastering — see [mastering](../mastering/SKILL.md); effects via [effects-field-guide](../effects-field-guide/SKILL.md).

## Worked example
```python
TWENTYLABS.generate_music(
    prompt="warm guitar arpeggio with soft rain",
    duration_seconds=45,
    genre="ambient",
    mood="calm",
    tempo=90,
)
# -> {"audio_base64": "...", "sample_rate": 44100, "duration": 45.0, "engine": "acestep_gguf"}
```
REST:
```bash
curl -X POST http://localhost:17493/generate/music \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"calm piano","duration_seconds":30,"genre":"ambient","mood":"calm","tempo":null}'
```

## Pitfalls / Gotchas
- `tempo=None` is valid; omit it for free tempo. ACE-Step appends `tempo bpm` only when set.
- Output sample rate is 44100 (hardcoded fallback), not 48000 like the instrument endpoints.
- Output is mono (channel-mean'd in `acestep_backend.generate`); upmix downstream if stereo needed.
- Model must be downloaded first; uncached → 400 `ModelNotCachedError` (REST) or `ValueError` (MCP).

## Cross-links
- [engine-atlas](../engine-atlas/SKILL.md)
- [effects-field-guide](../effects-field-guide/SKILL.md)
- [mastering](../mastering/SKILL.md)

## Validation
- Decode WAV, confirm `len(audio)/sr ≈ duration_seconds` and non-silent RMS.
- Listen / `measure_loudness` for a sane peak (≈ -1.0 dBFS after [mastering](../mastering/SKILL.md)).
