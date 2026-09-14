# 82 — Model Integrity (SHA-256 + Dedup + Marketplace Gate)

PURPOSE: How downloads are verified, deduped, and gated to the marketplace.
OWNS: backend/services/model_integrity.py, backend/routes/models/download.py, backend/routes/models/load_unload.py
READ-WHEN: You touch model download/delete/load, or debug "Installed but won't activate".
KEY-FILES: backend/services/model_integrity.py, backend/services/model_registry.py, backend/routes/models/download.py
INVARIANTS: Only the marketplace creates manifest rows; loads never auto-download; re-download is idempotent.
GOTCHAS: Request DB sessions die with the HTTP request — background workers must open a fresh SessionLocal.
UPDATED: 2026-09-11

## Download flow (POST /models/download)
1. License gate for paid products (402 when missing).
2. Dedup: 409-style early return when the same model is already downloading.
3. Background worker: pip deps → HF fetch (3 retries) → ONNX quantize → on-disk weight check → manifest upsert with fresh DB session → SHA-256 sidecar snapshot.
4. Progress via `GET /models/progress/{name}` (SSE) + `GET /tasks/active` polling.

## SHA-256 verification
- Sidecar: `data/model-hashes/<model>.json` (`snapshot_model_hashes`).
- Verify: `GET /models/verify/{name}` (`verify_model_hashes`) — `no_baseline` for pre-existing installs, `match` / `checksum_mismatch:<file>` / `weights_missing` otherwise.
- Load gate refuses `checksum_mismatch` with "re-download from the Store".

## Dedup
- DB UNIQUE(model_name, model_size) — re-download upserts, never duplicates.
- In-flight guard in `trigger_model_download` — one worker per model.
- Generation dedup via `compute_generation_dedup_key` (task_queue).

## Delete flow (DELETE /models/{name})
- 409 when still downloading (cancel first). Always cleans manifest + progress + hash sidecar, even when the cache dir is already gone or Windows holds a lock (3 retries, then manifest still freed).
- Post-delete `is_downloaded` check — a lingering row is a 500, not silent "delete did nothing".

## Activate flow (POST /models/load)
- Requires `model_name` + matching `engine` (shared-engine mismatch is a 400, not a silent no-op).
- Manifest gate + integrity gate before `load_engine_model`, then a post-load `check_model_loaded` confirm.

## Agent Callable
- **MCP Tools:** `21labs.models_list`, `21labs.models_download`, `21labs.models_load`, `21labs.models_unload`, `21labs.model_progress`
- **REST:** `POST /models/download`, `POST /models/download/cancel`, `DELETE /models/{name}`, `POST /models/load`, `GET /models/verify/{name}`, `GET /models/status`
- **Key Files:** `backend/services/model_integrity.py`, `backend/services/model_registry.py`, `backend/routes/models/download.py`, `backend/routes/models/load_unload.py`
