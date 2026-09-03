# 68 — Translation Service

> PURPOSE: How otoyin text translation works via local LLM.
> OWNS: backend/services/translation.py, backend/mcp_server/tools/studio_domains.py
> READ-WHEN: translating text, integrating translation into dubbing/recipes
> KEY-FILES: backend/services/translation.py (service), backend/routes/translate.py (REST), backend/mcp_server/tools/studio_domains.py (MCP tools)
> INVARIANTS: translation uses the local gguf_llm backend; requires a loaded LLM model
> GOTCHAS: quality depends on the loaded LLM model; Qwen3-4B is recommended for translation
> UPDATED: 2026-08-21

## Overview

otoyin provides text translation powered by the local LLM engine. This is used
internally by the dubbing pipeline and exposed as MCP tools for agent use.

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
