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

1. **Profile-layer `CLONING_ENGINES`** (`services/profiles.py:26-34`):
   `{fish_speech, zonos, styletts2, f5_tts, pocket_tts}`.
   A cloned `VoiceProfile` may ONLY route to one of these at generate time
   (`validate_profile_engine` / check at profiles.py:116,139,562 raises if engine ∉ set).

2. **Backend-level cloning** (each backend can encode a reference at gen time):
   | engine | mechanism | langs | clone via |
   |--------|-----------|-------|----------|
   | `fish_speech` | zero-shot | 13 | member of CLONING_ENGINES |
   | `zonos` | clone + emotion | 5 | member of CLONING_ENGINES |
   | `styletts2` | clone | 1 (en) | member of CLONING_ENGINES |
   | `f5_tts` | zero-shot | 2 (en,zh) | member of CLONING_ENGINES |
   | `pocket_tts` | clone | 6 | member of CLONING_ENGINES |
   | `moss_tts_nano` | zero-shot | 20 | gen-time only (ONNX) |
   | `neutts` / `neutts_2e` | zero-shot GGUF | 1 (en) | gen-time only |
   | `kokoro` | **NONE** | — | presets + `.pt` packs only; NO cloning |

   REMOVED engines (no backend modules; `ValueError: Unknown TTS engine`):
   `qwen`, `qwen_custom_voice`, `step_audio_editx`, `pocket_emo`, `luxtts`, `chatterbox`,
   `chatterbox_turbo`, `tada`, `piper`, `xtts_v2`.

## Agent procedure
1. Pick engine: tiny CPU → `pocket_tts` (200MB) or `kokoro` (presets only); multilingual zero-shot → `moss_tts_nano` (20 langs) or `fish_speech` (13); premium EN/ML quality → `zonos`; English clone → `styletts2`; GGUF CPU clone → `neutts` / `neutts_2e`.
2. Create a cloned profile: `POST /profiles` `{name, voice_type:"cloned", default_engine:"<chosen>"}` — `default_engine` MUST be in `CLONING_ENGINES`. For engines outside the set (`moss_tts_nano`, `neutts`, `neutts_2e`), route via `engine="..."` in `POST /generate` instead of a cloned profile.
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
- **Two clone paths:** CLONING_ENGINES (profiles.py:26-34) is the only set a `voice_type:"cloned"` profile can use. `moss_tts_nano`, `neutts`, `neutts_2e` clone at the backend level but are NOT in `CLONING_ENGINES` — pass `engine` directly in `POST /generate`. Kokoro / ChatTTS / Parler / Kitten / Orpheus cannot clone at all.
- `reference_text` is mandatory on sample upload even when the engine transcribes internally.
- Language is baked into the encoded prompt at clone time — changing `language` later won't re-align.

## Fallback when target engine missing
- Not downloaded → `POST /models/download` for that HF repo, then `POST /models/load`.
- Engine unavailable / too large → fall back down the ladder: `zonos`(2GB) or `orpheus`(2.4-4GB) → `fish_speech` (2GB) → `pocket_tts` (200MB). Re-encode the same reference sample on the fallback engine (each engine encodes independently).
- Language unsupported by fallback → pick the smallest engine covering it (e.g. `fish_speech` for 13, `moss_tts_nano` for 20).

## Cross-links
- [voice-profiles](../voice-profiles/SKILL.md)
- [engine-atlas](../engine-atlas/SKILL.md)

## Validation
- Generate with a fixed seed twice from the same profile+text → byte-identical (or near-identical) audio. Timbre matches the reference sample to the ear.
