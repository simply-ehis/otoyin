---
name: bark-sfx
description: Generate non-verbal human sounds (laugh/sigh/gasp/cough/groan/...) on-device via Bark. Use when a user wants a reaction sting, laughter, a cough, or other non-verbal vocalization — NOT musical SFX.
---
# Bark Non-Verbal Sounds

> **REMOVED — 2026-08.** The `bark` non-verbal sound engine is no longer registered; no
> `bark_backend.py` exists, and the `generate_sound` / `list_sounds` MCP tools and
> `/generate/bark-sound` route are gone. This page is retained for historical reference
> only — do not use it for current work. See [engine-atlas](../engine-atlas/SKILL.md).

## Purpose
Bark (`suno/bark`) produces non-verbal human sounds — reactions and vocal
expressions — via `BarkBackend.generate_sound`. It is **NOT** a `MusicBackend`;
it is reached through `bark_backend` directly. Fully offline.

## When to use
- User asks for "a laugh", "a cough", "a sigh", "a gasp", "a groan", "a chuckle", "a shush".
- Need a vocal reaction sting to drop into dialogue or a pod-cast bed.

## Prerequisites
- Engine/model: Bark downloaded via `21labs.models_download` (HF repo `suno/bark`). See [engine-atlas](../engine-atlas/SKILL.md).
- Tool surface: MCP `21labs.generate_sound` OR REST `POST /generate/bark-sound`.
- Package: `pip install bark` must be importable (else 503 REST / `ValueError` MCP).
- Discover tags: `21labs.list_sounds` / `GET /generate/bark-sounds`.

## Parameters / Schema (REAL ranges from code)
| param | range | default | notes |
|-------|-------|---------|-------|
| sound_tag | one of BARK_SOUNDS keys | (required) | `[laugh] [sigh] [gasp] [cough] [sniff] [clear throat] [groan] [chuckle] [shush]` |
| speaker | str | "v2/en_speaker_0" | passed as `history_prompt` to Bark |
| seed | int \| None | None | sets `torch.manual_seed` |

Return shape (MCP): `audio_base64` (WAV), `sample_rate` (Bark `SAMPLE_RATE`, 24000), `duration`, `sound_tag`.
REST returns a streamed `audio/wav`. If `sound_tag` is unknown, it is used verbatim as the Bark description.

## Agent procedure
1. `21labs.list_sounds` → pick a valid `sound_tag`.
2. Call `21labs.generate_sound(sound_tag, speaker, seed)`.
3. Decode WAV; bounce/mix via `21labs.bounce`; finish with [mastering](../mastering/SKILL.md).

## Worked example
```python
TWENTYLABS.generate_sound(sound_tag="[laugh]", speaker="v2/en_speaker_0", seed=42)
# -> {"audio_base64":"...", "sample_rate":24000, "duration":..., "sound_tag":"[laugh]"}
```
REST:
```bash
curl -X POST http://localhost:17493/generate/bark-sound \
  -H 'Content-Type: application/json' \
  -d '{"sound_tag":"[cough]","speaker":"v2/en_speaker_0"}'
```

## Pitfalls / Gotchas
- Bark sounds are **not** a `MusicBackend` — use `generate_sound`, never `generate_music`/`generate_sfx`.
- Sample rate is **24000** (Bark `SAMPLE_RATE`), not 44100/48000 — resample before mixing with other rates.
- This is for non-verbal reactions only; for musical/sound-design FX use [sfx-stable-audio](../sfx-stable-audio/SKILL.md) or [music-acestep](../music-acestep/SKILL.md).
- Uncached model → 400 `ModelNotCachedError` (REST) or `ValueError` (MCP).

## Cross-links
- [sfx-stable-audio](../sfx-stable-audio/SKILL.md)
- [engine-atlas](../engine-atlas/SKILL.md)
- [effects-field-guide](../effects-field-guide/SKILL.md)

## Validation
- Confirm `sample_rate == 24000`. Non-silent, recognizable vocal reaction.
- Verify `sound_tag` matches the requested emotion (laugh ≠ cough).
