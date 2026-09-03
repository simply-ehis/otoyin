---
name: tts-qwen-custom-voice
description: Generate speech with Qwen3-TTS CustomVoice (0.6B/1.7B) — 9 preset speakers with natural-language instruct style control (supports_instruct=True); contrast with Base Qwen.
---

# Qwen3-TTS CustomVoice

> **REMOVED — 2026-08.** The `qwen_custom_voice` engine is no longer registered in
> `TTS_ENGINES` (`backend/backends/protocols.py::TTS_ENGINES`); no
> `qwen_custom_voice_backend.py` exists, and `get_tts_backend_for_engine` raises
> `ValueError: Unknown TTS engine`. This page is retained for historical reference only —
> do not use it for current work. Instruct-style expressiveness is covered today by
> `zonos` (emotion control). See [engine-atlas](../engine-atlas/SKILL.md).

## Purpose
Qwen CustomVoice (`Qwen/Qwen3-TTS-12Hz-*B-CustomVoice`) uses **9 built-in preset speakers**
plus **natural-language `instruct`** style control ("Speak in an angry tone"). Unlike Base
Qwen it does NOT clone from arbitrary reference audio — it picks a preset speaker and styles
it via `instruct`. **`supports_instruct=True`.** Two sizes: 0.6B (1200 MB) / 1.7B (3500 MB).
10 languages.

## When to use
- Need expressive, instruct-driven style (emotion/prosody) without a reference recording.
- Want a consistent preset speaker (Vivian, Ryan, Sohee, …) across generations.
- User explicitly picks `qwen_custom_voice` engine.

## Prerequisites
- Engine/model: `qwen_custom_voice` — `Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice` (1200 MB) or
  `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice` (3500 MB).
- Tool surface: MCP `21labs.speak`; REST `POST /speak`.
- Voice/profile: `preset` profile with `preset_voice_id` = speaker name, OR `designed`
  profile (text description → CustomVoice only).

## Parameters / Schema (REAL from `qwen_custom_voice_backend.py` + `__init__.py`)
| param | range | default | notes |
|-------|-------|---------|-------|
| engine | `qwen_custom_voice` | — | |
| model_size | `0.6B`, `1.7B` | `1.7B` | |
| speaker / preset_voice_id | Vivian, Serena, Uncle_Fu, Dylan, Eric, Ryan, Aiden, Ono_Anna, Sohee | `Ryan` (`QWEN_CV_DEFAULT_SPEAKER`) | 9 preset speakers |
| language | zh,en,ja,ko,de,fr,ru,pt,es,it | `en` | native langs: zh/ja/ko speakers exist |
| instruct | string | none | **supported** → `generate_custom_voice(instruct=...)` |
| seed | int | none | `manual_seed` |

Native-language speakers: Vivian/Serena/Uncle_Fu/Dylan/Eric = zh; Ryan/Aiden = en;
Ono_Anna = ja; Sohee = ko. `instruct` is only forwarded when non-empty.

## Agent procedure
1. Download: `21labs.models_download(model_name="qwen-custom-voice-0.6B")` or `"-1.7B"`.
2. Create a `preset` voice profile with `preset_engine="qwen_custom_voice"` and
   `preset_voice_id` = one of the 9 speakers (or a `designed` profile for text-to-voice).
3. Generate with an instruct string:
   - MCP: `21labs.speak(text=..., profile="<cv profile>", engine="qwen_custom_voice", language="en")`
   - REST: `POST /speak` `{"text": "...", "engine": "qwen_custom_voice", "language": "en"}`
4. Backend calls `model.generate_custom_voice(text, language, speaker, instruct=...)`.

## Worked example
```python
21labs.speak(
    text="Welcome aboard, Captain.",
    engine="qwen_custom_voice",
    profile="Ryan (excited)",
    language="en",
)
# profile.preset_voice_id="Ryan"; pair with instruct via the UI emotion control
```

## Pitfalls / Gotchas
- **No zero-shot clone.** CustomVoice uses preset speakers, NOT arbitrary reference audio.
  For a real clone use `../tts-qwen/SKILL.md` (Base) or see `../engine-atlas/SKILL.md`
  for CLONING_ENGINES (zonos / f5_tts / fish_speech).
- **`instruct` is the key difference vs Base Qwen** (Base's `supports_instruct=False` drops it).
- `language` is capitalized/Auto-mapped (`LANGUAGE_CODE_TO_NAME`) before `generate_custom_voice`.
- On CPU loads `torch.float32`; GPU uses `device_map` + `bfloat16`.
- `designed` voices (text description) are supported ONLY by this engine.

## Cross-links
- [engine-atlas](../engine-atlas/SKILL.md)
- [voice-cloning](../voice-cloning/SKILL.md)
- [voice-profiles](../voice-profiles/SKILL.md)
- [tts-qwen](../tts-qwen/SKILL.md)

## Validation
- Profile `preset_voice_id` ∈ the 9 speakers. Generation `status=completed`; verify the
  instructed emotion is audible. `models_status` shows `qwen-custom-voice-*` cached.
