# Cross-Tab Clip Linkage & Autosave

PURPOSE: Copy any audio output as a linked clip and paste it into another tab; persist editor state per tab with autosave + compulsory explicit Save.
OWNS: backend/routes/clipboard.py, backend/routes/_session_store.py, backend/routes/comping_sessions.py, backend/routes/mixer_sessions.py, backend/routes/standalone.py, backend/routes/audio_studio.py, app/src/lib/clip.ts, app/src/features/stories/StoryContent.tsx, app/src/features/audioStudio/AudioStudio.tsx, app/src/features/workspace/MultiTakeCompingView.tsx, app/src/features/workspace/MixerView.tsx, app/src/features/content/StandaloneProjectPage.tsx
READ-WHEN: Wiring a new copy source, adding a paste destination, or changing session persistence.
KEY-FILES: app/src/lib/clip.ts (copyClip/getClip/clearClip/resolveAudioDurationMs), backend/routes/_session_store.py (build_session_router)
INVARIANTS: A clip is a LINK by backend entity id (generation_id or sample id), not a copy of audio bytes. Autosave writes a hidden is_autosave row; explicit Save promotes it to a named, visible session (SessionResponse.is_autosave flips false). List endpoints hide autosave rows by default (include_autosave=true to surface). Every cross-window transport is the shared backend over HTTP — no Tauri event plumbing.
GOTCHAS: Comping paste bakes the clip WAV to base64 (same shape as a recorded take) so the existing /comping/assemble path is unchanged; AudioStudio/Mixer pastes store the source audioUrl and degrade gracefully if the source is later deleted. Stories clips re-resolve generation_id at playback; a deleted source shows a "Source unavailable" badge (ClipWaveform.onUnavailable) instead of silently failing. Single clipboard slot (copy replaces). StandaloneProject persists JSON (project_id) to standalone_projects; create returns project_id, save upserts by id.
UPDATED: 2026-07-19 (Voices sample copy source added)

## Clipboard (Steps 1-2)
- Backend `ClipboardItem` model; `PUT /clipboard` upserts the single slot, `GET /clipboard` returns it (404 if empty), `DELETE /clipboard` clears.
- Frontend `app/src/lib/clip.ts`: `copyClip(clip)` -> PUT, `getClip()` -> Clip | null, `clearClip()`.
- `Clip` shape: `{ kind, id, audioUrl, name, durationMs, trimStartMs?, trimEndMs? }`. `kind` is a `ClipKind` union (generation, story_item, studio_track, comp, mixer_state, sample, ...).
- `resolveAudioDurationMs(url)` best-effort measures duration from audio metadata when a source has no duration in its API payload (used by Voices samples); resolves 0 on error.
- Copy sources wired:
  - History generation row "Copy as clip" (id = generation_id, audioUrl = getAudioUrl(id)).
  - Story clip dropdown "Copy as clip" (id = item.generation_id, durationMs from item.duration).
  - **Voices sample row "Copy as clip"** (kind = `sample`, id = sample.id, audioUrl = getSampleUrl(id), name = reference_text, durationMs from `resolveAudioDurationMs`). `ProfileSampleResponse` carries no duration/generation_id, so duration is measured at copy time.

## Autosave + compulsory Save (Step 3)
Generic `build_session_router(prefix, model, tag, db_dep)` in `_session_store.py` wires create / promote / list / get / update / delete for any tab with columns (id, name, data JSON, is_autosave, timestamps).
- AudioStudio: AudioStudioSession (Step 3a, commit 7094fb8). 1.5s debounce creates/updates hidden row; Save promotes.
- Comping: CompingSession (3b). Data = `{ lanes }`.
- Mixer: MixerSession (3c). Data = `{ channels (vuLevel stripped), masterVolume }`.
- Standalone: StandaloneProjectRow (3d). Full project JSON; project_id from create.
- All four tabs: unsaved amber badge + beforeunload confirm-on-close guard.

## Paste handlers (Step 4)
- Stories "Paste clip" -> StoryItem with generation_id = clip.id (true link).
- AudioStudio "Paste" -> StudioTrack wired to clip.audioUrl.
- Comping "Paste Clip" -> fetch WAV -> base64 lane.
- Mixer "Paste Clip" -> channel strip referencing clipId + audioUrl.

## Link integrity (Step 5)
- ClipWaveform fires `onUnavailable` when audio load rejects; ClipItem renders a destructive "Source unavailable" overlay (i18n storyContent.sourceUnavailable).
- useStoryPlayback preload already catches 404s gracefully (no throw).

## Future
- 5-snapshot rolling autosave history: deferred (plan archived under `docs/archive/worksheets/`).

## Agent Callable
- **MCP Tools:** (none — clipboard is internal)
- **REST Endpoints:** `PUT /clipboard`, `GET /clipboard`, `DELETE /clipboard`
- **Key Backend Files:** `backend/routes/clipboard.py`
- **Key Frontend Files:** `app/src/stores/clipboardStore.ts`
