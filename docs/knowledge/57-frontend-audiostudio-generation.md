# Frontend: AudioStudio DAW + Generation

PURPOSE: How the in-app DAW (AudioStudio) and the TTS generation box work on the client.
OWNS: features/audioStudio/* (store + audioStudio/* DSP), components/Generation/* (compose box + hooks), components/VoicesTab/*.
READ-WHEN: Touching the DAW, effects chain, generation submit, profile sync, or waveform/MIDI rendering.
KEY-FILES: features/audioStudio/AudioStudioStore.ts, features/audioStudio/buildEffectChain.ts, features/audioStudio/useSessionManager.ts, features/audioStudio/useOfflineExport.ts, features/audioStudio/TransportControls.tsx, components/Generation/useGenerationActions.ts, components/Generation/useProfileSync.ts
INVARIANTS: AudioStudio is a zustand store with snapshot-based undo/redo. Effects chain is resolved AT SUBMIT TIME from the live React-Query cache (not React state) so profile presets are never dropped on a slow preset query. Profile-sync is gated on profile ID (not object identity) to avoid clobbering manual engine/preset choices on refetch.
GOTCHAS: The frontend buildEffectChain (true parallel wet/dry reverb/delay) DIVERGES from the backend AudioEffectsChain (single-tap approximations) — see docs/knowledge/54-audio-effects-processing.md #1. Two `audioBufferToWav` implementations exist (lib/utils/audio.ts + AudioStudio/audioStudio/audioBufferToWav.ts) with different contracts.
UPDATED: 2026-07-19

## AudioStudio store (AudioStudioStore.ts)
- zustand store. `StudioTrack` carries audioUrl/blob, waveformData (Float32Array), volume/pan, pluginChain, volume/panAutomation, crossfade, startOffset, trimStart/trimEnd, midiNotes, submixId. `MasterChannel` has volume, busSendLevels (trackId→send), ducking. `Submix` groups tracks with its own pluginChain.
- Undo/redo via `pushUndo`/`undo`/`redo` using `takeSnapshot` (deep-copies tracks+submixes+masterChannel+markers). `undoStack`/`redoStack` hold `UndoEntry{description, snapshot}`.
- IDs are module-level counters + `Date.now()` (generateTrackId) — NOT UUIDs. Two tracks created in the same ms could collide if counter logic changes; currently counter guarantees uniqueness.
- Playback uses Web Audio (`BaseAudioContext`) wired through `buildEffectChain` per track + master gain.

## buildEffectChain (audioStudio/buildEffectChain.ts) — the FIXED frontend DSP
- Iterates enabled plugins; supports reverb/eq/delay/compressor/gain.
- reverb = true parallel wet/dry: dry gain `1-mix`, convolver (makeImpulseResponse 1.5s) at wet gain `mix` (FIXED this session — was a serial attenuation).
- delay = parallel dry + feedback delay (delay→fb→delay loop) at wet `mix` (FIXED — was unconditional feedback boost).
- This is the CORRECT reference implementation; the backend chain (54) should match it for consistency.

## Generation flow (components/Generation/*)
- `FloatingGenerateBox` → `useGenerationForm` (react-hook-form) → `handleSubmit` → `useGenerationActions`.
- `useGenerationActions.getEffectsChain` reads `queryClient.getQueryData(['effectPresets'])` AT SUBMIT (FIXED this session: cold preset query previously dropped profile effects). `buildEffectsChain(selectedPresetId, selectedProfile, presetsList)` resolves the chain.
- `supportsInstruct` is derived from `capModel?.emotion_control` read at submit time (FIXED: previously a stale `modelStatus` cache race) — see useGenerationActions.ts:72.
- `composeMutation` calls `apiClient.composeWithPersonality` (persona-based generation).

## Profile sync (useProfileSync.ts) — the gated sync
- Default-profile effect: if no profile selected, pick `profiles[0].id`.
- Main sync effect gated by `lastSyncedProfileId` ref (FIXED this session: a React-Query refetch with a new object but same profile ID no longer clobbers the user's manual engine/preset choice).
- On profile change: sets language, auto-switches engine (or forces `qwen` if a cloned profile had landed on a preset-only engine like kokoro/parler), pre-fills effects via matching preset or `_profile` sentinel (submit-time cache reads presets even if still loading), clears persona toggle if profile has no personality.

## Observations (audit findings — for later judgement, NO code change yet)
1. **Frontend vs backend effect math diverges** (see 54 #1): same "reverb"/"delay" preset sounds different in the DAW (parallel wet/dry) vs assistant/REST export (single-tap). Users get inconsistent audio depending on path. Highest-value consistency fix in the app.
2. **Two `audioBufferToWav` implementations** (lib/utils/audio.ts vs AudioStudio/audioStudio/audioBufferToWav.ts) — different signatures/contracts, intentionally left as-is earlier this session. Risk: a future refactor "unifying" them could break one caller. Documented; don't merge blindly.
3. **`generateTrackId` uses `Date.now()`** (AudioStudioStore.ts:148) — fine for uniqueness via counter, but track IDs are NOT stable across reloads; saved sessions must re-map IDs on import (importSession does this?). Verify import remaps track ids + submix sourceTrackIds, or cross-session references break.
4. **Undo snapshot copies `markers` by reference** (takeSnapshot line 165: `markers: s.markers` — NOT mapped/shallow-copied). Mutating a marker in the current state after a snapshot would also mutate the stored undo entry. Likely benign (markers are replaced wholesale, not mutated in place) but it's a shallow-copy hole in an otherwise deep snapshot.
5. **Profile-sync still runs on `effectPresets` change** (useProfileSync.ts:94 deps include effectPresets) — the `lastSyncedProfileId` gate prevents clobber, but the effect still re-runs on every preset refetch; cheap, but unnecessary work. Could drop `effectPresets` from deps now that submit-time resolution handles it.
6. **`playbackSpeed` is in the snapshot but not obviously applied to Web Audio playback rate** — worth verifying the store's playbackSpeed actually drives an `AudioBufferSourceNode.playbackRate`; if not, the control is cosmetic.
7. **Compose (`composeWithPersonality`) and normal generate share the same submit path** but compose ignores the text box (uses profile personality). If a user types text then hits Compose, the typed text is discarded silently. UI should disable text or warn.

## Agent Callable
- **MCP Tools:** `21labs.session_save`, `21labs.session_load`, `21labs.export_reaper_project`
- **REST Endpoints:** `POST /audio-studio/sessions`, `GET /audio-studio/sessions`, `GET /audio-studio/sessions/{id}`, `PUT /audio-studio/sessions/{id}`, `DELETE /audio-studio/sessions/{id}`, `POST /audio-studio/sessions/{id}/autosave-snapshot`, `GET /audio-studio/sessions/{id}/autosave-snapshots`, `POST /audio-studio/sessions/{id}/undo-autosave`, `POST /audio-studio/sessions/{id}/promote`, `POST /audio-studio/sessions/{id}/export-reaper`
- **Key Backend Files:** `backend/routes/audio_studio.py`, `backend/routes/_session_store.py`
- **Key Frontend Files:** `app/src/features/audioStudio/AudioStudio.tsx`, `app/src/features/audioStudio/StudioToolbar.tsx`, `app/src/features/audioStudio/TransportControls.tsx`, `app/src/features/audioStudio/AudioStudioStore.ts`
