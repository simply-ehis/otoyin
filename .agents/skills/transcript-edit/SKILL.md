---
name: transcript-edit
description: Edit audio by manipulating its word-level transcript — click-to-playhead and word timestamps — then re-render, for filler-word removal and quick cleanup.
---
# Transcript-Driven Editing

## Purpose
Edit speech by its transcript instead of the waveform: read word-level timestamps, click a word to
move the playhead, and delete selected words so the audio trims to match. Fast cleanup of
TTS/recorded speech without waveform surgery.

## When to use
- Remove filler words (um, uh, like) from generated speech.
- Rearrange/trim dialogue by deleting word ranges.
- Click-to-playhead navigation in the transcript view.

## Prerequisites
- Engine/model: a generation with audio (`generation_id`). Word timestamps come from
  `transcribe_audio(word_timestamps=True)`.
- Tool surface: REST `/transcript/...`. NO MCP transcript tool — REST only.

## Parameters / Schema (backend/routes/transcript_edit.py)
| endpoint | method | body / notes |
|----------|--------|--------------|
| /transcript/{generation_id}/words | GET | → `{words:[{word, start_ms, end_ms, confidence}]}` |
| /transcript/{generation_id}/click-word | POST | `{index, word, start_ms, end_ms, selected:false}` → `{playhead_ms, select_start_ms, select_end_ms, word}` |

Defaults: `confidence` defaults 1.0; `selected` defaults false.

## Agent procedure
1. `GET /transcript/{generation_id}/words` → word list with start/end ms.
2. To navigate: `POST /transcript/{generation_id}/click-word` with the chosen word → `playhead_ms`.
3. To delete: `POST /transcript/{generation_id}/delete-words` with `{word_indices:[int], crossfade_ms:10}` → `{new_generation_id, new_audio_path, new_duration}`.
4. Re-render / export the edited generation.

## Worked example
```bash
curl localhost:17493/transcript/g123/words
# -> {"words":[{"word":"um","start_ms":120.0,"end_ms":340.0,"confidence":0.9}, ...]}
curl -X POST localhost:17493/transcript/g123/click-word -H 'content-type: application/json' \
  -d '{"index":1,"word":"um","start_ms":120.0,"end_ms":340.0,"selected":true}'
# -> {"playhead_ms":120.0,"select_start_ms":120.0,"select_end_ms":340.0,"word":"um"}
```

## Pitfalls / Gotchas
- `click-word` returns the playhead + selection span; it does NOT mutate audio. Deletion uses `delete-words` and returns a new generation.
- Word timestamps are produced by transcribing the generation's audio (faster-whisper); accuracy
  depends on the model.

## Cross-links
- [dialogue-methodology](../dialogue-methodology/SKILL.md)
- [multi-take-comping](../multi-take-comping/SKILL.md)
- [effects-field-guide](../effects-field-guide/SKILL.md)

## Validation
- `GET /transcript/{id}/words` returns word objects with finite `start_ms`/`end_ms`.
- `click-word` echoes `playhead_ms == start_ms` of the supplied word.
