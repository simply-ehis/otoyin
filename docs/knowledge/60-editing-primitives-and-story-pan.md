# Story Pan + Audio Editing Primitives

PURPOSE: The two new editing surfaces added 2026-07-19 — (1) per-story-item stereo pan persisted through to export, and (2) standalone audio editing primitives (copy/cut/paste clipboard, time-stretch/expand, shout→whisper, blend/crossfade-merge) exposed to both humans (Stories tab "Edit" menu) and the assistant agent (tools).
OWNS: database/models.py StoryItem.pan, database/migrations.py _migrate_story_items (pan add), models.py StoryItemPanUpdate, services/stories/helpers.py _apply_pan, services/stories/processing.py export (stereo pan mix), services/stories/editing.py set_story_item_pan, routes/stories.py /pan, services/audio_edit.py (all 4 primitives), routes/audio.py /audio/{copy,cut,paste,time-stretch,shout-to-whisper,blend}, routes/assistant_tools/{mappings,tools_audio_prim}.py, app features/stories/editor/EditorToolbar.tsx + ClipPanPopover.tsx.
READ-WHEN: Adding a story-item property, changing story export, or adding a clipboard/stretch/whisper/blend tool for humans or the agent.
KEY-FILES: services/audio_edit.py, services/stories/processing.py, routes/audio.py, EditorToolbar.tsx
INVARIANTS: Pan is equal-power (-1..1, 0=center) and applied per-clip BEFORE the stereo export sum; story export is now stereo (was mono) so pan positions survive. All audio_edit ops are non-destructive to the source file and write new WAVs to the exports dir; paths are sanitized via config.resolve_storage_path. Assistant tool args are validated (_validate_args) — path args rejected if absolute/'..'/scheme.
GOTCHAS: Story export stereo change means existing mono consumers of export_story_audio output must handle 2-channel arrays. The frontend "Edit" menu plays results via the player store (exportUrl); it does NOT auto-add the result as a new story clip (that needs a generation record) — by design, to avoid DB gymnastics. shout_to_whisper combines formant_shift (down) + spectral tilt + dynamic de-emphasis; it is an approximation, not true LPC formant shifting.
UPDATED: 2026-07-19 (feature added)

## A. Story per-item pan (Task A)

- `StoryItem.pan` column added via idempotent migration (`_migrate_story_items` adds `pan REAL NOT NULL DEFAULT 0.0`). No Alembic — matches repo convention.
- Frontend `StoryItemDetail.pan`, `ClipPanPopover` (slider -100..100 → -1..1), `useSetStoryItemPan` hook, `setStoryItemPan` apiClient method.
- Backend applies pan in `services/stories/processing.py:export_story_audio` using `_apply_pan` (equal-power, copied from `routes/audio.py:_apply_pan`). Export buffer is now `(samples, 2)`.

## B. Audio editing primitives (Task B) — `services/audio_edit.py`

- `copy_segment` — extract `[start_s, end_s)` to a new WAV; source untouched (clipboard).
- `cut_segment` — remove region; returns shortened file + the extracted clip (real cut, not delete).
- `paste_segment` — insert clip into target at `at_s`; optional equal-power crossfade when `crossfade_ms>0`.
- `time_stretch` — `apply_time_stretch` (phase-vocoder, constant pitch); rate 0.25..4.0 (expand>1, compress<1).
- `shout_to_whisper` — formant shift down (shift_factor 1-0.35*intensity) + one-pole spectral tilt (attenuate highs) + dynamic de-emphasis (pull peaks toward RMS). intensity 0..1.
- `blend` — crossfade-merge clip B after A (equal-power overlap) or with a silence gap when `gap_ms>0`.

All return a storage `output_path` + `filename` + `duration_s`. Routes mirror `/audio/duck` (path-traversal rejection, save to exports). Assistant tools: `copy_segment, cut_segment, paste_segment, time_stretch, shout_to_whisper, blend` (registered in mappings + tools_audio_prim, in QUERY_POST_TOOLS).

## C. Frontend human surface

- `EditorToolbar` "Edit" dropdown (`EditTools`) per selected clip: Copy, Cut, Paste as new clip, Expand (prompt for rate), Shout→Whisper, Blend with next clip.
- Clipboard: `stores/clipboardStore.ts` holds the copied/cut clip (storage path + duration). Copy/Cut store it; Paste calls `POST /generations/from-audio` (registers the clip as a Generation, `engine="import"`, attached to first profile) then `addStoryItem` to land it in the timeline. Expand/Whisper/Blend play results via `apiClient.exportUrl(filename)` + player store.
- Pan slider lives in `ClipPanPopover` next to the volume popover.
- Backend: `routes/generations.py` `POST /generations/from-audio` (`GenerationFromAudioRequest`) computes duration from the file and creates a `Generation` row.
