---
name: tts-chatterbox
description: Generate speech with Chatterbox TTS — multilingual (~20 langs) reference-conditioned voice, exaggeration/cfg/temperature knobs, needs_trim trailing-silence handling.
---

# Chatterbox TTS (Multilingual)

> **REMOVED — 2026-07.** The `chatterbox` engine is no longer registered in
> `TTS_ENGINES` (`backend/backends/protocols.py::TTS_ENGINES`); no `chatterbox_backend.py`
> exists, and `get_tts_backend_for_engine` raises `ValueError: Unknown TTS engine`.
> This page is retained for historical reference only — do not use it for current work.
> For cloning, use `21labs.clone_voice` with `qwen3_tts`, `pocket_tts`, or another
> supported engine. See [engine-atlas](../engine-atlas/SKILL.md).

## Purpose
Chatterbox (ResembleAI/chatterbox, 3200 MB) is a reference-conditioned, multilingual TTS
engine. It is NOT zero-shot cloning in the XTTS sense — it conditions on reference audio
passed at generation time to imitate a voice ("clone-ish"). Supports ~20 languages with
per-language generation defaults. Output may include trailing silence, so it is flagged
`needs_trim=True`.

## When to use
- User wants expressive, reference-conditioned speech across many languages.
- Need `exaggeration` / `cfg_weight` / `temperature` emotional control.
- A real arbitrary-audio clone (true zero-shot) is required → use a supported clone engine instead; see [engine-atlas](../engine-atlas/SKILL.md).

## Prerequisites
- Engine/model: `chatterbox` — `ResembleAI/chatterbox` (3200 MB). Required weights:
  `t3_mtl23ls_v2.safetensors`, `s3gen.pt`, `ve.pt`.
- Tool surface: MCP `21labs.speak`; REST `POST /speak`.
- Voice/profile: a `clone` profile (reference audio) → `audio_prompt_path`. `needs_trim=True`.

## Parameters / Schema (REAL from `chatterbox_backend.py`)
| param | range | default | notes |
|-------|-------|---------|-------|
| engine | `chatterbox` | — | |
| language | ~20 langs (zh,en,ja,ko,de,fr,ru,pt,es,it,he,ar,da,el,fi,hi,ms,nl,no,pl,sv,sw,tr) | `en` | BCP-47; passed as `language_id` |
| exaggeration | float | 0.5 global / 0.4 (he) | emotion intensity |
| cfg_weight | float | 0.5 global / 0.7 (he) | classifier-free guidance weight |
| temperature | float | 0.8 global / 0.65 (he) | sampling temperature |
| repetition_penalty | float | 2.0 global / 2.5 (he) | |
| seed | int | none | reproducible via `manual_seed` |
| audio_prompt_path | file path | none | reference audio; missing file → silently ignored (None) |

Hebrew has its own tuned defaults (`_LANG_DEFAULTS["he"]`). All other langs use
`_GLOBAL_DEFAULTS`.

## Agent procedure
1. Download: `21labs.models_download(model_name="chatterbox-tts")`.
2. Create a `clone` voice profile from reference audio (`POST /profiles`, mode `clone`) so
   the profile stores `audio_prompt_path` (Pattern B deferred-path caching).
3. Generate with the profile:
   - MCP: `21labs.speak(text=..., profile="<clone profile>", engine="chatterbox", language="en")`
   - REST: `POST /speak` `{"text": "...", "engine": "chatterbox", "language": "en", "profile": "<id>"}`
4. Voice prompt is built by `create_voice_prompt(audio_path, ref_text)` → `{"ref_audio", "ref_text"}`;
   passed to `model.generate(..., audio_prompt_path=ref_audio, language_id=language, ...)`.

## Worked example
```python
21labs.speak(
    text="This is a warm, expressive narration.",
    engine="chatterbox",
    profile="My Reference Voice",   # clone profile pointing at reference audio
    language="en",
)
```

## Pitfalls / Gotchas
- **`needs_trim=True`** — Chatterbox can emit trailing silence/hallucinated noise.
  `engine_needs_trim("chatterbox")` is true; the chunking helper applies `trim_fn`
  (`trim_tts_output`) per chunk. Verify output is trimmed before mastering.
- **Reference-conditioned, not true zero-shot.** It imitates the reference but is not the
  XTTS-grade clone. For a guaranteed clone from arbitrary audio use XTTS v2.
- Missing reference file is logged and ignored — generation then runs voice-less.
- Forces CPU on macOS (`force_cpu_on_mac=True`); uses SDPA→eager attention patch.
- Long text: use the engine-agnostic chunked path (`backend/utils/chunked_tts.py`);
  `max_chunk_chars` default 800, crossfade 50 ms.

## Cross-links
- [engine-atlas](../engine-atlas/SKILL.md)
- [voice-cloning](../voice-cloning/SKILL.md)
- [voice-profiles](../voice-profiles/SKILL.md)
- [tts-xtts-v2](../tts-xtts-v2/SKILL.md)

## Validation
- Profile `clone` stored `audio_prompt_path`. Generation `status=completed`, sample rate
  from `model.sr` / `model.sample_rate` (fallback 24000). Confirm no trailing silence via
  `21labs.spectrogram` or `normalize_audio`.
