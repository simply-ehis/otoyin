# 01 — Voice Studio

## UI Routes

### Generate Tab at `/`
- **Component:** `MainEditor`
- **What:** Main TTS interface. Engine/model selector, voice profile picker, Floating Generate Box for text input with emotion/instruct controls.
- **Features:** Engine selector filters by language compatibility, voice profile selector, generate button streams WAV output.

### Workspace Studio Tab at `/workspace/studio`
- **Component:** `StudioView`
- **What:** 3 sub-tabs for audio generation beyond TTS.
- **Sub-tabs:** Instruments (piano keys, drum pads, synth ADSR, drum machine), SFX (Stable Audio prompt), Noise (type selector).

## TTS Engines

### Live lineup (13 engines, `TTS_ENGINES` in `backend/backends/protocols.py`)
| Engine | Backend file | Notes |
|--------|--------------|-------|
| `kokoro` | `kokoro_backend.py` / `kokoro_onnx_backend.py` | 82M, CPU realtime, 48 preset voices |
| `fish_speech` | `fish_speech_backend.py` | S1-mini, zero-shot clone |
| `zonos` | `zonos_backend.py` | Zyphra Zonos, zero-shot clone |
| `styletts2` | `styletts2_backend.py` / `styletts2_onnx_backend.py` | zero-shot clone |
| `chattts` | `chattts_backend.py` | zero-shot clone |
| `f5_tts` | `f5_tts_backend.py` / `f5_tts_onnx_backend.py` | zero-shot clone |
| `pocket_tts` | `pocket_tts_backend.py` / `pocket_tts_onnx_backend.py` | zero-shot clone |
| `parler_tts` | `parler_tts_backend.py` | text-description voices (voice_design) |
| `moss_tts_nano` | `moss_tts_nano_onnx_backend.py` | |
| `kitten_tts` | `kitten_tts_onnx_backend.py` | mini |
| `neutts` | `neutts_backend.py` | NeuTTS-Air |
| `neutts_2e` | `neutts_backend.py` | NeuTTS-2E |
| `orpheus` | `orpheus_backend.py` | 3B |

### Kokoro (Required Minimum)
- **What:** 82M-parameter TTS engine, CPU realtime, 24kHz output, 8 languages. Uses pre-built voice style vectors (not cloning from arbitrary audio). 48 preset voices.
- **Where:** `backend/backends/kokoro_backend.py` → `KokoroTTSBackend`
- **Parameters:**
  - `text` (string, required): Text to synthesize
  - `voice` (string): Voice ID from KOKORO_VOICES preset list
  - `language` (string): Language code (en, ja, zh, etc.)

> **Removed engines (2026-08):** Qwen3-TTS Base/MLX (`pytorch_backend.py`, `mlx_backend.py`),
> Qwen CustomVoice (`qwen_custom_voice_backend.py`), Step-Audio-EditX, Pocket-TTS EmoShift.
> Earlier removals: LuxTTS, Chatterbox, Chatterbox Turbo, TADA, Piper, XTTS-v2. See
> `.agents/skills/engine-atlas/SKILL.md` for the full picture.

## Voice Cloning

### Voice Profile Creation
- **What:** Create reusable voice profiles from uploaded/recorded audio or built-in presets.
- **Where:** `app/src/components/VoiceProfiles/ProfileForm.tsx`
- **Modes:**
  - `clone`: Upload or record reference audio. Creates a voice prompt cached per engine.
  - `builtin`: Select from engine's preset voice library (e.g., Kokoro's 48 voices)

> `designed` (text-description) mode belonged to Qwen CustomVoice (removed 2026-08).

### Voice Profile List
- **What:** Browse, search, and manage saved voice profiles.
- **Where:** `app/src/components/VoiceProfiles/VoiceProfileList.tsx`
- **Features:** Filter by type (cloned/preset), search by name, delete, edit

## Generation UI

### Engine/Model Selector
- **What:** Dropdown to select TTS engine and model size.
- **Where:** `app/src/components/Generation/EngineModelSelector.tsx`
- **Behavior:** Shows available engines, filters by language compatibility, displays model descriptions.

### Floating Generate Box
- **What:** Main text input for TTS generation with text, voice, and emotion controls.
- **Where:** `app/src/components/Generation/FloatingGenerateBox.tsx`
- **Parameters:**
  - `text` (string, required): Script text to synthesize
  - `voice_profile_id` (string): Selected voice profile
  - `engine` (string): Selected TTS engine

## Agent Callable
- **MCP Tools:** `21labs.speak`, `21labs.list_profiles`, `21labs.list_models`, `21labs.list_captures`
- **REST Endpoints:** `POST /generate`, `GET /profiles`, `GET /profiles/presets/{engine}`, `POST /profiles`, `PUT /profiles/{id}`, `DELETE /profiles/{id}`, `GET /models/status`, `POST /generate/{id}/retry`, `POST /generate/{id}/regenerate`, `POST /generate/stream`
- **Key Backend Files:** `backend/services/generation.py`, `backend/services/profiles.py`, `backend/routes/generations.py`, `backend/routes/profiles.py`, `backend/backends/protocols.py`
- **Key Frontend Files:** `app/src/components/Generation/FloatingGenerateBox.tsx`, `app/src/components/Generation/EngineModelSelector.tsx`, `app/src/components/VoicesTab/VoicesTab.tsx`, `app/src/components/VoicesTab/VoiceInspector.tsx`, `app/src/stores/uiStore.ts`