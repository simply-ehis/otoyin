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
- Engine: Whisper STT (faster-whisper). Fallback to transformers Whisper only if faster-whisper
  is not installed (never breaks mid-upgrade).
- Model downloaded: `21labs.models_download("whisper-<size>")` / `POST /models/download`.
  Missing model → ValueError "is not yet downloaded".
- Tool surface: `21labs.transcribe` (MCP) / `POST /transcribe` (REST).
- See [engine-atlas](./engine-atlas/SKILL.md) and [mcp-tool-reference](./mcp-tool-reference/SKILL.md).

## Model sizes (WHISPER_HF_REPOS)
| size | HF repo | note |
|------|---------|------|
| base | openai/whisper-base | lightest |
| small | openai/whisper-small | |
| medium | openai/whisper-medium | |
| large | openai/whisper-large-v3 | |
| turbo | openai/whisper-large-v3-turbo | fastest large |

Invalid `model` → ValueError listing the valid keys above.

## Parameters (21labs.transcribe)
| param | range | default | notes |
|-------|-------|---------|-------|
| audio_base64 | str | required (XOR audio_path) | decoded to temp .wav; max 200 MB |
| audio_path | absolute path | loopback callers only | must be absolute; >200 MB rejected |
| language | code? | auto-detect | e.g. en, es, fr (LANGUAGE_CODE_TO_NAME keys) |
| model | base/small/medium/large/turbo | loaded size | |

## Response shape
```
{ "text": str, "duration": float, "language": str|null, "model": str }
```

## Agent procedure
1. Ensure model cached: `21labs.models_download("whisper-base")`.
2. Call `21labs.transcribe(audio_base64="<b64>", model="base", language="en")`.
3. For subtitles: `21labs.export_subtitles(audio_path, fmt="srt", model="base", language="en")`
   → returns subtitle file path (`POST /transcription/export-subtitles`).

Example:
```
21labs.transcribe(audio_base64="UklGRg...", model="turbo")
21labs.export_subtitles(audio_path="/data/captures/x.wav", fmt="srt", model="base")
```

## Pitfalls / Gotchas
- Exactly ONE of `audio_base64` / `audio_path` required — passing both or neither → ValueError.
- `audio_path` only works for **loopback** callers (anti SSRF); remote callers must use base64.
- 200 MB input cap (`MAX_TRANSCRIBE_BYTES`); larger files are rejected.
- Base64 is validated; invalid encoding → ValueError.
- Lang codes use the 10-key map (zh/en/ja/ko/de/fr/ru/pt/es/it) — others may not map.

## Cross-links
- [engine-atlas](./engine-atlas/SKILL.md)
- [mcp-tool-reference](./mcp-tool-reference/SKILL.md)
- [agent-operating-guide](./agent-operating-guide/SKILL.md)

## Validation
- `text` non-empty and language matches the clip; re-run with explicit `language` if auto-detect drifts.
