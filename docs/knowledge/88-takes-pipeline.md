# 88 - Takes Pipeline (words + speakers + events, video-use-compatible)

PURPOSE: Local per-capture takes pipeline emitting Scribe-shaped JSON + packed markdown readable by video-use agents.
OWNS: backend/services/diarization.py (word merge), backend/backends/yamnet_onnx_backend.py, backend/services/scribe_json.py, backend/services/chapters.py, backend/services/captures.py (auto-pack), app pack/highlight/chapter UI.
READ-WHEN: touching transcripts, diarization, audio events, capture packs/chapters/highlights, or the video-use interop contract.
KEY-FILES: scribe_json.py (normalizer+orchestrator), yamnet_onnx_backend.py (16MB bundled ONNX), packTranscript.ts (render+select), PackedTranscriptView.tsx (UI).
INVARIANTS: local-only (no cloud keys); Scribe-shaped words stay byte-compatible with video-use pack_transcripts.py assumptions; pack never enters otoyin assistant context; YAMNet weights bundled, never committed.
GOTCHAS: faster-whisper words are milliseconds (Scribe wants seconds); packer needs speaker_N IDs; YAMNet frames are 0.48s-hop (coarser than words); *.onnx is gitignored → build-time fetch.
UPDATED: 2026-09-23

Local takes pipeline: every transcribed capture produces Scribe-shaped JSON
(words + speakers + audio events) plus a ~12KB packed markdown reading view,
an event-highlights list, and auto-chapters — all on-device, no API keys.

## Architecture

### Words (`backend/backends/faster_whisper_backend.py`)
- `transcribe_with_words()` returns `[{word, start_ms, end_ms, confidence}]`
  (milliseconds). Parakeet segments (`{text, start, end}` seconds) also accepted.

### Speakers (`backend/services/diarization.py`)
- `diarize_turns()` — Resemblyzer + Silero VAD + sklearn turns (existing).
- `align_words_to_speakers(words, turns)` — NEW: intersect word spans with
  turns; majority-overlap wins, ties go earliest, gap words inherit nearest,
  empty turns leave unset. Returns new dicts (inputs untouched).

### Events (`backend/backends/yamnet_onnx_backend.py`)
- YAMNet via ONNX Runtime: 521 AudioSet classes per 0.48 s frame, raw 16 kHz
  mono in (mel frontend baked into the graph — nothing to reimplement).
- Weights `audiomagic/yamnet-onnx` (~16 MB) are BUNDLED
  (`build_binary.py` --add-data, frozen-aware resolve, models-dir fallback).
- `score_audio()` returns per-frame `{start, end, scores}`; `class_names()`
  reads the shipped CSV. Provenance parity test pins the README reference
  vectors (sine→Beep, silence→Silence 1.00).

### Normalizer (`backend/services/scribe_json.py`)
- `normalize_words()` (ms→s), `synthesize_spacing()` (gap tokens),
  `attach_speakers()` (defaults `speaker_0`), `events_from_scores()` +
  `merge_event_tokens()` (curated `EVENT_VOCABULARY`, run-merge, keeps max
  score), `build_scribe_json()` (sorted, typed, joined text),
  `audio_peak_dbfs()` (silence gate at −60 dBFS).
- `build_capture_words_json()` orchestrates all four stages best-effort and
  writes `<capture>.words.json` (cache-if-exists).

### Captures (`backend/services/captures.py`, `backend/routes/captures.py`)
- Create/retranscribe auto-build the sidecar (failures skip it, never the row);
  delete removes it. `GET /captures/{id}/words` serves it (404-tolerant),
  `GET /captures/{id}/chapters` serves auto-chapters from it.

### Chapters (`backend/services/chapters.py`)
- `build_chapters()`: silence gaps ≥3 s split, applause runs close, music
  runs ≥10 s open labeled breaks; titles from the chapter's own words.

### Frontend (`app/src/lib/transcript/packTranscript.ts`, `app/src/features/captures/`)
- `groupIntoPhrases`/`renderPackedMarkdown` mirror video-use's packer rules;
  `selectHighlights` (threshold → pad → merge → top-N → chronological).
- `PackedTranscriptView`: pack + highlights + chapters with copy/download;
  404-tolerant empty hint. Wired into `DetailPane`.

## Invariants
- Scribe-shaped JSON is the interop contract: sorted, monotonic, types in
  {word, spacing, audio_event}, `speaker_N` IDs. `test_takes_interop.py`
  replicates video-use's grouping rules against our output.
- Pack is user-facing + export only — never injected into assistant context.
- YAMNet weights ship in the installer; never commit `*.onnx`.

## GOTCHAS
- YAMNet export pads sub-length inputs (1 s → 2 frames); don't assert the
  README's frame-count formula for short audio.
- `model_load_progress(name, False)` raises by design — bundled models pass True.
- Community ONNX exports earn trust via parity test, not reputation.
- Thresholds (`0.5` events, per-class later) need real-take tuning passes.

## Agent Callable
- **MCP Tools:** (none new — surfaces are REST + UI; `21labs.transcribe` feeds the pipeline)
- **REST Endpoints:** `GET /captures/{id}/words`, `GET /captures/{id}/chapters`
- **Key Backend Files:** `backend/services/scribe_json.py`, `backend/services/diarization.py`, `backend/services/chapters.py`, `backend/backends/yamnet_onnx_backend.py`, `backend/services/captures.py`, `backend/routes/captures.py`
- **Key Frontend Files:** `app/src/lib/transcript/packTranscript.ts`, `app/src/features/captures/PackedTranscriptView.tsx`, `app/src/features/captures/DetailPane.tsx`, `app/src/lib/api/clientCaptures.ts`
