# 67 — Audiobook Pipeline

> PURPOSE: How otoyin audiobook production works — import, cast, chapter, render.
> OWNS: backend/services/audiobook_render.py, backend/services/audiobook_llm.py, backend/services/book_import.py, backend/routes/audiobooks.py
> READ-WHEN: producing audiobooks, importing EPUB/PDF, multi-voice casting, troubleshooting audiobook rendering
> KEY-FILES: backend/services/book_import.py (EPUB/PDF import), backend/services/audiobook_llm.py (script editing), backend/services/audiobook_render.py (audio rendering), backend/routes/audiobooks.py (REST)
> INVARIANTS: audiobooks are stored in the database; chapters contain utterances; each utterance has a voice assignment
> GOTCHAS: EPUB import requires ebooklib; PDF import requires PyMuPDF; rendering requires a loaded TTS model
> UPDATED: 2026-08-21

## Overview

The audiobook pipeline handles the full lifecycle of audiobook production:
importing text from books, casting voices to characters, editing utterances,
and rendering to audio.

## Pipeline

1. **Import** — Load EPUB or PDF file, extract chapters and text
2. **Cast** — Assign voice profiles to characters/speakers
3. **Edit** — LLM-assisted script editing (clean up, add pauses, emotion tags)
4. **Render** — Generate audio for each chapter using assigned voices
5. **Export** — Combine chapters into a complete audiobook

## MCP tools

| Tool | Description |
|---|---|
| `21labs.import_audiobook` | Import EPUB/PDF as audiobook |
| `21labs.list_audiobooks` | List all audiobook projects |
| `21labs.get_audiobook` | Get audiobook with chapters and cast |
| `21labs.create_audiobook` | Create new audiobook project |
| `21labs.add_audiobook_chapter` | Add chapter to audiobook |
| `21labs.add_audiobook_cast` | Assign voice to character |
| `21labs.parse_audiobook_script` | Parse chapter script into utterances |
| `21labs.list_audiobook_utterances` | List chapter utterances |
| `21labs.render_audiobook` | Render entire audiobook |
| `21labs.render_audiobook_chapter` | Render single chapter |

## REST endpoints

| Endpoint | Method | Description |
|---|---|---|
| `POST /audiobooks/import` | POST | Import EPUB/PDF |
| `GET /audiobooks` | GET | List audiobooks |
| `GET /audiobooks/{id}` | GET | Get audiobook detail |
| `POST /audiobooks` | POST | Create audiobook |
| `POST /audiobooks/{id}/chapters` | POST | Add chapter |
| `POST /audiobooks/{id}/cast` | POST | Assign voice |
| `POST /audiobooks/{id}/render` | POST | Render audiobook |
| `POST /audiobooks/chapters/{id}/render` | POST | Render chapter |

## Agent callable

```python
# Import a book
audiobook = mcp.call("21labs.import_audiobook", file_path="/path/to/book.epub")

# Cast voices
mcp.call("21labs.add_audiobook_cast", audiobook_id=audiobook["id"], character="Narrator", profile_id="profile_123")

# Render
mcp.call("21labs.render_audiobook", audiobook_id=audiobook["id"])
```

## Supported formats

- **EPUB** — Full chapter extraction via ebooklib
- **PDF** — Text extraction via PyMuPDF (layout may vary)
- **Plain text** — Direct import as single chapter
