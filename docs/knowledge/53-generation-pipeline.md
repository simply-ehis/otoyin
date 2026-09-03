# Generation Pipeline (TTS orchestration)

PURPOSE: How a text+voice request becomes persisted audio — the core TTS path.
OWNS: services/generation.py (run_generation), utils/chunked_tts.py (generate_chunked), routes/generations.py (endpoints), services/task_queue.py (serial worker).
READ-WHEN: Touching TTS generation, retries, regeneration, effects-on-generate, cloud BYOK, or generation status/SSE.
KEY-FILES: services/generation.py, utils/chunked_tts.py, routes/generations.py, services/task_queue.py, services/profiles.py
INVARIANTS: Exactly one inference runs at a time (serial queue); run_generation is the single entry point for all background work; status updates go to DB + SSE subscribers + MCP speak-end event.
GOTCHAS: Cloud path (use_cloud) shares persistence but BYPASSES the local model load + rate_limiter on the engine path; regenerate forces seed=None and always normalizes; effects applied only in "generate" mode.
UPDATED: 2026-07-19

## Entry points
- `POST /generate` (routes/generations.py:generate_speech) — creates a `generation_id`, resolves engine/profile, enqueues `run_generation` via `task_queue.enqueue_generation`. Returns `GenerationResponse` immediately (work is async).
- `POST /profiles/{id}/speak` with `persist=false` — calls `generate_audio_sync` (services/generation.py:354): in-memory, no DB row, no file written, returns WAV bytes in the HTTP response. Used for live preview without polluting history.
- Retry / Regenerate / Cancellation endpoints route to the same `run_generation` with a different `mode`.

## run_generation modes (services/generation.py:33)
- `generate`   — full pipeline: save clean "original" version, optionally apply `effects_chain` and create a "version-2" processed version. Processed path is the final returned path when effects exist.
- `retry`      — re-runs with the SAME seed, NO effects, NO version creation. Single file overwrite of `{generation_id}.wav`.
- `regenerate` — re-runs with `seed=None` (variation), ALWAYS normalizes, creates a new version auto-labeled `take-{N+1}` (N = current version count via DB query, not list length — avoids TOCTOU).

## Persistence flow (_save_generate / _save_retry / _save_regenerate)
- Clean audio → `config.get_generations_dir()/{generation_id}.wav`; stored path is `config.to_storage_path(...)` (portable/relative).
- `versions.create_version` records label + effects_chain + `is_default`. "original" is default only when no effects; processed version is default when effects applied.
- Invalid effects chain → warning logged, effects SKIPPED, falls back to clean version as default (services/generation.py:315-320). No hard failure.

## Chunking (utils/chunked_tts.py:generate_chunked)
- Short text (<= `max_chunk_chars`, default 800) → single-shot `backend.generate()` (zero overhead).
- Long text → split at sentence boundary (skipping abbreviation periods like "Dr.", decimal numbers, and bracket paralinguistic tags `[laugh]`; also CJK `。！？`), then clause boundary `;:,—`, then whitespace, then hard cut (hard cut avoids splitting inside `[tags]`).
- Each chunk generated with `seed + i` (deterministic given (text, seed), avoids correlated RNG artifacts). Per-chunk `trim_fn` applied for Chatterbox-style trailing-noise engines.
- Chunks concatenated with `crossfade_ms` (default 50ms) overlap; `crossfade_ms=0` = hard cut. Sample rate taken from first chunk.

## Concurrency / pacing
- `task_queue._generation_worker` serializes ALL TTS inference (one at a time) to avoid GPU contention. Cancellation checked before each job runs; `CancelledError` during run deletes orphan `*.wav` files for that generation_id.
- `run_generation` calls `get_limiter("tts").acquire()` + `with_retry(..., attempts=3)` (rate_limiter.py) around inference — call pacing, NOT a user quota. Applies to both cloud and local paths.

## Cloud BYOK path (run_generation:70-133)
- When `use_cloud=True` and a default TTS provider is configured, synthesis routes to `synthesize_via_cloud_tts` (OpenAI-compatible) instead of the local model.
- OBSERVATION: the cloud branch acquires `get_limiter("tts")` + `with_retry` AND the local branch also does (line 168/172) — both paced. But the cloud branch does NOT call `load_engine_model` / `lifecycle_manager.mark_model_used` (correct — no local model). Note the cloud path resolves a fixed fallback voice `alloy` when `preset_voice_id` missing.
- After synthesis, cloud path reuses the SAME `_save_*` persistence + status/SSE/MCP flow as local. Good symmetry.

## Status + events
- `history.update_generation_status(...)` (DB) + `notify_generation_status(...)` (SSE queues in `_status_subscribers`) + `_notify_speak_end(...)` (MCP `speak-end` event, best-effort, never fatal).
- Status sequence: `loading_model` (if not loaded) → `generating` → `completed`/`failed`/`cancelled`.
- Exceptions: full traceback printed; status set to `failed` with `error=str(e)`. CancelledError handled separately (orphan file cleanup). `finally` always calls `task_manager.complete_generation` + `bg_db.close()`.

## Observations (not bugs — for later judgement)
1. **Cloud voice mapping is naive**: cloud path falls back to `"alloy"` when `preset_voice_id` is absent, while local path builds a full `voice_prompt` from samples. A profile cloned for local use may not map cleanly to a cloud voice id — could yield unexpected timbre on cloud routing.
2. **`assert effects_chain is not None`** (services/generation.py:313) in _save_generate — relies on a runtime assert rather than a typed guard; fine since `has_effects` already gated it, but an assert is unusual in this codebase (prefers explicit errors).
3. **Regenerate always normalizes** regardless of `normalize` flag (services/generation.py:180) — intentional per docstring, but means regenerate output can differ in loudness from a plain `generate` with `normalize=False`. Worth a UI note.
4. **`generate_audio_sync` opens+closes its own DB session** just to build the voice_prompt, then closes — the actual inference runs outside any DB session. Correct (no DB needed mid-inference) but the session is only used for the profile lookup.
5. **SSE subscriber dict is unbounded** (`_status_subscribers` never pruned on disconnect except via QueueFull suppression) — a slow/disconnected client could leak queues. Low risk at single-user local scale, but worth noting for multi-user/cloud deployments.

## Agent Callable
- **MCP Tools:** `21labs.speak`, `21labs.generate_sfx`, `21labs.generate_music`
- **REST Endpoints:** `POST /generate`, `POST /generate/stream`, `POST /profiles/{id}/compose`, `GET /generate/{id}/status`
- **Key Backend Files:** `backend/services/generation.py`, `backend/routes/generations.py`, `backend/backends/protocols.py`
- **Key Frontend Files:** `app/src/components/Generation/FloatingGenerateBox.tsx`, `app/src/lib/hooks/useGeneration.ts`, `app/src/lib/hooks/useGenerationProgress.ts`
