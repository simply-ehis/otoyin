---
name: voice-cloning
description: Cross-engine voice cloning methodology for otoyin — which engines clone, how to supply reference samples, quality issues, and fallbacks when the target engine is missing.
---

# Voice Cloning (Cross-Engine)

## Purpose
Voice cloning turns a reference audio sample into a reusable voice. otoyin
supports cloning on several engines, each with a different mechanism
(zero-shot, custom-voice, reference-conditioned). This skill tells you which
engine to pick, how to feed it a sample, and what to do when the requested
engine is unavailable.

## When to use
- User supplies reference audio and wants "that voice" generated.
- Choosing the best clone engine for the target language / hardware.
- The preferred clone engine is not downloaded or not installed.

## Prerequisites
- Tool surface: REST `POST /profiles/{id}/samples` + `POST /generate`.
- A reference clip (≤50MB; wav/mp3/m4a/ogg/flac/aac/webm/opus). Clean, single-speaker audio works best.

## Clone-capable engines (backend-level vs profile-layer)
Backend code shows two distinct truths — document BOTH:

1. **Profile-layer `CLONING_ENGINES`** (`services/profiles.py:146-157`):
   `{zonos_gguf, styletts2, qwen3_tts, pocket_tts, moss_tts_nano, neutts, neutts_2e, parler_tts_gguf, orpheus, bark_small}`.
   A cloned `VoiceProfile` may ONLY route to one of these at generate time.
   Do not use `styletts2`: it is in the validation set but has no registered backend.
   `fish_speech_s2`, `kokoro`, `kitten_tts`, and `voxcpm2` are NOT in this set.

2. **Backend-level cloning** (each backend can encode a reference at gen time):
   | engine | mechanism | clone via |
   |--------|-----------|----------|
   | `zonos_gguf` | clone + emotion | cloned profile |
   | `qwen3_tts` | zero-shot reference | cloned profile |
   | `pocket_tts` | clone | cloned profile |
   | `moss_tts_nano` | zero-shot | cloned profile |
   | `neutts` / `neutts_2e` | zero-shot GGUF | cloned profile |
   | `parler_tts_gguf` | voice design/reference support | cloned or designed profile |
   | `orpheus` | high-quality English | cloned profile |
   | `bark_small` | non-verbal/reference sounds | cloned profile |
   | `kokoro` | **NONE** | presets + `.pt` packs only; NO cloning |

   REMOVED engines (no backend modules; `ValueError: Unknown TTS engine`):
   `qwen`, `qwen_custom_voice`, `step_audio_editx`, `pocket_emo`, `luxtts`, `chatterbox`,
   `chatterbox_turbo`, `tada`, `piper`, `xtts_v2`.

## Agent procedure
1. Pick engine: preset-first with `kokoro`, `kitten_tts`, or another engine that has preset voices. For cloning, prefer tiny CPU `pocket_tts`, then `qwen3_tts`, `moss_tts_nano`, `neutts`/`neutts_2e`, then heavier `zonos_gguf` or `orpheus`.
2. Create a cloned profile: `POST /profiles` `{name, voice_type:"cloned", default_engine:"<chosen>"}` — `default_engine` MUST be in the current `CLONING_ENGINES`, except never use `styletts2` because it has no backend.
3. Upload sample: `POST /profiles/{id}/samples` with `file` + `reference_text` (required, ≤1000 chars).
4. Generate: `POST /generate` `{profile_id, text, engine, language, seed}`.

## Worked example (profile clone)
```bash
curl -X POST http://localhost:17493/profiles -H 'content-type: application/json' -d '{
  "name":"Guest","voice_type":"cloned","default_engine":"pocket_tts"}'
curl -X POST http://localhost:17493/profiles/<id>/samples -F "file=@ref.wav" -F "reference_text=Hello there"
curl -X POST http://localhost:17493/generate -H 'content-type: application/json' -d '{
  "profile_id":"<id>","text":"Welcome.","engine":"pocket_tts"}'
```

## Pitfalls / Gotchas
- **Two clone paths:** the current profile-layer set is the only set a `voice_type:"cloned"` profile can use, except `styletts2`, which has no backend. Do not use deleted or unregistered engine IDs. Kokoro cannot clone at all.
- `reference_text` is mandatory on sample upload even when the engine transcribes internally.
- Language is baked into the encoded prompt at clone time — changing `language` later won't re-align.

## Fallback when target engine missing
- Not downloaded → `POST /models/download` for that HF repo, then `POST /models/load`.
- Engine unavailable / too large → fall back down the ladder: preset voices first, then `pocket_tts` (200MB), `qwen3_tts`, `moss_tts_nano`, `neutts`/`neutts_2e`, then `zonos_gguf` or `orpheus`. Re-encode the same reference sample on the fallback engine (each engine encodes independently).
- Language unsupported by fallback → pick the smallest engine covering it.

## Cross-links
- [voice-profiles](../voice-profiles/SKILL.md)
- [engine-atlas](../engine-atlas/SKILL.md)

## Validation
- Generate with a fixed seed twice from the same profile+text → byte-identical (or near-identical) audio. Timbre matches the reference sample to the ear.
