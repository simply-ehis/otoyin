---
name: tts-luxtts
description: Drive the LuxTTS (ZipVoice) engine — 300MB, English, fast CPU-friendly zero-shot cloning, 48kHz — via POST /generate or 21labs.speak.
---

# LuxTTS (TTS)

> **REMOVED — 2026-07.** The `luxtts` engine is no longer registered in `TTS_ENGINES`
> (`backend/backends/protocols.py:300-318`); no `luxtts_backend.py` exists, and
> `get_tts_backend_for_engine` raises `ValueError: Unknown TTS engine` (`registry.py:355-356`).
> This page is retained for historical reference only — do not use it for current work.
> The fast-CPU-clone niche is covered today by `pocket_tts` (200MB). See
> [engine-atlas](../engine-atlas/SKILL.md) for the 13 live engines.

## Purpose
LuxTTS (ZipVoice) is a compact English TTS engine that clones voices
zero-shot from a ~5s reference clip and runs ~150x real-time on CPU. At 300MB
it is the smallest *clone-capable* engine in otoyin and a member of
`CLONING_ENGINES`. Use it when you need voice cloning without a large GPU model.

## When to use
- User wants English voice cloning on CPU / limited VRAM.
- A small, fast model is preferred over Fish Speech / TADA fidelity.
- Real-time or batch generation where 48kHz output is acceptable.

## Prerequisites
- Engine: `luxtts` (HF repo `YatharthS/LuxTTS`, 300MB). See [engine-atlas](../engine-atlas/SKILL.md).
- Tool surface: REST `POST /generate` | MCP `21labs.speak`.
- Voice: cloned profile (member of `CLONING_ENGINES`) OR direct `engine="luxtts"`.

## Parameters / Schema (from backend/backends/luxtts_backend.py, backends/__init__.py)
| param | range | default | notes |
|-------|-------|---------|-------|
| engine | `luxtts` | `kokoro` | set in GenerationRequest |
| language | `en` | `en` | English-focused (docstring) |
| model_size | — | n/a | single size |
| seed | int ≥ 0 | None | `manual_seed` when set |
| instruct | str | None | ignored by LuxTTS |
| encode duration | 5 | 5 | `encode_prompt(duration=5, rms=0.01)` |
| num_steps | — | 4 | flow-matching steps |
| guidance_scale | — | 3.0 | |
| t_shift | — | 0.5 | |
| speed | — | 1.0 | |
| sample_rate (out) | — | 48000 | 48kHz |

## Agent procedure
1. Confirm downloaded: `POST /models/download` (`YatharthS/LuxTTS`, 300MB).
2. Load: `POST /models/load` engine `luxtts`. On CPU it caps threads at `min(cpu_count, 8)`.
3. Clone: `POST /profiles/{id}/samples` with `reference_text` (≤1000 chars). LuxTTS runs Whisper ASR internally, so `reference_text` is not required by the model but IS required by the endpoint.
4. Generate: `POST /generate` → `{profile_id, text, engine:"luxtts", seed}`.

## Worked example
```bash
curl -X POST http://localhost:17493/generate -H 'content-type: application/json' -d '{
  "profile_id": "prof_luxtts_clone", "text": "Cloned on CPU, fast.",
  "engine": "luxtts", "language": "en", "seed": 7
}'
```

## Pitfalls / Gotchas
- `reference_text` is mandatory on `POST /profiles/{id}/samples` even though LuxTTS transcribes internally — include it or the request 400s.
- English-only; non-English `language` is silently ignored.
- Voice prompts are cached per `(audio_path, reference_text)` key — re-using the same sample returns the cached encode.

## Cross-links
- [engine-atlas](../engine-atlas/SKILL.md)
- [voice-profiles](../voice-profiles/SKILL.md)
- [voice-cloning](../voice-cloning/SKILL.md)
- [tts-piper](../tts-piper/SKILL.md) (CPU, no clone)

## Validation
- Output WAV at 48000 Hz. Clone timbre should match the 5s reference; latency ≈ real-time × 1/150 on CPU.
