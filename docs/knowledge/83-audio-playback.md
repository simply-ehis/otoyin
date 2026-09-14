# 83 — Audio Playback (WaveSurfer + Fallback)

PURPOSE: How every clip plays, why autoplay can fail, and how the fallback saves it.
OWNS: app/src/components/AudioPlayer/AudioPlayer.tsx, app/src/stores/playerStore.ts, backend/routes/generations.py
READ-WHEN: Playback is silent, waveform is empty, or "Audio not loaded" sticks.
KEY-FILES: app/src/components/AudioPlayer/AudioPlayer.tsx, app/src/lib/hooks/useGenerationProgress.ts, backend/routes/generations.py
INVARIANTS: One shared player (playerStore.audioUrl); SSE completion auto-plays only when idle and not an agent speak.
GOTCHAS: WaveSurfer WebAudio decode fails on some webviews/codecs — the plain <audio> fallback is the supported path, not an error.
UPDATED: 2026-09-11 (compact pill pass)

## Player bar (compact pill)
Floating centered pill (`fixed bottom-3`, `max-w-2xl`, `h-12`, rounded-full): play → optional title → waveform/seek → time → loop → mute → mini volume → close. Waveform click seeks (WaveSurfer `interact`); no separate seek row. Errors render inline with a Retry button that re-runs `load()`.

## Fallback
When `load()` rejects, the player switches to a hidden `<audio>` engine driven by the same custom button (volume/seek/spacebar/restart all branch on `useFallback`). `useFallback` resets on every new URL so one bad file never pins later tracks. Close resets both paths.

## Autoplay gesture rule
`setAudioWithAutoPlay` from a row click loses the click gesture during async fetch+decode, so `ready`-time `play()` may reject with NotAllowedError — silent by design; the user taps play (a real gesture). Clicking the already-loaded row toggles the store flag instead of reloading.

## Listening speed (playbackRate)
Speed is playback-side only: `playerStore.playbackRate` (0.5–2, default 1, clamped) drives WaveSurfer `setPlaybackRate` + fallback `el.playbackRate`, synced on change and on `ready`/fallback-mount. UI: pill `1×` cycle button (1 → 1.25 → 1.5 → 2 → 0.75) + Generate tab More-row Speed select (same store value). It changes how previews play, never the synthesized voice — TTS engines take no speed param.

## Generation progress (see also generationProgressStore)
`useGenerationProgress` mirrors SSE stages into `generationProgressStore.byId` (stage/startedAt/chunksReady/chunksTotal/previewUrl; cleared on terminal states). `GenerationProgressList` (Generate tab, under PromptBar) shows per-id stage + elapsed + chunk fraction + cancel + Listen-while-streaming (plays `previewUrl` under the same id so completion swaps in the final mix). No backend percent exists — stages + chunk counts are the whole signal.

## Preset voice audition (see also services/preset_preview.py)
Preset voices are synthesis parameters, not audio files, so hearing one costs a single inference run: `POST /profiles/preset-voice-preview` {engine, voice_id} synthesizes a fixed short phrase via `get_or_synthesize_preview` (per-voice lock, worker-thread synthesis, empty-audio guard, sha256 cache key) and caches the wav under `data/previews/` — repeat auditions never re-synthesize. No profile/history rows are created; the model must already be downloaded. Frontend `usePresetAudition` adds an in-memory blob-URL cache and plays through the shared player under a `preview-voice:` id; `PreviewPlayButton` is the shared row button. Audition surfaces: Generate picker rows (with search past 8 voices), Store cards and the voice-design model matrix (via shared `PresetVoiceAuditionList`, download-gated).

## History delete (see also backend/services/history.py)
`DELETE /history/{id}` nulls audiobook chapter/utterance refs first (FKs lack cascade; with `foreign_keys=ON` the row delete would 500) and tolerates locked/missing audio files. The HistoryList strips rows from local append-only state on success and resets the player when the playing clip is deleted — a bare query invalidation never removes the row.

## URLs
- Generations: `GET /audio/{id}` (`getAudioUrl`), chunks: `/generations/{id}/chunk/{i}`, library items: `audio_url` resolved against the server base, captures: `/captures/{id}/audio`, ADR: `/adr/audio/{take}`.

## Troubleshooting
- "Audio not loaded": backend down (see BackendStatusBanner), 404 audio_path, or WaveSurfer still decoding — wait, then Close + replay.
- Autoplay blocked: browsers require a gesture; the SSE auto-play only fires when idle. Click Play once to unlock.
- No sound but waveform moves: muted/native-routing — check volume + channel devices.

## Agent Callable
- **MCP Tools:** `21labs.speak` (returns generation with audio), `21labs.generation_version_audio`
- **REST:** `GET /audio/{generation_id}`, `GET /generations/{id}/chunk/{i}`, `GET /captures/{id}/audio`, `POST /profiles/preset-voice-preview`
- **Key Files:** `app/src/components/AudioPlayer/AudioPlayer.tsx`, `app/src/stores/playerStore.ts`, `app/src/features/generate/usePresetAudition.ts`, `app/src/features/voices/PresetVoiceAuditionList.tsx`, `backend/services/preset_preview.py`
