PURPOSE: How an AI measures a clip's loudness (LUFS / true-peak / RMS / crest / LRA) and transcribes a clip to SRT/VTT subtitles — both offline.

OWNS: `backend/services/loudness.py` (`analyze_loudness`, `measure_loudness`), `backend/services/subtitles.py` (`export_subtitles`), `backend/routes/audio.py` (`/audio/analyze-loudness`), `backend/routes/transcription.py` (`/transcription/export-subtitles`), `backend/routes/assistant_tools/` (`analyze_loudness`, `export_subtitles`), `backend/mcp_server/tools/`.

READ-WHEN: An AI is asked to "check the loudness / LUFS", "normalize to broadcast target", "make subtitles / captions", or "transcribe and export SRT".

KEY-FILES: `12-loudness-metering.md` (the live UI meter), `37-professional-finishing.md` (mastering), `39-gm-instruments.md`, `mcp-tools-extended.md`.

INVARIANTS:
- Offline only. Loudness uses `pyloudnorm` (ITU-R BS.1770-4). Subtitles use the local Whisper model already loaded for `transcribe`.
- Non-destructive: both return measurements / new text files; the source clip is never overwritten.
- `analyze_loudness` returns `integrated_lufs`, `true_peak_dbtp`, `rms_db`, `crest_factor_db`, `loudness_range_lu`, `duration_seconds`.

GOTCHAS:
- `analyze_loudness` takes `audio_path` as a **query parameter** (not a JSON body). Sending a JSON body → 422. Path is resolved/storage-checked; traversal is rejected; missing file → 404.
- `export_subtitles` is gated on the Whisper model cache: if the model is not downloaded it returns HTTP 400 with an install hint (never a fake transcript). It reuses the same local Whisper backend as `/transcribe/path`.
- Offline Whisper needs the `faster-whisper` package (CTranslate2, int8) installed — `backend/backends/faster_whisper_backend.py` is the default STT backend and loads `SYSTRAN/faster-whisper-*` from the local HF cache with `HF_HUB_OFFLINE=1`. If `faster-whisper` is missing it silently falls back to transformers Whisper, which needs network-downloaded `openai/whisper-*` weights and then fails offline. `faster-whisper` is now in `requirements.txt`.
- Subtitle timestamps are distributed **proportionally** across the transcript sentences by character length. Word-level timestamps are not available from the backend, so cue timing is approximate (good for caption blocks, not frame-accurate spotting).
- `fmt` is `srt` or `vtt` (default `srt`). Optional `model` / `language` forward to Whisper.

## Tools

### analyze_loudness
- Assistant: `analyze_loudness(audio_path)` (query param)
- MCP: `21labs.analyze_loudness(audio_path)`
- Endpoint: `POST /audio/analyze-loudness?audio_path=...` → JSON metrics.
- Use before/after `master_audio` to confirm the delivered LUFS target.

### export_subtitles
- Assistant: `export_subtitles(audio_path, fmt="srt", model=None, language=None)`
- MCP: `21labs.export_subtitles(audio_path, fmt, model, language)`
- Endpoint: `POST /transcription/export-subtitles` → subtitle file (attachment).
- Whisper transcribes locally, then timestamps are laid out proportionally per sentence.

## Agent loop
After generating a clip, call `analyze_loudness` to confirm level, `master_audio` to hit the platform LUFS, then `export_subtitles` for captions when the user wants them. See `34-content-recipes.md` for per-platform LUFS targets.

## Agent Callable
- **MCP Tools:** `21labs.analyze_loudness`, `21labs.export_subtitles`
- **REST Endpoints:** `POST /audio/analyze-loudness`, `POST /transcription/export-subtitles`
- **Key Backend Files:** `backend/services/loudness.py`, `backend/services/subtitles.py`, `backend/routes/audio_processing.py`, `backend/routes/transcription.py`
- **Key Frontend Files:** `app/src/features/workspace/AudioEnhanceView.tsx`

UPDATED: 2026-07-16
