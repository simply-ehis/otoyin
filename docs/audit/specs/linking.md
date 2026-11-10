# Slice 8 / 21–24 — BUG-019 Linking: shared Send-to helper + load-by-query-param

PURPOSE: Close the linking gap — shared `useSendTo()` helper + load-by-query-param on target tabs.
OWNS: `app/src/lib/hooks/useSendTo.ts`, search-param handling on `/effects` + `/vocal-isolation` + `/transcript` + `/noise-reduction` + `/audio-enhance`, `/dsp/stream`, `/effects/preview-path`.
READ-WHEN: touching cross-tab handoffs.
KEY-FILES: `app/src/lib/hooks/useSendTo.ts`, `app/src/features/generate/HistoryList.tsx`, `app/src/features/effects/EffectsTab.tsx`, `app/src/features/effects/PresetDetail.tsx`, `app/src/features/workspace/VocalIsolationView.tsx`, `app/src/features/workspace/MusicGenView.tsx`, `app/src/features/workspace/TranscriptEditView.tsx`, `app/src/features/workspace/NoiseReductionView.tsx`, `app/src/features/workspace/AudioEnhanceView.tsx`, `backend/routes/audio_pipeline/dsp.py`, `backend/routes/audio_pipeline/presets.py`.
INVARIANTS: additive only; storage paths resolved server-side via `resolve_storage_path` (traversal-safe); no consent UI; heroicons only; plain `fetch` for generation audio is the established pattern (player + fallback both use it — no auth headers needed).
GOTCHAS: Effects audition operates on a generation id; path-based audition needs the new `/effects/preview-path` endpoint. Vocal-isolation source player needs the new `/dsp/stream` endpoint (no generic path stream exists). Noise/Enhance→Transcript is solved via REUSE of `POST /generate/import` (registers any stored audio as a generation via the singleton "Imported Audio" profile) — no new backend needed. useExhaustiveDependencies is fixed with real deps, not eslint disables.
UPDATED: 2026-11-10


## Links delivered
1. **Generate → Effects** (slice 8): "Send to Effects" in HistoryList generation dropdown → `/effects?generation=<id>` → EffectsTab pre-selects that generation in the preview picker (PresetDetail `initialPreviewId`).
2. **Music Gen → Stems** (slice 8): "Send to Stems" button in MusicGenView (post-generation actions) → dspUpload blob (or reuse imported beat's `audioPath`) → `/vocal-isolation?path=<audio_path>` → VocalIsolationView seeds `audioPath`/`fileName`/source player from the path (peaks decoded from `GET /dsp/stream?path=`).
3. **Stems → Effects** (slice 8): per-stem "Send to Effects" in VocalIsolationView results rows → dspUpload stem blob → `/effects?path=<audio_path>` → PresetDetail shows a source chip (file name, Clear button); preview auditions on `POST /effects/preview-path`.
4. **Generate → Transcript Edit** (slice 21): "Send to Transcript Edit" in HistoryList generation dropdown → `/transcript?generation=<id>` → TranscriptEditView seeds the input and auto-loads word timestamps.
5. **Transcript Edit → Effects** (slice 22): "Send to Effects" in the loaded toolbar → `/effects?generation=<id>` (the active transcript is a generation).
6. **Generate → Noise Reduction** (slice 23): HistoryList dropdown → client-side fetch of `/audio/<id>` → dspUpload → `/noise-reduction?path=<audio_path>` → NoiseReductionView seeds upload + fileName.
7. **Generate → Audio Enhance** (slice 23): same fetch → dspUpload → `/audio-enhance?path=<audio_path>` → AudioEnhanceView seeds upload + fileName + original-audio player from `/dsp/stream`.
8. **Noise Reduction → Effects** (slice 24): "Send to Effects" in the Cleaned-audio section → dspUpload cleaned blob → `/effects?path=<audio_path>`.
9. **Audio Enhance → Effects** (slice 24): "Send to Effects" next to Save to Library → dspUpload enhanced blob → `/effects?path=<audio_path>`.
10. **Noise Reduction → Transcript Edit** (slice 25): "Send to Transcript" in the Cleaned section → fetch cleaned blob → `POST /generate/import` (pre-existing route, reused as import mechanism) → `/transcript?generation=<newId>`. Zero new backend.
11. **Audio Enhance → Transcript Edit** (slice 25): "Send to Transcript" next to Save to Library → fetch enhanced blob → `POST /generate/import` → `/transcript?generation=<newId>`. Zero new backend.
12. **Captures → Effects** (slice 26): "Effects" action-bar button next to Copy audio → fetch `getCaptureAudioUrl` → dspUpload → `/effects?path=<audio_path>`.
13. **Captures → Transcript Edit** (slice 26): "Transcript" action-bar button → same fetch → File → importGeneration → `/transcript?generation=<newId>`.

## Deliberately NOT wired
- Video→ADR/Export rows — mechanically possible (dspUpload + `?path=`/`?generation=`); pass over when they get real demand. Voices→Generate is PARTIAL but works.
- Voice-changer (real-time) etc. already collapsed into VoiceConverterView via redirect; no separate wiring needed.

## Verification
- typecheck, biome, targeted vitest (useSendTo + existing suites to catch regressions).
- Backend: py_compile both touched routes; existing lifecycle/smoke tests stay green.
- Full gate: `bin/check.ps1` 11/11 PASSED (exit 0, RAN) — includes frontend vitest (82 files / 673 tests ALL PASS), Python pytest core (71 passed), ruff lint+format, encoding check, async-blocking scan, NAME_MAP coverage.
