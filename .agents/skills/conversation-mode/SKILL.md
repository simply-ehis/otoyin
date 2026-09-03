---
name: conversation-mode
description: Build multi-speaker podcast/debate/interview audio via Conversation mode — stage timed lines, auto-duck overlapping speakers, and auto-level to a target LUFS.
---
# Conversation Mode (Podcast / Debate / Interview)

## Purpose
Produce timed multi-speaker speech (podcast, debate, interview, audiobook with character voices)
where each line is a discrete TTS clip placed on a track at a relative offset, then balanced with
auto-ducking and auto-level-matching so no single voice dominates.

## When to use
- User asks for a multi-host podcast, debate, or interview between AI voices.
- Script has >1 scripted speaker (see ../dialogue-methodology/SKILL.md flowchart).
- Character-voice audiobook narration.

## Prerequisites
- Engine/model: any TTS (see ../engine-atlas/SKILL.md). Default line engine is `kokoro`.
- Voice/profile: one profile per speaker via `list_profiles` / `list_voices`.
- Tool surface: REST `POST /conversation/...` + MCP `21labs.conversation_auto_duck |
  conversation_auto_level | list_conversation_presets`.

## Parameters / Schema (backend/routes/conversation.py)
ConversationLine fields:
| field | type | default | notes |
|-------|------|---------|-------|
| id | str | — | unique line id |
| text | str | — | spoken line |
| speaker | str | — | speaker label |
| engine | str | "kokoro" | TTS engine per line |
| profile_id | str? | None | voice profile override |
| start_mode | str | "relative_to_previous" | timing mode |
| start_offset_ms | int | 0 | offset from prior line |
| overlap_ms | int | 0 | intentional overlap |
| track | int | 0 | track index for ducking |

Presets (`GET /conversation/presets`): debate (tension 0.5, turn 5000ms, interruption yes),
podcast_interview (0.3, 8000ms, no), podcast_panel (0.4, 6000ms, yes), dramatic_dialogue (0.9, 3000ms, yes).

`POST /conversation/auto-duck` body: `{"lines": [ConversationLine, ...]}`.
`POST /conversation/auto-level` body: `{"lines": [ConversationLine, ...]}`.

## Agent procedure
1. Cast each speaker to a `profile_id` (clone or preset). [VERIFY IN CODE] how render resolves
   profile → engine.
2. Build the line list with `start_offset_ms` / `overlap_ms` for pacing (tracks group ducking).
3. Render timed audio. NOTE: `POST /conversation/render` is NOT implemented in
   `backend/routes/conversation.py` (see Pitfalls) — generate each line with `generate_speech`, then
   build the mixed, timed episode with **`run_recipe`** (it crossfades the speakers, ducks any music
   bed, and masters to the recipe's LUFS target), optionally using Conversation `auto-duck` +
   `auto-level` first for per-speaker gain/LUFS planning.
4. `POST /conversation/auto-duck` → gain envelope (returns `{"gains":[...]}`, clamped to −12 dB,
   −6 dB per second of same-track overlap).
5. `POST /conversation/auto-level` → returns `{"target_lufs":[...]}` (all −16.0 podcast target
   as of this read).
6. MCP equivalents: `21labs.conversation_auto_duck(lines)` /
   `21labs.conversation_auto_level(lines)` / `21labs.list_conversation_presets()`.

## Worked example
```python
# MCP
duck = await twentylabs_conversation_auto_duck(lines=[
  {"id":"l1","text":"Welcome.","speaker":"Host","profile_id":"p_host","start_offset_ms":0,"track":0},
  {"id":"l2","text":"Thanks for having me.","speaker":"Guest","profile_id":"p_guest","start_offset_ms":4000,"track":0},
])
# -> {"gains":[0.0, -6.0]}
```

## Pitfalls / Gotchas
- **No render route in code.** `backend/routes/conversation.py` implements only
  `/conversation/auto-duck`, `/conversation/auto-level`, `/conversation/presets`. There is NO
  `POST /conversation/render` route and NO MCP `conversation/render` tool (it was documented but never
  implemented). **Multi-speaker mixing/timing is achieved via `run_recipe`** (crossfades speakers +
  ducks any music bed + masters), optionally after `auto-duck`/`auto-level` for gain/LUFS planning.
  Stage per-line generation, then `run_recipe`.
- **Schema drift vs doc 21.** Doc 21 shows `speaker_id/text/voice_profile_id/start_ms/effects_chain`;
  code uses `speaker/profile_id/start_offset_ms/overlap_ms/start_mode/track`. Use the CODE schema.
- **Route name.** Level-match is `/conversation/auto-level` (doc 21 calls it `level-match`).
- Auto-duck only ducks lines sharing the same `track`.
- Always auto-duck + auto-level before export; never hand-clip peaks.

## Cross-links
- [dialogue-methodology](../dialogue-methodology/SKILL.md)
- [adr-mode](../adr-mode/SKILL.md)
- [effects-field-guide](../effects-field-guide/SKILL.md)
- [engine-atlas](../engine-atlas/SKILL.md)

## Validation
- `GET /conversation/presets` returns 4 presets.
- Auto-duck on ≥2 same-track overlapping lines returns at least one gain < 0 (≤ −12 dB max).
- `measure_loudness` on exported mix ≈ −16 LUFS mono (podcast).
