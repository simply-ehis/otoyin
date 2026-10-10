---
name: stories-mode
description: Sequence long narrative (audiobook/chapters) as ordered story items with per-item fade/gain/trim/split/reverse/normalize/silence-removal/version/reorder, then export one mixed WAV.
---
# Stories Mode (Long Narrative Sequencing)

## Purpose
Assemble a long-form narration (audiobook, single narrator split into chapters, or quick segment
sequencing) as an ordered list of items. Each item supports non-destructive fade/gain/trim and
versioned destructive ops (normalize, reverse, silence-removal), then the whole story exports as one
WAV.

## When to use
- Long narrative / audiobook with a single narrator split into chapters (see
  ../dialogue-methodology/SKILL.md).
- Quick segment sequencing needing fade/gain/trim/split/reorder.

## Prerequisites
- Engine/model: generate clips first via `generate_speech` (or any generation) then attach as items.
- Tool surface: MCP `21labs.create_story | list_stories | get_story | export_story_audio`;
  fuller control via REST `/stories/...`.

## Parameters / Schema (backend/routes/stories.py)
| op | endpoint | notes |
|----|----------|-------|
| create | POST /stories `{name, description?}` | MCP `create_story(name, description?)` |
| list | GET /stories | MCP `list_stories()` |
| get | GET /stories/{id} | MCP `get_story(story_id)` |
| add item | POST /stories/{id}/items `{generation_id,...}` | |
| fade | PUT /stories/{id}/items/{item_id}/fade | non-destructive, fade-in/out ms |
| gain | PUT /stories/{id}/items/{item_id}/gain | gain in dB (non-destructive) |
| volume | PUT /stories/{id}/items/{item_id}/volume | linear gain **0.0–2.0** |
| trim | PUT /stories/{id}/items/{item_id}/trim | |
| split | POST /stories/{id}/items/{item_id}/split | creates two clips |
| duplicate | POST /stories/{id}/items/{item_id}/duplicate | |
| move | PUT /stories/{id}/items/{item_id}/move | position/track |
| reorder | PUT /stories/{id}/items/reorder `{generation_ids:[...]}` | recalc timecodes |
| normalize | POST /stories/{id}/items/{item_id}/normalize | **destructive**, new version, target LUFS |
| reverse | POST /stories/{id}/items/{item_id}/reverse | **destructive**, new version |
| silence-removal | POST /stories/{id}/items/{item_id}/silence-removal | **destructive**, new version |
| version | PUT /stories/{id}/items/{item_id}/version | pin generation version |
| export | GET /stories/{id}/export-audio | WAV StreamingResponse; MCP `export_story_audio(story_id)` |

## Agent procedure
1. `create_story(name, description?)` → story_id.
2. Generate narration clips per chapter, then add each as an item (`POST /stories/{id}/items`).
3. Per item: set non-destructive `fade`/`gain`/`volume`/`trim`; split long clips with `split`.
4. For corrective passes use versioned ops (`normalize` to target LUFS, `reverse`,
   `silence-removal`) — these create new versions, source preserved.
5. `reorder` to sequence chapters; `move` to place on tracks.
6. `export_story_audio(story_id)` → base64 / mixed WAV.

## Also real, but REST-only
- `PUT .../items/{item_id}/pan`, `PUT .../items/{item_id}/speed`
- `POST .../match-loudness`
- `POST .../items/{item_id}/crossfade`
- `POST .../items/merge`
- `POST .../undo`, `POST .../redo`
- `GET .../export`, `GET .../export-epub`, `GET .../export-pdf`

## Worked example
```python
sid = await twentylabs_create_story("Chapter 1", "Intro narration")
await twentylabs_export_story_audio(sid)   # -> {"audio_base64": "...", ...}
```

## Pitfalls / Gotchas
- **Destructive vs non-destructive.** `fade`/`gain`/`volume`/`trim`/`split` are non-destructive;
  `normalize`/`reverse`/`silence-removal` create NEW versions (source kept via versioning).
- **Volume range.** `volume` is LINEAR 0.0–2.0, not dB. Use `gain` for dB.
- Export returns WAV; no items → HTTP 400 "Story has no audio items".
- No MCP per-item ops — use REST for fade/gain/trim/etc.

## Cross-links
- [dialogue-methodology](../dialogue-methodology/SKILL.md)
- [conversation-mode](../conversation-mode/SKILL.md)
- [effects-field-guide](../effects-field-guide/SKILL.md)

## Validation
- `get_story` lists items in order with timecodes.
- `export_story_audio` returns valid WAV bytes / base64.
- `measure_loudness` on export ≈ −18 LUFS stereo (audiobook).
