---
name: tts-chatterbox-turbo
description: Generate fast English speech with Chatterbox Turbo using [paralinguistic] tags ([laugh],[sigh]) and reference-conditioned voice; needs_trim=True.
---

# Chatterbox Turbo TTS (English, Paralinguistic)

> **REMOVED — 2026-07.** The `chatterbox_turbo` engine is no longer registered in
> `TTS_ENGINES` (`backend/backends/protocols.py::TTS_ENGINES`); no `chatterbox_backend.py`
> exists, and `get_tts_backend_for_engine` raises `ValueError: Unknown TTS engine`.
> This page is retained for historical reference only — do not use it for current work.
> For non-verbal tags, use `21labs.apply_audio_tags`; for cloning, use a supported
> clone engine. See [engine-atlas](../engine-atlas/SKILL.md).

## Purpose
Chatterbox Turbo (`ResembleAI/chatterbox-turbo`, 1500 MB) is the fast, English-only cousin
of Chatterbox. It adds **paralinguistic tags** inline in text (`[laugh]`, `[sigh]`, …) so an
agent can inject non-verbal vocalizations. Like Chatterbox it is reference-conditioned
("clone-ish"), not true zero-shot. `needs_trim=True`.

## When to use
- English only, need speed + expressive non-verbal tags.
- Narration/comics/character reads where `[laugh]`/`[cough]` matter.
- Need a reference-conditioned voice but not a guaranteed XTTS-style clone.

## Prerequisites
- Engine/model: `chatterbox_turbo` — `ResembleAI/chatterbox-turbo` (1500 MB). Required
  weights: `t3_turbo_v1.safetensors`, `s3gen_meanflow.safetensors`, `ve.safetensors`.
- Tool surface: MCP `21labs.speak`; REST `POST /speak`.
- Voice/profile: `clone` profile → reference audio (`audio_prompt_path`); `needs_trim=True`.

## Parameters / Schema (REAL from code)
| param | range | default | notes |
|-------|-------|---------|-------|
| engine | `chatterbox_turbo` | — | |
| language | `en` only | `en` | ignored — Turbo is English-only |
| text | string (with optional `[tag]`) | — | tags injected inline |
| temperature | float | 0.8 | `model.generate(temperature=0.8)` |
| top_k | int | 1000 | |
| top_p | float | 0.95 | |
| repetition_penalty | float | 1.2 | |
| seed | int | none | `manual_seed` |
| audio_prompt_path | file path | none | reference audio; missing → ignored |

Paralinguistic tags (from `01-voice-studio.md` + `chunked_tts._PARA_TAG_RE`):
`[laugh]`, `[chuckle]`, `[gasp]`, `[cough]`, `[sigh]`, `[groan]`, `[sniff]`, `[shush]`,
`[clear throat]`. The chunk splitter (`_PARA_TAG_RE = \[[^\]]*\]`) treats these as atomic and
never cuts inside one.

## Agent procedure
1. Download: `21labs.models_download(model_name="chatterbox-turbo")`.
2. Create a `clone` profile from reference audio (`POST /profiles`, mode `clone`).
3. Write text with inline tags, e.g. "Oh wow[laugh] that was close[sigh]".
4. Generate:
   - MCP: `21labs.speak(text="...", profile="<clone>", engine="chatterbox_turbo", language="en")`
   - REST: `POST /speak` `{"text": "...", "engine": "chatterbox_turbo", "language": "en"}`

## Worked example
```python
21labs.speak(
    text="I can't believe we won[cheer] ... well, maybe next time[sigh].",
    engine="chatterbox_turbo",
    profile="Turbo Ref Voice",
    language="en",
)
```

## Pitfalls / Gotchas
- **English only.** `language` is ignored by the backend; passing `es`/`fr` still generates EN.
- **`needs_trim=True`.** Trailing silence possible — trim before mastering (see Chatterbox notes).
- Tags are atomic: the chunker never splits a `[tag]` across chunks, but a tag must be a
  known token or it may be spoken literally — `[VERIFY IN CODE]` which tags the model honors.
- Reference-conditioned, not true zero-shot clone (use `../tts-xtts-v2/SKILL.md` for that).
- Forces CPU on macOS. Long text uses the engine-agnostic chunked path (default 800 chars).

## Cross-links
- [engine-atlas](../engine-atlas/SKILL.md)
- [voice-cloning](../voice-cloning/SKILL.md)
- [voice-profiles](../voice-profiles/SKILL.md)
- [tts-chatterbox](../tts-chatterbox/SKILL.md)

## Validation
- Generation `status=completed`. Confirm tags produced non-verbal audio (listen / spectrogram).
- Sample rate from `model.sr`/`model.sample_rate` (fallback 24000). Trim verified via
  `21labs.normalize_audio` showing tight tail.
