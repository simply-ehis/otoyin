---
name: troubleshooting
description: Diagnostic flowcharts for otoyin failures — missing engine, loudness out of spec, alignment drift, batch failure, clone quality, export corruption, audio 404, server won't start. Load when a otoyin tool/endpoint errors or produces wrong output.
---
# Troubleshooting — Diagnostic Flows

## Purpose
Decision-tree diagnostics for the most common otoyin failures, grounded in `docs/knowledge/errors.md`
and `backend/mcp_server/tools/` (package). Each flow ends in a concrete fix or tool call.

## When to use
- A generation/export/MCP call fails or returns wrong audio.
- Loudness is off, clones sound bad, batch jobs fail, server won't start.

## Error shape (studio-themed)
`app/src/lib/errors.ts` maps raw errors to 12 studio codes: SIGNAL_LOST (network), ENGINE_STALLED
(timeout/server), MODEL_NOT_LOADED (download/load), INFERENCE_FAILED (generation), CORRUPTED_TRACK
(file corruption), UNSUPPORTED_FORMAT (decode), AUTOSAVE_FAILED (disk), UNEXPECTED_GLITCH (fallback).

## Flow 1 — Engine / model missing
```
Tool returns 400 "not downloaded yet" OR ValueError "not installed"
  → 21labs.list_models  (confirm engine key exists)
  → 21labs.models_download(<name>)  (e.g. "kokoro", "whisper-base")
  → if still failing AND a feature engine is absent → FALLBACK MATRIX (engine-atlas):
       Zonos missing → Fish Speech
       clone engine missing → f5_tts (zero-shot) or fish_speech
       multilingual → Fish Speech / MOSS-TTS-Nano
       tiny CPU → Pocket-TTS / KittenTTS / Kokoro
```

## Flow 2 — Loudness out of spec
```
21labs.analyze_loudness(audio_path) → integrated_lufs, true_peak_db
  target off by >1 LUFS?
    → 21labs.normalize_audio(audio_path, target_db=-14.0, max_peak_db=-3.0)
      OR 21labs.master_audio(audio_path, target_lufs=<recipe>, true_peak_db=-1.0)
    → re-measure; recipe LUFS: podcast -16, audiobook -18, film -24, voiceover -12, social/youtube -14
  true peak > -1.0 dBTP?
    → master_audio true_peak_db=-1.0 (true-peak limiter)
```

## Flow 3 — Alignment drift (ADR)
```
Dialogue out of sync with picture/guide track
  → re-run ADR align (guide track → takes → score → select → align)
  → if drift persists, split long takes at clause boundaries and align per segment
  → verify with analyze_loudness / spectrogram before export
```

## Flow 4 — Batch failure
```
21labs.get_batch_job(job_id) → status="failed", error=...
  → retry: smaller chunk / different engine / split long text into chapter/clip segments
  → 21labs.create_batch_job(name, func_name, func_args) again
  → repeated failures → alert user; do NOT spin parallel blocking calls
  → cancel stuck job: 21labs.cancel_batch_job(job_id)  (allowed while pending/running)
```
Statuses: pending, running, completed, failed, cancelled. Poll ~every 5s.

## Flow 5 — Clone quality issues
```
Cloned voice sounds wrong
  → use a BETTER reference sample (clean, target speaker only, ~10–30s)
  → if reference engine unavailable → nearest clone-capable (f5_tts / fish_speech / moss_tts_nano)
  → Kokoro has NO zero-shot clone — only preset blend ("af_bella,af_sky") + .pt packs
```

## Flow 6 — Export corruption
```
Exported file won't open / truncated
  → re-run master: 21labs.master_audio(...) or 21labs.run_recipe(...)
  → confirm source generation exists: GET /generate/{id}/status (not deleted)
  → check format/codec (UNSUPPORTED_FORMAT) — use WAV for masters
  → re-bounce: 21labs.bounce(tracks=[...])
```

## Flow 7 — Audio 404 (not ready)
```
speak returns poll_url; GET /generate/{id}/status → 404 or "processing"
  → POLL the status URL; generation is async (serial task queue)
  → Kokoro long text is chunked (250 chars, 120s/chunk timeout) — allow time
  → if never completes → check ENGINE_STALLED / server logs
```

## Flow 8 — Server won't start
```
Server fails to bind / import errors
  → run with PYTHONPATH=<repo root> (MCP mounts at /mcp)
  → check port conflict on 17493 (override twentylabs_PORT)
  → SIGNAL_LOST at client → server not up; restart backend
```

## Pitfalls / Gotchas
- A missing SoundFont (GM instruments) returns **501**, not 400 — install a .sf2 in `data/soundfonts`.
- `POST /conversation/render` does not exist — use `speak` per line + auto_duck/auto_level.
- 404 from `get_batch_job`/`get_story`/etc. means id not found, not "pending".

## Cross-links
- [engine-atlas](./engine-atlas/SKILL.md)
- [agent-operating-guide](./agent-operating-guide/SKILL.md)
- [mcp-tool-reference](./mcp-tool-reference/SKILL.md)
- [batch-queue](./batch-queue/SKILL.md)

## Validation
- After applying a fix, re-run the failing tool and re-measure (`analyze_loudness`) to confirm spec.
