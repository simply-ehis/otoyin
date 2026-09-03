# 14 — Voice Profiles

## Overview
- **What:** Reusable voice configurations that store reference audio, engine preferences, and character personality for consistent voice generation.

## Voice Profile Types

### Cloned
- **What:** Voice cloned from a reference audio sample.
- **Creation:** Upload or record audio → engine processes into a voice prompt
- **Engines:** Qwen3-TTS, LuxTTS, Chatterbox, Chatterbox Turbo, TADA
- **Storage:** Voice prompt (pre-computed tensor or file path) cached per engine

### Preset
- **What:** Built-in voice from an engine's preset library.
- **Creation:** Select engine → choose from preset voice list
- **Engines:** Kokoro (48 voices), Qwen CustomVoice (9 speakers)
- **Storage:** Engine name + voice ID

### Designed
- **What:** Voice created from a text description.
- **Creation:** Enter a character description → engine generates a unique voice
- **Engines:** Qwen CustomVoice only
- **Storage:** Design prompt text

## Profile Data Model

### VoiceProfileResponse
- `id` (string): Profile ID
- `name` (string): Display name
- `description` (string, optional): Description
- `language` (LanguageCode): Target language
- `avatar_path` (string, optional): Profile image path
- `voice_type` ("cloned" | "preset" | "designed"): How the voice was created
- `preset_engine` (string, optional): Engine for preset voices
- `preset_voice_id` (string, optional): Voice ID within engine
- `design_prompt` (string, optional): Text description for designed voices
- `default_engine` (string, optional): Preferred TTS engine
- `personality` (string, optional): Character personality description
- `effects_chain` (array, optional): Default effects for this voice

## Profile Operations

### Create Profile
- **Where:** `POST /profiles`
- **Request:** VoiceProfileCreate (see types)
- **Returns:** VoiceProfileResponse

### List Profiles
- **Where:** `GET /profiles`
- **Returns:** Array of VoiceProfileResponse

### Update Profile
- **Where:** `PUT /profiles/{id}`
- **Request:** Partial VoiceProfileCreate

### Delete Profile
- **Where:** `DELETE /profiles/{id}`

## Voice Prompt Caching
- **What:** Engine-specific voice prompts are cached to avoid re-processing the same reference audio.
- **Pattern A (Pre-computed tensors):** Qwen3, LuxTTS, TADA — compute prompt at creation time, store as dict
- **Pattern B (Deferred file paths):** Chatterbox — store file path, process at generation time

## Agent Callable
- **MCP Tools:** `21labs.list_profiles`, `21labs.speak`, `21labs.list_captures`
- **REST Endpoints:** `POST /profiles`, `GET /profiles`, `GET /profiles/{id}`, `PUT /profiles/{id}`, `DELETE /profiles/{id}`, `POST /profiles/{id}/samples`, `GET /profiles/{id}/samples`, `DELETE /profiles/samples/{id}`, `POST /profiles/import`, `GET /profiles/{id}/export`, `POST /profiles/{id}/avatar`, `GET /profiles/{id}/avatar`, `DELETE /profiles/{id}/avatar`, `PUT /profiles/{id}/channels`, `GET /profiles/{id}/channels`, `PUT /profiles/{id}/effects`, `POST /profiles/{id}/compose`, `GET /profiles/presets/{engine}`
- **Key Backend Files:** `backend/services/profiles.py`, `backend/routes/profiles.py`
- **Key Frontend Files:** `app/src/components/VoicesTab/VoicesTab.tsx`, `app/src/components/VoicesTab/VoiceInspector.tsx`, `app/src/components/VoiceProfiles/ProfileForm.tsx`, `app/src/components/VoiceProfiles/QuickCloneDialog.tsx`
