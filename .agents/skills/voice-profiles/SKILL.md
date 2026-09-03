---
name: voice-profiles
description: Create, list, and assign otoyin voice profiles (preset vs cloned vs designed) and query engine presets via REST /profiles and MCP 21labs.list_profiles.
---

# Voice Profiles

## Purpose
A Voice Profile is a reusable voice configuration: it stores a name, voice
type (cloned / preset / designed), engine preference, and optional
personality/effects so generation stays consistent. Profiles decouple a
"character" from the underlying TTS engine and are referenced by every
`POST /generate` call via `profile_id`.

## When to use
- User wants to save a voice for reuse, assign it to a channel, or pick a preset voice.
- Listing available preset voices for an engine, or enumerating saved profiles.
- Attaching reference samples for a cloned voice.

## Prerequisites
- Tool surface: REST `/profiles/*` | MCP `21labs.list_profiles`.
- Engine: depends on `voice_type` (see [voice-cloning](../voice-cloning/SKILL.md) for clone-capable engines).

## Parameters / Schema (from backend/models.py, backend/routes/profiles.py)
`VoiceProfileCreate` fields:
| field | type | range / default | notes |
|-------|------|-----------------|-------|
| name | str | 1–100 chars | required |
| description | str\|None | ≤500 | |
| language | str | default `en`; pattern `^(zh\|en\|ja\|ko\|de\|fr\|ru\|pt\|es\|it\|he\|ar\|da\|el\|fi\|hi\|ms\|nl\|no\|pl\|sv\|sw\|tr)$` | |
| voice_type | str | `cloned`\|`preset`\|`designed` (default `cloned`) | |
| preset_engine | str\|None | ≤50 | required if `preset` |
| preset_voice_id | str\|None | ≤100 | required if `preset` |
| design_prompt | str\|None | ≤2000 | required if `designed` (or `voice_attributes`) |
| voice_attributes | dict\|None | `{"gender", "age", "accent", "tone", "style", "pacing"}` | alternative to `design_prompt` for `designed` profiles; auto-composed into a natural-language description |
| default_engine | str\|None | ≤50 | must be in `CLONING_ENGINES` for cloned profiles |
| personality | str\|None | ≤2000 | in-character rewrite prompt |

`ProfileChannelAssignment`: `{channel_ids: List[str]}` (PUT /profiles/{id}/channels).
Sample upload: `POST /profiles/{id}/samples` — multipart `file` (≤50MB, allowed ext wav/mp3/m4a/ogg/flac/aac/webm/opus) + form `reference_text` (≤1000 chars, required).

## Agent procedure
1. List existing profiles: `GET /profiles` (or `21labs.list_profiles`).
2. List a clone-capable engine's presets is N/A; presets exist for `kokoro`:
   `GET /profiles/presets/kokoro` (48 voices via `KOKORO_VOICES`). The route reads
   `structured_preset_voices` from the model catalog, so any engine with preset voices is
   covered automatically.
3. Create preset profile: `POST /profiles` `{name, voice_type:"preset", preset_engine, preset_voice_id}`. `default_engine` auto-set to `preset_engine` if omitted.
4. Create cloned profile: `POST /profiles` `{name, voice_type:"cloned", default_engine:"<clone engine>"}`, then `POST /profiles/{id}/samples` with reference audio + text.
5. Assign to channels: `PUT /profiles/{id}/channels` `{channel_ids:[...]}`; read back with `GET /profiles/{id}/channels`.

## Worked example
```bash
curl -X POST http://localhost:17493/profiles -H 'content-type: application/json' -d '{
  "name": "Narrator", "voice_type": "preset",
  "preset_engine": "kokoro", "preset_voice_id": "af_bella", "language": "en"
}'
curl http://localhost:17493/profiles/presets/kokoro
```

## Pitfalls / Gotchas
- Preset profiles must set BOTH `preset_engine` and `preset_voice_id`; `default_engine` must equal `preset_engine` or the create is rejected (profiles.py:87-91).
- Cloned profiles cannot set `preset_*` or `design_prompt`; `default_engine` must be in `CLONING_ENGINES = {fish_speech,zonos,styletts2,f5_tts,pocket_tts}` (profiles.py:26-34).
- `reference_text` is REQUIRED on sample upload even for engines that transcribe internally.
- `GET /profiles/presets/{engine}` returns `{"voices":[]}` for engines without preset voices (only `kokoro` has any today).

## Cross-links
- [voice-cloning](../voice-cloning/SKILL.md)
- [engine-atlas](../engine-atlas/SKILL.md)

## Validation
- `GET /profiles` returns the created profile with an `id`. A subsequent `POST /generate` with that `profile_id` uses its voice. Channel assignment reflected by `GET /profiles/{id}/channels`.
