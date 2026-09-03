---
name: tts-qwen
description: Generate speech with Qwen3-TTS Base (0.6B/1.7B) — zero-shot voice cloning via reference audio, 10 langs, PyTorch on Windows; supports_instruct=False.
---

# Qwen3-TTS (Base)

> **REMOVED — 2026-08.** The `qwen` engine is no longer registered in `TTS_ENGINES`
> (`backend/backends/protocols.py::TTS_ENGINES`); no `pytorch_backend.py` / `mlx_backend.py`
> exists, and `get_tts_backend_for_engine` raises `ValueError: Unknown TTS engine`.
> This page is retained for historical reference only — do not use it for current work.
> Default engine is now `kokoro`; zero-shot cloning lives in `fish_speech`, `zonos`,
> `f5_tts`, `pocket_tts` (see [engine-atlas](../engine-atlas/SKILL.md)).

## Purpose
Qwen3-TTS Base (`Qwen/Qwen3-TTS-12Hz-*B-Base`) is the default zero-shot voice-clone engine
in otoyin. It clones from reference audio via `create_voice_clone_prompt` + `generate_voice_clone`.
Two sizes: 0.6B (1200 MB) and 1.7B (3500 MB). 10 languages. **`supports_instruct=False`** —
the Base checkpoint silently drops any `instruct` parameter (use `../tts-qwen-custom-voice/SKILL.md`
for instruct-driven style).

## When to use
- Need zero-shot cloning from arbitrary reference audio (not preset blending).
- 10-language generation (zh,en,ja,ko,de,fr,ru,pt,es,it).
- Default engine when no engine is specified to `21labs.speak`.

## Prerequisites
- Engine/model: `qwen` — `Qwen/Qwen3-TTS-12Hz-0.6B-Base` (1200 MB) or
  `Qwen/Qwen3-TTS-12Hz-1.7B-Base` (3500 MB). On Apple Silicon the backend auto-routes to
  `mlx-community/...-bf16` via `get_backend_type()`.
- Tool surface: MCP `21labs.speak`; REST `POST /speak`.
- Voice/profile: `clone` profile → reference audio + transcript. PyTorch backend (Windows).

## Parameters / Schema (REAL from `pytorch_backend.py` + `__init__.py`)
| param | range | default | notes |
|-------|-------|---------|-------|
| engine | `qwen` | `qwen` | default TTS engine |
| model_size | `0.6B`, `1.7B` | `1.7B` | (`_current_model_size`) |
| language | zh,en,ja,ko,de,fr,ru,pt,es,it | `en` | mapped via `LANGUAGE_CODE_TO_NAME` |
| instruct | string | none | **IGNORED by Base** (`supports_instruct=False`) |
| seed | int | none | `manual_seed` before generate |
| ref_audio | file path | — | required for clone; `create_voice_clone_prompt(ref_audio, ref_text)` |
| ref_text | string | — | transcript of reference audio |
| x_vector_only_mode | bool | false | passed to `create_voice_clone_prompt` |

## Agent procedure
1. Download a size: `21labs.models_download(model_name="qwen-tts-0.6B")` or `"qwen-tts-1.7B"`.
2. Create a `clone` profile (`POST /profiles`, mode `clone`) — backend caches the voice
   prompt tensor per `(audio_path, reference_text)` via `get_cache_key()` (Pattern A).
3. Generate:
   - MCP: `21labs.speak(text=..., profile="<clone>", engine="qwen", language="en")`
   - REST: `POST /speak` `{"text": "...", "engine": "qwen", "language": "en"}`
4. Backend: `create_voice_clone_prompt` → `generate_voice_clone(text, voice_clone_prompt, language, instruct=None)`.

## Worked example
```python
21labs.speak(
    text="The quarterly report is ready.",
    engine="qwen",
    profile="Qwen Clone (ref.wav)",
    language="en",
)
# instruct is NOT passed — Base drops it.
```

## Pitfalls / Gotchas
- **`supports_instruct=False`.** Base silently ignores `instruct`. For natural-language
  style ("angry tone") use Qwen CustomVoice (`../tts-qwen-custom-voice/SKILL.md`).
- Reference transcript (`ref_text`) matters for prompt quality.
- On CPU the model loads `torch.float32`; on GPU `device_map` + `bfloat16`.
- Voice prompt tensors are cached — reusing the same reference is cheap.
- Long text uses the engine-agnostic chunked path (default 800 chars, crossfade 50 ms).

## Cross-links
- [engine-atlas](../engine-atlas/SKILL.md)
- [voice-cloning](../voice-cloning/SKILL.md)
- [voice-profiles](../voice-profiles/SKILL.md)
- [tts-qwen-custom-voice](../tts-qwen-custom-voice/SKILL.md)

## Validation
- `models_status` shows `qwen-tts-*` cached. Clone profile `voice_type=clone` with cached
  prompt. Generation `status=completed`; verify cloned timbre vs reference via listening.
