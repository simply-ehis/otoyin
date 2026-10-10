---
name: model-manager
description: Download, verify, activate, and delete otoyin models via the marketplace-only pipeline. Use when a user wants to "download a model", "delete a model", "activate an engine", or "verify model integrity".
---
# Model Manager

## Purpose
Drive the full model lifecycle without bypasses: download → verify → activate → delete, all through the marketplace manifest gate.

## When to use
- User wants a new voice/engine ("download Kokoro", "install the planner")
- Activate does nothing / model shows Installed but won't load
- Delete a model to free disk
- Check integrity after a crash or copy

## Prerequisites
- Backend running (`GET /health/ready` → ready:true)
- For paid models: license installed (My Licenses tab)

## Agent procedure

### 1. List status
```
MCP: 21labs.models_list()
REST: GET /models/status
```
Note `downloaded`, `downloading`, `loaded`, `preset_voices`, `clone_voice`, `voice_design`.

### 2. Download
```
MCP: 21labs.models_download(model_name="kokoro-onnx")
REST: POST /models/download {"model_name":"kokoro-onnx"}
```
Poll `GET /tasks/active` every 2s. "Already in progress" means a worker is running — do not start a second.

### 3. Verify
```
REST: GET /models/verify/kokoro-onnx
```
`match` or `no_baseline` → proceed. `checksum_mismatch`/`weights_missing` → re-download.

### 4. Activate
```
MCP: 21labs.models_load(model_name="kokoro-onnx")
REST: POST /models/load?engine=kokoro&model_size=default&model_name=kokoro-onnx
```
Always pass `model_name` (shared engines need it). Engine-mismatch 400 means the frontend resolved the wrong engine — re-list status and retry.

### 5. Delete
```
REST: DELETE /models/kokoro-onnx
```
409 while downloading → `POST /models/download/cancel` first, then delete.

## Pitfalls / Gotchas
- Never invent manifest rows or copy HF cache files directly — the gate will still block loads.
- Background workers use a fresh DB session; a 500 right after download usually means the worker hasn't committed yet — poll status.
- Windows file locks: retry delete after 2s; the manifest still frees even when files linger.

## Cross-links
- [engine-atlas](../engine-atlas/SKILL.md) — which engine to pick
- [voice-clone-workflow](../voice-clone-workflow/SKILL.md) — cloning after activation
- [troubleshooting](../troubleshooting/SKILL.md) — backend-down triage

## Validation
- `GET /models/status` shows `downloaded:true` after download, `loaded:true` after activate, `downloaded:false` after delete.
