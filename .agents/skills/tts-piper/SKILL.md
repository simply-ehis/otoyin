---
name: tts-piper
description: Drive the Piper TTS engine — 200MB, English-only, tiny CPU-only VITS model — via POST /generate or 21labs.speak.
---

# Piper TTS (TTS)

> **REMOVED — 2026-07.** The `piper` engine is no longer registered in `TTS_ENGINES`
> (`backend/backends/protocols.py:300-318`); no `piper_backend.py` exists, and
> `get_tts_backend_for_engine` raises `ValueError: Unknown TTS engine` (`registry.py:355-356`).
> This page is retained for historical reference only — do not use it for current work.
> The tiny-CPU niche is covered today by `pocket_tts` (200MB) and `kitten_tts` (80MB).
> See [engine-atlas](../engine-atlas/SKILL.md).

## Purpose
Piper is a small, fast VITS-based neural TTS that runs entirely on CPU in
real time. At 200MB it is the lightest English engine in otoyin — ideal
for low-RAM machines, batch jobs, or when GPU/large models are unavailable.
It cannot clone voices; it uses built-in preset voices only.

## When to use
- User needs English TTS on a CPU-only / low-memory machine.
- Speed and tiny footprint matter more than maximum naturalness.
- Locale is English (`en`).

## Prerequisites
- Engine: `piper` (HF repo `rhasspy/piper-voices`, 200MB). See [engine-atlas](../engine-atlas/SKILL.md).
- Tool surface: REST `POST /generate` | MCP `21labs.speak`.
- Voice: preset only (Piper returns `voice_type:"preset"`; cloning unsupported).

## Parameters / Schema (from backend/backends/piper_backend.py, backends/__init__.py)
| param | range | default | notes |
|-------|-------|---------|-------|
| engine | `piper` | `kokoro` | set in GenerationRequest |
| language | `en` | `en` | English only |
| model_size | — | n/a | single voice size |
| seed | int ≥ 0 | None | passed through, not consumed by Piper |
| instruct | str | None | ignored by Piper |
| preset_voice_id | voice id | `en_US-lessac-medium` | `PIPER_DEFAULT_VOICE` |
| sample_rate (out) | — | 22050 | fixed; `PIPER_SAMPLE_RATE` |

## Agent procedure
1. Confirm downloaded: `POST /models/download` (`rhasspy/piper-voices`, 200MB).
2. Load: `POST /models/load` engine `piper`. Backend `load_model()` loads the `.onnx` voice.
3. Generate: `POST /generate` → `{profile_id, text, engine:"piper"}`.
   Engine resolution falls back to `profile.default_engine` then `preset_engine` then `"kokoro"` (generations.py:158) — set `engine:"piper"` explicitly to avoid wrong engine.

## Worked example
```bash
curl -X POST http://localhost:17493/generate -H 'content-type: application/json' -d '{
  "profile_id": "prof_en_preset", "text": "A quick CPU voice.",
  "engine": "piper", "language": "en"
}'
```

## Pitfalls / Gotchas
- Piper CANNOT clone — `create_voice_prompt` returns a `preset` dict. For a custom voice, use a clone-capable engine (see [voice-cloning](../voice-cloning/SKILL.md)).
- English only. Non-English `language` is ignored; output stays English.
- 22050 Hz output (not 44.1k/48k) — upsample if a downstream effect expects 48k.

## Cross-links
- [engine-atlas](../engine-atlas/SKILL.md)
- [voice-profiles](../voice-profiles/SKILL.md)
- [tts-luxtts](../tts-luxtts/SKILL.md) (faster CPU clone alternative)

## Validation
- Output WAV at 22050 Hz, real-time latency. Voice matches the selected `preset_voice_id`.
