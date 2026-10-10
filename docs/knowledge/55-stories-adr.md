# Stories + ADR Subsystems

PURPOSE: How otoyin sequences generations into a timeline (Stories) and does picture-locked dialogue replacement (ADR).
OWNS: services/stories/ (crud.py, editing.py, processing.py, helpers.py), routes/stories.py, routes/adr.py, database Story/StoryItem/ADRSession/ADRLine/ADRTake.
READ-WHEN: Touching story timeline edits, story export, ADR sessions/guides/takes, or the assistant story/adr tools.
KEY-FILES: services/stories/editing.py, services/stories/processing.py, routes/adr.py, routes/stories.py
INVARIANTS: All story edits are NON-DESTRUCTIVE (trim/volume/fade/gain are metadata; source generation audio is never mutated). Export re-derives trimmed+processed audio per item at mix time. ADR takes point at server-side files via audio_path (validated at tool boundary per audit fix).
GOTCHAS: StoryItem is keyed by generation_id for time updates; trim allows ~1ms (documented limitation, not changed). ADR align/score take raw float[] lists over JSON (not file paths).
UPDATED: 2026-07-19

## Stories model
- `Story` (1) → `StoryItem` (many). Each item references ONE `Generation` (generation_id), plus non-destructive metadata: start_time_ms, trim_start_ms, trim_end_ms, volume, gain_db, fade_in_ms, fade_out_ms, version_id (pinned version), order.
- `helpers._load_clip_audio(item, generation, db, sr)` loads the (pinned version or original) generation WAV, resamples to 24000, and applies trim via effective duration. This is the single source of truth for "what plays for this item".

## Editing operations (services/stories/editing.py)
- `trim_story_item` — sets trim_start_ms/trim_end_ms; rejects if `trim_start+trim_end >= max_duration_ms` (keeps >=1ms of audio — see GOTCHAS). Pure metadata.
- `update_story_item_volume` — linear per-clip gain.
- `split_story_item` — splits into two items at a split point; the NEW item copies fade_in/out and its fade_out is capped to the new duration (FIXED this session).
- `reorder_story_item` — reorders using EFFECTIVE (trimmed) duration, not raw generation duration (FIXED this session).
- `update_story_item_times` — re-times by generation_id key; documented limitation (API model shape), not changed.
- `duplicate_story_item`, `normalize_story_item` (RMS-based LUFS now, FIXED), `remove_silence` (zero-pads, no real-audio dup, FIXED).

## Processing / export (services/stories/processing.py)
- `export_story_audio` — orders items by start_time_ms, loads each clip, applies gain_db (10^(db/20)) + fades via `_apply_fade`, then timecode-mixes into one WAV (FIXED this session: gain_db + fades were previously dropped). Returns bytes.
- `normalize_story_item` — RMS-based normalization (FIXED: previously treated LUFS as peak).
- `remove_silence` — pads with zero frames instead of duplicating real audio (FIXED).

## ADR model (routes/adr.py)
- `ADRSession` (fps, guide_audio_path, guide_duration_ms) → `ADRLine` (character, original_text, timecode_in/out, target_duration_ms) → `ADRTake` (audio file, score, selected flag).
- Guide + takes are SERVER-SIDE files referenced by `audio_path` (the assistant tool boundary sanitizes these per the 2026-07-19 audit fix). Upload endpoints write to `config.get_adr_dir()`.
- `align` (AlignRequest: guide_audio + take_audio as float[] lists, sr) and `score` (ScoreRequest: audio float[], sr) run analysis IN-PROCESS over posted PCM — not file paths. `auto_select` picks the best-scored take for a line.
- Scoring uses local analysis (e.g. duration match vs target, energy) — no external model.

## Observations (audit findings — for later judgement, NO code change yet)
1. **Stories export assumes 24000 Hz mix bus** (processing.py:48, _load_clip_audio resamples to 24000). Generations from higher-sr engines (e.g. 48k) are resampled down on export — fine for speech, but ADR/studio stems at 48k would lose HF. Worth a note if music beds are ever mixed into Stories.
2. **`trim_story_item` allows a 1ms sliver** (editing.py:48) — `>= max_duration_ms` rejects only when trim sum meets/exceeds full length, so a user can trim to ~1ms of audio. Not a crash, but effectively silent clips are allowed. Earlier audit noted this as a documented limitation.
3. **Story item order is a soft field** — `reorder_story_item` reorders but export sorts by `start_time_ms`, so order index and start_time can diverge (user drags order but start times unchanged → export ignores visual order). Potential UX surprise; the two ordering axes are independent.
4. **ADR `score`/`align` take raw float arrays over JSON** — large takes (minutes of 24k PCM) become multi-MB JSON POST bodies. Works locally, but is bandwidth-heavy and not streamed. Fine for on-device, fragile if ADR is ever remote.
5. **ADR guide/take files are never garbage-collected** — `get_adr_dir()` files persist across session delete unless an explicit cleanup runs. `adr_delete_session` should verify it removes the dir; if not, orphan files accumulate. (Verify before relying on it.)
6. **Stories `export_story_audio` returns bytes, not a saved file** — the route writes to a temp/exports path. Multiple rapid exports create distinct files; no dedupe. Acceptable but the exports dir can grow.

## Relation to earlier fixes
The 2026-07-19 story-editing audit fixed 5 real bugs here (reorder uses effective duration, export applies gain/fades, normalize is RMS-based, split propagates fades, remove_silence zero-pads). Those are verified by the backend test suite. The observations above are SEPARATE, lower-severity, intentionally left as-is.

## Agent Callable
- **MCP Tools:** `21labs.list_stories`, `21labs.get_story`, `21labs.create_story`, `21labs.export_story_audio`
- **REST Endpoints:** `GET /stories`, `POST /stories`, `GET /stories/{id}`, `PUT /stories/{id}`, `DELETE /stories/{id}`, `POST /stories/{id}/items`, `DELETE /stories/{id}/items/{itemId}`, `PUT /stories/{id}/items/times`, `PUT /stories/{id}/items/reorder`, `PUT /stories/{id}/items/{itemId}/move`, `PUT /stories/{id}/items/{itemId}/trim`, `POST /stories/{id}/items/{itemId}/split`, `GET /stories/{id}/export-audio`, `POST /adr/sessions`, `GET /adr/sessions`
- **Key Backend Files:** `backend/routes/stories.py`, `backend/routes/adr.py`, `backend/services/stories/`, `backend/services/adr.py`
- **Key Frontend Files:** `app/src/features/stories/StoriesTab.tsx`, `app/src/features/stories/editor/StoryTrackEditor.tsx`, `app/src/features/workspace/adr/ADRView.tsx`
