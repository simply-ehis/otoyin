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
- TTS engine with good long-form quality (Kokoro, Chatterbox, or Qwen)

## Agent procedure

### 1. Create the audiobook project
```
MCP: 21labs.create_audiobook(
  title="My Book",
  source_path="manuscript.epub"
)
```

### 2. Parse the script into chapters
```
MCP: 21labs.parse_audiobook_script(
  audiobook_id="audiobook-uuid"
)
```
This splits the text into chapters and detects character names from dialogue tags.

### 3. Cast voices for each character
```
MCP: 21labs.list_profiles()
```
Then assign profiles:
```
MCP: 21labs.update_audiobook_cast(
  audiobook_id="audiobook-uuid",
  cast={
    "Narrator": "profile-uuid-narrator",
    "Alice": "profile-uuid-alice",
    "Bob": "profile-uuid-bob"
  }
)
```

### 4. Render a chapter
```
MCP: 21labs.render_audiobook_chapter(
  audiobook_id="audiobook-uuid",
  chapter_number=1
)
```
This generates audio for every utterance in the chapter, using the cast voice for each character.

### 5. Quality check
- Listen to the rendered chapter
- Check pronunciation, pacing, and character consistency
- Re-render individual utterances if needed

### 6. Export the finished audiobook
```
MCP: 21labs.export_audiobook(
  audiobook_id="audiobook-uuid",
  format="m4b"
)
```
M4B is the standard format for Audible and other audiobook platforms.

## Casting tips
- **Narrator** should be a calm, clear voice (Kokoro works well)
- **Characters** can use more expressive engines (Chatterbox for emotion)
- **Consistency** — use the same voice profile throughout; don't switch engines mid-book
- **Pacing** — match speaking rates across voices so transitions feel natural

## Pitfalls / Gotchas
- Keep chapters separate until each passes quality checks
- Long chapters (> 30 min) may need to be split for memory
- Background noise in voice profiles degrades audiobook quality
- Always verify character name pronunciation before full render
- Export to M4B, not MP3 — M4B supports chapters and metadata

## Cross-links
- `67-audiobook-pipeline.md` — Audiobook pipeline knowledge doc
- `tts-kokoro` — Kokoro for narrator voices
- `tts-chatterbox` — Chatterbox for expressive character voices
- `tts-qwen` — Qwen for multilingual audiobooks
- `loudness-metering` — Verify audiobook loudness (-18 to -20 LUFS)
- `platform-export` — Export to Audible format

## Validation
- Each chapter renders without errors
- Character voices are consistent across chapters
- No silence gaps > 1s between utterances
- Loudness is -18 to -20 LUFS (Audible standard)
- M4B export includes chapter metadata
