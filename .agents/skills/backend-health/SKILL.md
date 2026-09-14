---
name: backend-health
description: Triage "backend keeps dying" — readiness, logs, slow requests, and safe restart. Use when the console fills with fetch errors, downloads stall midway, or the status banner says starting.
---
# Backend Health

## Purpose
Distinguish starting vs crashed vs slow, and recover without losing downloads.

## When to use
- Wall of `Signal lost / 503 / Failed to fetch` errors
- Download stalls at N% then the backend is gone
- `Backend is starting` banner sticks

## Agent procedure

### 1. Probe (quiet, no spam)
```
REST: GET /health/live (process alive?) → GET /health/ready (ready? initializing? startup_failed?)
REST: GET /health (subsystems: task_queue, lifecycle, database) + X-Request-ID header
```
`initializing` → wait 2s and re-poll (frontend does this automatically). `startup_failed` → read `error` field (usually DB path/permissions).

### 2. Read logs
Look for: `slow request ... took NNNms` (model load blocking loop), `Background task failed` (download worker traceback with rid), `LOW MEMORY` (<512MB free → loads skipped to avoid OOM kill).

### 3. Recover
- Initializing: wait — polls back off automatically, downloads resume.
- Crashed: restart backend (`just dev-backend`), then `GET /models/status` + `GET /tasks/active` — errored downloads show Retry.
- Stuck download: `POST /models/download/cancel` → `POST /models/download` again (idempotent).

## Pitfalls / Gotchas
- Don't hammer polls during startup — 503 + Retry-After means back off.
- Download executor is single-worker; a second start while one runs returns "already in progress".
- Always correlate frontend errors via `X-Request-ID` response header.

## Cross-links
- `model-manager` — retry the download after recovery
- `troubleshooting` — full failure taxonomy

## Validation
- `/health/live` 200, `/health/ready` ready:true, status polls green, no console spam.
