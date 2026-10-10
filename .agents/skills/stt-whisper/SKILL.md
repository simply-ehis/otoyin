---
name: stt-whisper
description: How otoyin's local Whisper STT works — faster-whisper (CTranslate2 int8), base/small/medium/large/turbo sizes, the 21labs.transcribe tool, POST /transcribe, languages, and use for reference transcription and subtitles. Load when transcribing audio or generating subtitles.
---
# STT — Whisper (local)

## Purpose
otoyin transcribes speech fully on-device with faster-whisper (CTranslate2, int8 quantization).
No cloud. This skill covers model sizes, the transcription tool surface, languages, and gotchas.

## When to use
- Transcribe a recording/capture to text.
- Generate SRT/VTT subtitles.
- Reference transcription for ADR or script alignment.

## Prerequisites
- Engine: Whisper STT (whisper.cpp by default; faster-whisper for catalog downloads and native word timestamps).
- Model downloaded: `21labs.models_download(model_name="whisper-base-en")` / `POST /models/download`.
  Missing model → ValueError "is not yet downloaded".
- Tool surface: `21labs.transcribe` (MCP) / `POST /transcribe` (REST).
- See [engine-atlas](../engine-atlas/SKILL.md) and [mcp-tool-reference](../mcp-tool-reference/SKILL.md).

## Model sizes (MCP `model` keys vs store catalog names)
| MCP `model` | backend | note |
|-------------|---------|------|
| `tiny.en` | whisper.cpp | lightest |
| `base.en` | whisper.cpp | default accuracy/speed balance |

`small`, `medium`, `large`, `turbo`, and names such as `whisper-small-en` are Store/faster-whisper catalog names, not MCP `21labs.transcribe`/`21labs.diarize` model keys.

Invalid MCP `model` → ValueError listing `tiny.en` and `base.en`.

## Parameters (21labs.transcribe)
| param | range | default | notes |
|-------|-------|---------|-------|
| audio_base64 | str | required (XOR audio_path) | decoded to temp .wav; max 200 MB |
| audio_path | absolute path | loopback callers only | must be absolute; >200 MB rejected |
| language | code? | auto-detect | e.g. en, es, fr (LANGUAGE_CODE_TO_NAME keys) |
| model | `tiny.en`, `base.en` | MCP validation key | use faster-whisper catalog names only for downloads, not `21labs.transcribe` |

## Response shape
```
{ "text": str, "duration": float, "language": str|null, "model": str }
```

## Agent procedure
1. Ensure model cached: `21labs.models_download(model_name="whisper-base-en")`.
2. Call `21labs.transcribe(audio_base64="<b64>", model="base.en", language="en")`.
3. For subtitles: `21labs.export_subtitles(audio_path, fmt="srt", model="base.en", language="en")`
   → returns subtitle file path (`POST /transcription/export-subtitles`).

Example:
```
21labs.transcribe(audio_base64="UklGRg...", model="base.en")
21labs.export_subtitles(audio_path="/data/captures/x.wav", fmt="srt", model="base.en")
```

## Pitfalls / Gotchas
- Exactly ONE of `audio_base64` / `audio_path` required — passing both or neither → ValueError.
- `audio_path` only works for **loopback** callers (anti SSRF); remote callers must use base64.
- 200 MB input cap (`MAX_TRANSCRIBE_BYTES`); larger files are rejected.
- Base64 is validated; invalid encoding → ValueError.
- Lang codes use the 10-key map (zh/en/ja/ko/de/fr/ru/pt/es/it) — others may not map.

## Cross-links
- [engine-atlas](../engine-atlas/SKILL.md)
- [mcp-tool-reference](../mcp-tool-reference/SKILL.md)
- [agent-operating-guide](../agent-operating-guide/SKILL.md)

## Validation
- `text` non-empty and language matches the clip; re-run with explicit `language` if auto-detect drifts.
