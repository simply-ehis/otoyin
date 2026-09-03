---
name: tts-fish-speech
description: Drive the Fish Speech S1-mini (0.5B) TTS engine — 2000MB, 13 languages, 44.1kHz, zero-shot voice cloning — via POST /generate or 21labs.speak.
---

# Fish Speech S1-mini (TTS)

## Purpose
Fish Speech S1-mini (0.5B) is a multilingual zero-shot TTS model. It is a
high-fidelity English+ multilingual engine in otoyin and supports
voice cloning from a reference audio sample. Use it when you need natural
prosody across 13 languages and have ~2GB of VRAM/disk for the weights.

## When to use
- User wants natural-sounding multilingual TTS (en/zh/ja/de/fr/es/ko/ar/ru/nl/it/pl/pt).
- A cloned voice is required and the target engine is `fish_speech`.
- High audio quality (44.1kHz) matters more than latency.

## Prerequisites
- Engine: `fish_speech` (HF repo `fishaudio/openaudio-s1-mini`, S1-mini 0.5B, 2000MB). See [engine-atlas](../engine-atlas/SKILL.md).
- Tool surface: REST `POST /generate` | MCP `21labs.speak`.
- Voice: cloned profile (see [voice-profiles](../voice-profiles/SKILL.md)) OR direct `engine="fish_speech"`.

## Parameters / Schema (from backend/backends/fish_speech_backend.py, configs.py)
| param | range | default | notes |
|-------|-------|---------|-------|
| engine | `fish_speech` | `kokoro` | set in GenerationRequest |
| language | one of 13 langs | `en` | en,zh,ja,de,fr,es,ko,ar,ru,nl,it,pl,pt |
| model_size | — | n/a | fish_speech has ONE size (0.5B); ignored |
| seed | int ≥ 0 | None | `torch.manual_seed` when set |
| instruct | str ≤ 500 | None | passed through, not consumed by fish path |
| sample_rate (out) | — | 44100 | fixed; from `FISH_SPEECH_SAMPLE_RATE` (fish_speech_backend.py:28) |
| needs_trim | — | false | no trailing-silence trim |

## Agent procedure
1. Confirm the model is downloaded: `POST /models/download` with `fishaudio/openaudio-s1-mini` (2000MB) or check `21labs.list_models`.
2. Load: `POST /models/load` (engine `fish_speech`). Backend `load_model()` caches to `_model`.
3. For cloning: `fish_speech` IS in `CLONING_ENGINES`, so build a VoiceProfile with `voice_type="cloned"`, then `POST /profiles/{id}/samples` with `reference_text` — or route directly via `engine="fish_speech"` in `POST /generate`.
4. Generate: `POST /generate` → `{profile_id, text, engine:"fish_speech", language, seed}`.
   Engine resolution: `data.engine or profile.default_engine or profile.preset_engine or "kokoro"` (generations.py:158).

## Worked example
```bash
curl -X POST http://localhost:17493/generate -H 'content-type: application/json' -d '{
  "profile_id": "prof_clone_01", "text": "Hello from 21labs",
  "engine": "fish_speech", "language": "en", "seed": 42
}'
```

## Pitfalls / Gotchas
- `fish_speech` IS in `CLONING_ENGINES` (`services/profiles.py:26-32` = {fish_speech, zonos, styletts2, f5_tts, pocket_tts}), so it works both as a cloned profile and via direct `engine="fish_speech"` in `POST /generate`.
- 2000MB download (S1-mini 0.5B); requires torch + fish-speech package (`pip install fish-speech`).

## Cross-links
- [engine-atlas](../engine-atlas/SKILL.md)
- [voice-profiles](../voice-profiles/SKILL.md)
- [voice-cloning](../voice-cloning/SKILL.md)

## Validation
- Output WAV at 44100 Hz. Confirm a clone matches the reference timbre; if `seed` set, identical text+seed → identical audio.
