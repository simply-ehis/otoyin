---
name: reference-voices
description: Browse and use bundled celebrity voice clips as zero-shot cloning references. GET /reference-voices, POST /reference-voices/{id}/use.
---
# Reference Voices

## Purpose
A curated library of 30-second celebrity/character voice clips bundled with the
app. Each clip serves as a zero-shot reference for any cloning-capable TTS
engine (Fish Speech, Zonos, F5-TTS, StyleTTS2, Pocket-TTS, etc.).

## When to use
- User wants a quick voice without recording their own reference.
- "Read like a detective", "make it sound like a news anchor".
- Need a specific language or category (e.g. "Japanese female villain").

## Prerequisites
- Voice pack downloaded: optional separate pack (checked via `pack_downloaded()`).
  If not downloaded, the manifest is still listed but clips return 404 on audio.
- Tool surface: `GET /reference-voices`, `POST /reference-voices/{id}/use`.
  No MCP tool yet — use REST directly.

## Endpoint contracts (REAL from `routes/reference_voices.py`)
| method | path | returns | notes |
|--------|------|---------|-------|
| GET | `/reference-voices?language=en&category=anime` | `{voices, languages, categories, pack_downloaded, manifest_count}` | filters by lang/category |
| GET | `/reference-voices/{voice_id}` | `{id, name, language, category, duration, description}` | metadata only |
| GET | `/reference-voices/{voice_id}/audio` | audio file stream | media type auto-detected |
| POST | `/reference-voices/{voice_id}/use` | `{profile_id, profile_name, sample_id, voice_id, voice_name}` | creates a VoiceProfile + sample from the clip |

`pack_downloaded()` checks whether the reference-voices pack directory exists
on disk (`data/reference_voices/`).

## Agent procedure
1. `GET /reference-voices?language=<lang>` to list available clips.
2. Inspect `pack_downloaded` — if `false`, instruct the user to download the pack
   from the Models tab (no silent failure).
3. Preview a clip's audio: `GET /reference-voices/{id}/audio`.
4. Use it: `POST /reference-voices/{id}/use` with optional `profile_name`. This
   creates a VoiceProfile with the clip as a sample. The profile can then be
   selected in any generation via `profile_id`.

## Voice metadata fields
| field | type | notes |
|-------|------|-------|
| id | str | unique key, e.g. `"detective-deep"` |
| name | str | human label, e.g. "Detective Deep" |
| language | str | ISO 639-1, e.g. `"en"` |
| category | str | e.g. `"anime"`, `"news"`, `"characters"` |
| duration | float | seconds (always ~30) |
| description | str | flavor text, e.g. "Gravelly, late-night radio tone" |

## Pitfalls / Gotchas
- **30-second clips only** — not full-length performances. For longer needs,
  record a custom voice profile via the Voice Profiles tab.
- **Zero-shot only** — works with CLONING_ENGINES set. Cannot drive preset-only
  engines (Kokoro, ChatTTS).
- **Language filter is exact** — `"en"` not `"eng"`. Categories like `"anime"`
  span multiple languages.
- **Audio is streamed** — `Content-Disposition: inline` header, plays in-browser.

## Cross-links
- [engine-atlas](../engine-atlas/SKILL.md)
- [voice-profiles](../voice-profiles/SKILL.md)
- [voice-cloning](../voice-cloning/SKILL.md)

## Validation
- `GET /reference-voices` returns `pack_downloaded: true/false` and a `voices` array.
- `POST /reference-voices/{id}/use` returns a new `profile_id` usable in generation.
