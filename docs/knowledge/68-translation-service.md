# 68 — Translation Service

> PURPOSE: How otoyin text translation works (cloud API today; Argos packs pending).
> OWNS: backend/services/translation.py, backend/mcp_server/tools/studio_domains.py
> READ-WHEN: translating text, integrating translation into dubbing/recipes
> KEY-FILES: backend/services/translation.py (service), backend/routes/translate.py (REST), backend/mcp_server/tools/studio_domains.py (MCP tools), app/src/features/translate/TranslateView.tsx (UI, /translate tab)
> INVARIANTS: /translate currently uses Google via deep-translator (network required, NOT offline) — the 20 Argos offline packs in the Store are installed but not yet consulted by this path (tracked follow-up). Dubbing has its own Argos path.
> GOTCHAS: quality depends on the upstream API; translate failures surface HTTP 400 with the provider message. The TranslateView error box links to the Store for offline packs.
> UPDATED: 2026-09-12

## Overview

otoyin exposes text translation over REST (`/translate`), MCP tools, and —
since P5 — a dedicated Translate tab (`/translate`, `TranslateView.tsx`).
The service path is currently cloud-backed (see INVARIANTS); the tab shows
the provider error plus a Store link for offline packs when it fails.

## MCP tools

| Tool | Description |
|---|---|
| `21labs.translate_text` | Translate text to target language |
| `21labs.translate_batch` | Batch translate multiple text segments |
| `21labs.translate_languages` | List supported target languages |

## REST endpoints

| Endpoint | Method | Description |
|---|---|---|
| `POST /translate` | POST | Translate text |
| `POST /translate/batch` | POST | Batch translate |
| `GET /translate/languages` | GET | List languages |

## Agent callable

```python
# Translate text
result = mcp.call("21labs.translate_text", text="Hello world", target_language="es")

# Batch translate
results = mcp.call("21labs.translate_batch", texts=["Hello", "Goodbye"], target_language="fr")

# List languages
langs = mcp.call("21labs.translate_languages")
```

## Dependencies

- Requires a loaded LLM model (gguf_llm backend)
- Recommended model: Qwen3-4B for best translation quality
- Falls back to smaller models with reduced quality
