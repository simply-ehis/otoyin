---
name: audiobook-detailed
description: End-to-end audiobook production — import a script or EPUB, cast voices per character, render chapters, and export to Audible-ready format. Use when a user asks to "make an audiobook", "produce a chapter", or "cast voices for a book".
---
# Audiobook Production (Detailed)

## Purpose
Turn a long-form text (script, EPUB, PDF) into a multi-voice audiobook with per-character casting, chapter-by-chapter rendering, and platform-ready export.

## When to use
- User wants to produce an audiobook from a manuscript
- User needs multi-voice casting for different characters
- User wants to render chapter by chapter with quality checks
- User needs Audible-compatible export

## Prerequisites
- Text source (plain text, EPUB, or PDF)
- Voice profiles for each character/narrator
- TTS engine with good long-form quality (for example, Kokoro or another supported engine from `engine-atlas`)

## Agent procedure

### 1. Create the audiobook project
```
MCP: 21labs.create_audiobook(
  title="My Book",
  author="Author Name"
)
```
For EPUB/PDF ingest, use:
```
MCP: 21labs.import_audiobook(
  file_path="manuscript.epub",
  title="My Book"
)
```

### 2. Add chapters, then parse each chapter
```
MCP: 21labs.add_audiobook_chapter(
  book_id="audiobook-uuid",
  title="Chapter 1",
  text="<chapter text>"
)
MCP: 21labs.parse_audiobook_script(
  book_id="audiobook-uuid",
  chapter_id="<chapter-id>"
)
```
This splits the chapter into utterances for character casting.

### 3. Cast voices for each character
```
MCP: 21labs.list_profiles()
```
Then assign profiles one character at a time:
```
MCP: 21labs.add_audiobook_cast(
  book_id="audiobook-uuid",
  character="Narrator",
  profile_id="profile-uuid-narrator"
)
```

### 4. Render the book
```
MCP: 21labs.render_audiobook(
  book_id="audiobook-uuid",
  engine="<engine>",
  profile_id="<narrator-profile-id>"
)
```
This uses the batch queue; a chapter-scoped render is not separately routed, so chapter quality checks should happen before whole-book rendering.

### 5. Quality check
- Listen to the rendered chapter
- Check pronunciation, pacing, and character consistency
- Re-render individual utterances if needed

### 6. Export the finished audiobook
```
GET /audiobooks/{book_id}/export
GET /audiobooks/{book_id}/export-m4b
```
Use `export-m4b` for chaptered Audible delivery. There is no MCP export tool with a `format` parameter.

## Casting tips
- **Narrator** should be a calm, clear voice (Kokoro works well)
- **Characters** can use more expressive supported engines (for example, `zonos_gguf` for emotion control)
- **Consistency** — use the same voice profile throughout; don't switch engines mid-book
- **Pacing** — match speaking rates across voices so transitions feel natural

## Pitfalls / Gotchas
- Keep chapters separate until each passes quality checks
- Long chapters (> 30 min) may need to be split for memory
- Background noise in voice profiles degrades audiobook quality
- Always verify character name pronunciation before full render
- Export to M4B, not MP3 — M4B supports chapters and metadata

## Cross-links
- [engine-atlas](../engine-atlas/SKILL.md) — Current engine capabilities
- [voice-profiles](../voice-profiles/SKILL.md) — Profile management reference
- [loudness-metering](../loudness-metering/SKILL.md) — Verify audiobook loudness
- [platform-export](../platform-export/SKILL.md) — Export presets and delivery

## Validation
- Each chapter renders without errors
- Character voices are consistent across chapters
- No silence gaps > 1s between utterances
- Loudness is -18 to -20 LUFS (Audible standard)
- M4B export includes chapter metadata
