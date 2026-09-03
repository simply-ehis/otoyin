---
name: music-acestep
description: Generate full songs/music from a text prompt on-device via the ACE-Step backend. Use when a user asks for music, a track, a beat, or a sung/played piece (genre/mood/tempo controllable, tempo optional).
---
# ACE-Step Music Generation

> **REMOVED — 2026-08.** The `acestep` engine is no longer registered in
> `MUSIC_ENGINES` (`backend/backends/protocols.py::MUSIC_ENGINES`); no `acestep_backend.py`
> exists, `get_music_backend` raises `ValueError: Unknown music engine`, and the
> `generate_music` / `arrange_music` MCP tools and `/generate/music` route are gone.
> This page is retained for historical reference only — do not use it for current work.
> SFX / musical beds today come from Stable Audio (`generate_sfx`). See
> [engine-atlas](../engine-atlas/SKILL.md).

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
| engine | str | "acestep" | only `get_music_backend` key here |

Return shape (MCP): `audio_base64` (WAV), `sample_rate` (44100), `duration`, `engine`, `prompt`.
REST returns a streamed `audio/wav`.

## Agent procedure
1. `21labs.list_models` → confirm `acestep` is downloadable/available.
2. Call `21labs.generate_music(prompt, duration_seconds, genre, mood, tempo, seed)`.
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
# -> {"audio_base64": "...", "sample_rate": 44100, "duration": 45.0, "engine": "acestep"}
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
