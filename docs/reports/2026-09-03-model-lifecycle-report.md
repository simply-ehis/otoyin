# Model Backend Loading — Audit & Gap Report

**Date:** 2026-09-03
**Prompt:** `otoyin-redesign-prompts/06-model-lifecycle-optimization.md`
**Status:** Audit pass. Most of the requested behavior already exists; one real
gap found (catalog `local_status` annotation), with a proposed implementation.

---

## 1. What's already correct (verified with file:line)

The prompt warned "most of this is already built — don't rebuild it." Confirmed:

| Claim | Evidence |
|---|---|
| Backends lazily instantiated, cached per-engine | `backend/backends/registry.py` — `_tts_backends`/`_stt_backends`/`_llm_backends` populated on first use via factory getters; registration wrapped in try/except in `backend/app.py:494-555` ("Only register backends that have models available") |
| Idle-unload manager, 5 min timeout, 30s poll | `backend/utils/model_lifecycle.py:41-42` (`IDLE_TIMEOUT_SECONDS = 300`, `POLL_INTERVAL_SECONDS = 30`); loop at `:156-166` |
| `ALWAYS_ON_ENGINES` empty — everything idle-unloads incl. planner | `backend/utils/model_lifecycle.py:47`; module docstring |
| Per-engine keepalive overrides (DB-backed) | `backend/utils/model_lifecycle.py:106-124` (`refresh_performance_mode`, `_per_engine_keepalive`) via `backend/services/always_on.py`; UI toggles wired at `backend/routes/models/always_on.py:25-28` |
| Circuit breaker (3 failures → 5 min cooldown) | `backend/utils/model_lifecycle.py:50-51`; state at `:128-152` |
| Circuit breaker actually enforced (was dead logic in the 2026-09-03 audit — now wired) | `backend/backends/registry.py:230-245` — `is_circuit_open` gate raises HTTP 503 `engine_circuit_open` with `retry_after_seconds`; failures recorded at `:302-306` |
| Minimal bundled model set | `backend/scripts/download_required_models.py` — only DeepFilterNet ONNX, Demucs v4 ONNX, Silero VAD, LavaSR; docstring: larger models download on first launch via the Models tab |
| Startup doesn't eagerly load heavy models | `backend/app.py:584-612` — Kokoro preload runs only if cached AND `preload_on_start` setting enabled; planner preload is a background task (`:617+`); readiness is signaled after lifecycle *registration* (which does not instantiate heavy models) at `:563-565` |

## 2. `mark_model_used()` coverage — verified COMPLETE

Every route that triggers inference stamps usage at request start:

- TTS: `backend/routes/generate.py:49,104`; service-layer `backend/services/generation.py:231`
- STT: `backend/routes/transcription.py:95`
- Diarization: `backend/routes/diarization.py:122`
- Voice conversion: `backend/routes/voice_convert.py:85,97`
- LLM: `backend/routes/llm.py:46`

Procedural-only routes (Freesound search, instruments) correctly do not stamp —
no resident ML model to protect. **No missing `mark_model_used()` call found.**
(A 5-minute+ single generation could theoretically race unload if a route ever
forgot its start-stamp; the lifecycle manager only polls every 30s, so the race
window is small — but the rule to keep is: stamp at request *start*, which all
current routes do.)

## 3. THE GAP: catalog has no per-product local-state annotation

The "cached=true gates which single model loads" concept **partially exists**
but is not surfaced:

- The signed catalog (`backend/services/marketplace_catalog.py` `PRODUCTS`,
  `docs/marketplace/catalog-schema-v1.json`) has **no `cached` /
  `local_status` field** on products.
- The *download state* exists in a separate DB manifest:
  `backend/services/model_registry.py:70` `is_downloaded(model_name,
  model_size)` backed by the `ModelDownload` table, and it already gates loads:
  `backend/backends/registry.py:218` blocks non-downloaded models at load time
  with the friendly `MODEL_NOT_DOWNLOADED_MSG`.
- But the UI catalog endpoints (`GET /marketplace/catalog`,
  `GET /marketplace/catalog/local` in `backend/routes/marketplace.py:41-48,
  294-328`) return products **without** any per-product download status. The
  Store UI would have to cross-reference entitlements + downloads list +
  catalog itself to render "owned / cached / needs download".

**Proposed fix (do not add `cached` to the signed catalog — local state does
not belong in a signed, tamper-protected document; compute it at serve time):**

1. New helper in `backend/services/model_registry.py`:
   `local_status_for(product_id) -> "not_downloaded" | "cached"` — resolve the
   product to its `engine`/`model_name`/`model_size` (via
   `backend/backends/configs.py` for model products; bundled extras like
   Demucs/DeepFilter/Steam Audio are always `"cached"`) and return
   `is_downloaded(...)` result.
2. `GET /marketplace/catalog/local` (`backend/routes/marketplace.py:294`)
   annotates each product with `local_status` before returning. The signed
   catalog document itself stays untouched (signature intact); the annotation
   is response-only.
3. Model-selection UI rule (consumed by prompts 04/07 redesign):
   `local_status == "cached"` → one-step "Activate". Otherwise → the Store /
   Models-tab install flow; a non-cached selection must NOT silently trigger a
   background download (see prompt 07 Part A — this closes the same gate from
   the UI side).

This also resolves the pack's underlying ask — "does cached=true gate which
single model loads" — because `registry.py:218` already enforces download-
before-load, and the annotation makes that state visible and actionable in the
UI instead of a hard error.

## 4. UI-side signal for load/unload state

The backend surface already exists: `GET /models/capabilities`
(`backend/routes/models/capabilities.py`) returns `loaded_now`, per-engine
`available`, `always_on`, and `idle_unload_seconds`; `/health` also lists
loaded engines. **What's missing is the frontend surface** — with
`app/src/components/` archived, there is no model-status UI at all right now.
The redesign (prompt 04) must include a consistent model-state indicator
(loading / ready / idle-unloaded / circuit-open with retry countdown) so the
"working circuit breaker with no UI" perception gap from the 01 audit is
closed. The `engine_circuit_open` 503 carries `retry_after_seconds` — the UI
should render "temporarily unavailable, retry in N min" from that field.

## 5. Startup profiling note

`backend/main.py` startup path (`backend/app.py` lifespan) registers lifecycle
handles without instantiating heavy backends (all wrapped in try/except,
`app.py:494-555`); both preloads (Kokoro, planner LLM) are background tasks
gated by settings (`app.py:584-620`). No change proposed — the current design
is deliberate and already satisfies "no model backend load when no model is
active."

---

## Verification status

- All file:line references above verified by direct read/grep in this tree.
- **§3 implemented 2026-09-03 (this session, same day):**
  - `backend/services/model_registry.py` — new `local_status_for(model_name, model_size=None)`
    (resolves the real size from the model config; bundled-on-disk models are
    manifest-seeded by `reconcile_downloads()` at startup; DB/init failures
    fall back to `not_downloaded`, the safe direction).
  - `backend/routes/marketplace.py` — `_annotate_local_status()` adds
    per-product `local_status` to `GET /marketplace/catalog` and
    `GET /marketplace/catalog/local` (response-only enrichment, applied after
    signature verification so the signed document stays valid).
  - Verified: 43/43 products annotated; ruff + py_compile + placeholder gate
    green.