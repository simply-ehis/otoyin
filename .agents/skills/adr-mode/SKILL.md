---
name: adr-mode
description: Acted dialogue replacement over picture — guide track upload, take recording, quality scoring, auto-select, lock, and alignment via ADR REST endpoints.
---
# ADR Mode (Acted Dialogue Replacement)

## Purpose
Replace or add acted dialogue synced to a guide (picture) track: upload a guide, capture actor
takes, score each take, auto-select or manually lock the best take, then align it to the timeline.
The agent STAGES takes/selection but never mutates the live audio graph.

## When to use
- One voice acted over picture (film/TV/animation). See ../dialogue-methodology/SKILL.md.
- User supplies a guide/reference track and wants takes matched to it.

## Prerequisites
- Engine/model: none required for scoring/align (analysis-only); takes are recorded/imported WAV.
- Tool surface: REST `/adr/...` and MCP `21labs.adr_*` for session setup, guide/take retrieval, selection, scoring, alignment, and waveforms.
- Guide track must be uploaded before scoring/auto-select (GOTCHA in 35-dialogue-methodology.md).

## Parameters / Schema (backend/routes/adr.py)
| endpoint | method | body / notes |
|----------|--------|--------------|
| /adr/sessions | POST | `{name, fps:24.0, lines:[{line_id, original_text, character, target_duration_ms:0.0, timecode_in:"", timecode_out:""}]}` |
| /adr/sessions/{id}/guide | POST | multipart file upload (WAV) |
| /adr/sessions/{id}/guide-path | POST | `{audio_path:str}` (server-resolved storage path) |
| /adr/sessions/{id}/lines/{line_id}/takes | POST | multipart file upload |
| /adr/sessions/{id}/lines/{line_id}/takes-path | POST | `{audio_path:str}` |
| /adr/score | POST | `{line_id, audio:[float], sample_rate:24000}` → `{quality_score}` |
| /adr/auto-select | POST | `{line_id}` → `{selected_take_id}` |
| /adr/sessions/{id}/lines/{line_id}/select/{take_id} | POST | lock chosen take |
| /adr/align | POST | `{guide_audio:[float], take_audio:[float], sample_rate:24000}` → `{alignment_offset_ms}` |

Defaults: `fps=24.0`, `sample_rate=24000`, `target_duration_ms=0.0`.

## Agent procedure
1. `POST /adr/sessions` with lines (character, original_text, target_duration_ms, fps).
2. Upload guide: `POST /adr/sessions/{id}/guide` (file) or `/guide-path` (path). [VERIFY IN CODE]
   guide duration computed via soundfile.
3. Upload takes per line: `POST .../lines/{line_id}/takes`.
4. Score each take: `POST /adr/score` with audio array → `quality_score`.
5. `POST /adr/auto-select` for `{line_id}` → best take id (by quality + proximity to
   target_duration_ms).
6. Lock: `POST /adr/sessions/{id}/lines/{line_id}/select/{take_id}`.
7. Align: `POST /adr/align` → `alignment_offset_ms` (cross-correlation). Apply offset in UI.
8. Agent stages/selects; the human (or app) commits the live graph.

## Worked example
```bash
curl -F "file=@guide.wav" http://localhost:17493/adr/sessions/s1/guide
curl -X POST localhost:17493/adr/auto-select -H 'content-type: application/json' \
  -d '{"line_id":"l1"}'   # -> {"selected_take_id":"t3"}
curl -X POST localhost:17493/adr/sessions/s1/lines/l1/select/t3
```

## Pitfalls / Gotchas
- **MCP session shape differs from REST.** MCP `21labs.adr_create_session` accepts `video_path` and an optional name; REST session creation accepts lines. Use REST when dialogue lines must be included at creation.
- **Guide first.** Scoring/auto-select read take quality, but alignment cross-correlation assumes a
  guide exists; uploading the guide is required before meaningful alignment.
- **Destructive alignment is UI-side.** `POST /adr/align` returns an offset (ms); committing the
  shift to the live timeline is human-controlled.
- `target_duration_ms` of 0.0 means "no duration target" for auto-select.

## Cross-links
- [dialogue-methodology](../dialogue-methodology/SKILL.md)
- [conversation-mode](../conversation-mode/SKILL.md)
- [multi-take-comping](../multi-take-comping/SKILL.md)
- [effects-field-guide](../effects-field-guide/SKILL.md)

## Validation
- `GET /adr/sessions/{id}` returns lines with `takes` and `selected_take_id`.
- `POST /adr/score` returns `quality_score` in 0–1 (RMS + speech ratio + headroom).
- `POST /adr/align` returns finite `alignment_offset_ms`.
