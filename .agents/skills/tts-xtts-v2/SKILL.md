---
name: tts-xtts-v2
description: Generate speech with XTTS v2 — the true zero-shot voice cloning engine (14 langs) for cloning from short reference audio; coqui/XTTS-v2.
---

# XTTS v2 (Zero-Shot Clone)

> **REMOVED — 2026-07.** The `xtts_v2` engine is no longer registered in `TTS_ENGINES`
> (`backend/backends/protocols.py::TTS_ENGINES`); no `xtts_backend.py` exists, and
> `get_tts_backend_for_engine` raises `ValueError: Unknown TTS engine`.
> This page is retained for historical reference only — do not use it for current work.
> For cloning, use `21labs.clone_voice` with `qwen3_tts`, `pocket_tts`, or another
> supported engine. See [engine-atlas](../engine-atlas/SKILL.md).

## Purpose
XTTS v2 (`coqui/XTTS-v2`, 1800 MB) is otoyin's **true zero-shot voice cloning** engine.
Given a short reference clip it produces conditioning latents (`get_conditioning_latents`)
and synthesizes any text in that voice — no preset library, no fine-tune. This is the engine
to reach for whenever a *real* clone from arbitrary audio is required. 14 languages.
License: CPML (free for non-commercial).

## When to use
- User needs to clone a real voice from a reference recording (the canonical clone case).
- Kokoro blending / Qwen preset speakers are insufficient.
- 14-language generation (en,zh,ja,ko,de,fr,ru,pt,es,it,ar,pl,tr,nl,cs,hu,vi).

## Prerequisites
- Engine/model: `xtts_v2` — `coqui/XTTS-v2` (1800 MB). Required files: `model.pth`,
  `config.json`, `vocab.json`. Install `pip install TTS`.
- Tool surface: MCP `21labs.speak`; REST `POST /speak`.
- Voice/profile: `clone` profile → reference audio (`audio_path`). Output 24 kHz (`XTTS_SAMPLE_RATE`).

## Parameters / Schema (REAL from `xtts_backend.py` + `__init__.py`)
| param | range | default | notes |
|-------|-------|---------|-------|
| engine | `xtts_v2` | — | |
| language | en,zh,ja,ko,de,fr,ru,pt,es,it,ar,pl,tr,nl,cs,hu,vi | `en` | passed to `inference(language=...)` |
| audio_path | file path | — | reference clip (~6 s recommended) |
| reference_text | string | — | stored in voice prompt (transcript) |
| temperature | float | 0.75 | `model.inference(temperature=0.75)` |
| seed | int | none | `manual_seed` |
| gpt_cond_len / max_ref_len / sound_norm_refs | from `model.config` | model defaults | used by `get_conditioning_latents` |

## Agent procedure
1. Download: `21labs.models_download(model_name="xtts-v2")`.
2. Create a `clone` profile (`POST /profiles`, mode `clone`) from the reference audio.
   `create_voice_prompt` returns `{"voice_type":"clone","audio_path","reference_text"}`.
3. Generate:
   - MCP: `21labs.speak(text=..., profile="<clone>", engine="xtts_v2", language="en")`
   - REST: `POST /speak` `{"text": "...", "engine": "xtts_v2", "language": "en"}`
4. Backend: `get_conditioning_latents(audio_path=...)` → `inference(text, language, gpt_cond_latent, speaker_embedding, temperature=0.75)`.

## Worked example
```python
21labs.speak(
    text="Hello, I am your cloned assistant voice.",
    engine="xtts_v2",
    profile="Real Clone (ref.wav)",
    language="en",
)
```

## Pitfalls / Gotchas
- **This is the clone engine** — Kokoro (blending only) and Qwen CustomVoice (preset
  speakers) cannot do true zero-shot cloning. See `../voice-cloning/SKILL.md`.
- Reference audio quality/duration strongly affects clone fidelity (aim ~6 s, clean).
- CPML license — non-commercial free only; confirm licensing before commercial use.
- `temperature=0.75` is fixed in the backend (`[VERIFY IN CODE]` for override).
- Output is 24 kHz mono. Long text uses the engine-agnostic chunked path (default 800 chars).

## Cross-links
- [engine-atlas](../engine-atlas/SKILL.md)
- [voice-cloning](../voice-cloning/SKILL.md)
- [voice-profiles](../voice-profiles/SKILL.md)

## Validation
- Profile `voice_type=clone` with `audio_path`. Conditioning latents computed without error.
  Generation `status=completed` at 24 kHz; verify cloned timbre matches reference by ear.
