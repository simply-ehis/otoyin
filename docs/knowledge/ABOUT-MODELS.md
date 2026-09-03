# About: Models Tab

> **PURPOSE:** Reference for the Models tab — model download, management, and status.
> **OWNS:** Model management UI, download/delete actions
> **READ-WHEN:** Working on model management, downloads, provider status
> **KEY-FILES:** `ModelsTab.tsx`, `ModelManagement.tsx` (in ServerSettings)
> **INVARIANTS:** Delegates entirely to ModelManagement component
> **GOTCHAS:** Tab delegates to ServerSettings/ModelManagement; no standalone logic
> **UPDATED:** 2026-08-07

## Overview

The Models tab shows all available AI models (TTS, Music, STT, LLM, Embedding, Voice Conversion) with download status and management actions.

## How It Works

The tab delegates entirely to the `ModelManagement` component from `@/components/ServerSettings/ModelManagement`.

## MCP Tool

Use `21labs.models_list` to programmatically list all models with status:

```json
{}
```

Returns all 34+ models with download/load status.

## Agent Callable
- **MCP Tools:** `21labs.models_list`, `21labs.models_download`, `21labs.models_load`, `21labs.models_unload`, `21labs.model_cache_dir`, `21labs.model_progress`
- **REST Endpoints:** `GET /models/status`, `POST /models/download`, `POST /models/download/cancel`, `DELETE /models/{name}`, `POST /models/load`, `POST /models/unload`, `GET /models/cache-dir`, `GET /models/progress/{name}`, `GET /models/recommended`, `GET /models/capabilities`
- **Key Backend Files:** `backend/routes/models/status.py`, `backend/routes/models/download.py`, `backend/routes/models/load_unload.py`, `backend/routes/models/cache.py`
- **Key Frontend Files:** `app/src/components/ModelsTab/ModelsTab.tsx`, `app/src/components/ServerSettings/ModelManagement.tsx`
