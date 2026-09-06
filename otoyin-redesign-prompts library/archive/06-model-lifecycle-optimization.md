# Prompt: Model Backend Loading Optimization

## Important — read before starting

Your stated goal was: "no model backend load when no model is active, and
when a model is cached=true, the backend can load at runtime — just that
one, not all models." **Most of this is already built.** Don't have an
agent rebuild it from scratch — audit what exists, close the actual gaps.

Confirmed in `backend/utils/model_lifecycle.py` (238 lines) and
`backend/backends/registry.py`:

- Backends are already lazily instantiated via factory functions and cached
  per-engine (`_tts_backends: dict[str, TTSBackend]`,
  `_llm_backends`, `_music_backends` — all populated on first use, not at
  startup).
- A real `ModelLifecycleManager` idle-unloads engines after
  `IDLE_TIMEOUT_SECONDS = 300` (5 min), polling every 30s.
  `ALWAYS_ON_ENGINES` is intentionally empty — **everything** idle-unloads,
  including the planner LLM (it's pre-warmed at app entry but still
  idle-unloads like everything else, per the module's own docstring).
- There's already a circuit breaker (3 failures → 5 min cooldown per engine)
  and per-engine keepalive override support (`_per_engine_keepalive`,
  probably DB-backed via `services/always_on.py` — check that file).
- Bundled-at-build-time models are already minimal and match your "small
  models only" instinct: `backend/scripts/download_required_models.py`
  bundles only DeepFilterNet ONNX (noise cleanup), Demucs v4 ONNX (source
  separation), Silero VAD (ships in the pip wheel), and LavaSR (ships in
  the pip wheel). Its own docstring says explicitly: "Larger models (TTS,
  STT, LLM, voice-conversion, Steam Audio) are NOT bundled — they download
  on first launch via the Models tab."

## What's actually left to verify/build

1. **Confirm `mark_model_used()` is called at the *start* of every inference
   request, not just tracked passively.** If any route under
   `backend/routes/` triggers a model load but forgets to stamp usage before
   a long-running generation, the model becomes eligible for idle-unload
   mid-request. Grep every route file that calls into `backends/registry.py`
   factory functions and cross-check against lifecycle manager calls. This
   is also flagged in 01 (bug audit) as a connection-flakiness suspect —
   these two investigations should share findings.

2. **The specific gap in your ask: does "cached=true" from the marketplace
   catalog actually gate *which single model* loads, or does the runtime
   just load whatever the user selects regardless of catalog cache state?**
   Check `docs/marketplace/catalog-schema-v1.json` and
   `backend/services/marketplace_catalog.py` for how "cached" is represented
   there (the audit didn't find an explicit `cached` field in a first pass —
   verify whether this concept exists yet in the catalog schema at all, or
   whether it needs to be added). If it doesn't exist yet: add a `cached`
   boolean (or better, a `local_status: "not_downloaded" | "downloading" |
   "cached"` enum) to the catalog entry, and make the model-selection UI
   check that status before triggering a load — cached models should be a
   one-step "activate," non-cached models should route through the
   marketplace download flow (see 07), not silently trigger a background
   download.

3. **Startup profiling.** Confirm nothing in `backend/main.py`'s startup
   path (search for `startup`, `lifespan`, `@app.on_event`) eagerly touches
   any TTS/STT/LLM backend beyond the intentionally-pre-warmed planner LLM.
   If the planner pre-warm is heavier than it needs to be on low-end
   hardware, consider making it lazy-on-first-assistant-interaction instead
   of at app entry — but confirm with a profiling run before changing this,
   since the current design is deliberate (its own docstring explains the
   reasoning), not accidental.

4. **UI-side signal for load/unload state.** Whatever the frontend redesign
   ends up looking like (03/04), make sure model load/unload state (loading,
   ready, idle-unloaded, circuit-open) is visible somewhere consistent —
   right now this all happens server-side with no obvious UI hook found in
   the audit. A user watching a spinner with no explanation of *why* is the
   same "flaky" perception problem flagged in 01.

## Deliverable

A short report confirming what's already correct (cite the file/line), a
concrete diff (or plan) for the `cached` catalog field if missing, and a
list of any routes found to be missing `mark_model_used()` calls.
