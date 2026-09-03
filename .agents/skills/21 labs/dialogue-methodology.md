# Dialogue Methodology (mirror)

How real dialogue is built in otoyin. Full version: `docs/knowledge/35-dialogue-methodology.md`.

## Pipeline
1. **Cast voices** — one cloned/personality profile per character. Group mics with Audio Channels
   (`/channels`) when they share processing.
2. **Pick the mode**
   - Scripted multi-speaker (podcast/debate/interview) → **Conversation mode**:
      `run_recipe` (crossfade speakers + duck music bed + master) → `POST /conversation/auto-duck` → `POST /conversation/auto-level`. (No `POST /conversation/render` endpoint exists — use `run_recipe` for the mix.)
   - Acted over picture (film/TV) → **ADR**: `POST /adr/sessions` (+ lines) → upload guide
     (`/adr/sessions/{id}/guide`) → upload takes (`.../takes`) → `POST /adr/score` +
     `POST /adr/auto-select` → `POST /adr/sessions/{id}/lines/{line_id}/select/{take_id}` →
     `POST /adr/align`.
   - Long narrative → single narrator profile, split into chapters, sequence in **Stories**
     (`/stories`) with per-item fade/gain/trim.
   - Quick segments → **Stories** items (fade, gain, trim, split, reverse, normalize,
     silence-removal, version, reorder) then `/stories/{id}/export-audio`.
3. **Comp + correct** — multi-take comping (UI), pitch correction via Pitch Map or
   `POST /audio/pitch-analysis` (YIN) + auto-tune effect.
4. **Mix + master** — bus routing + sidechain duck; `measure_loudness`; export with the right
   preset (Podcast −16 mono, Audiobook −18 stereo, Movie −24 5.1, Voiceover −12 mono).

## Rules
- >1 scripted speaker → Conversation. 1 acted voice over picture → ADR.
- Always auto-duck + auto-level before export. Never hand-clip peaks.
- If a character engine is missing, say so and fall back; keep the speaker mapping.
- Agent never mutates the live audio graph for Voice Changer / Timeline / Comping.

## Mode-selection flowchart
```
START: how is the dialogue built?
│
├─ >1 SCRIPTED speaker (podcast / debate / interview)?
│     └─ YES → CONVERSATION MODE
│              run_recipe → auto-duck → auto-level
│
├─ 1 ACTED voice performed OVER PICTURE (film / TV)?
│     └─ YES → ADR MODE
│              session → guide → takes → score → auto-select
│              → select/{take_id} → align
│
├─ LONG NARRATIVE (single narrator, chapters)?
│     └─ YES → STORIES
│              narrator profile → split into chapters →
│              per-item fade / gain / trim
│
└─ QUICK SHORT SEGMENTS (stings / bumpers / promos)?
      └─ YES → STORIES ITEMS
               fade, gain, trim, split, reverse, normalize,
               silence-removal, version, reorder → export-audio
```

## Channel grouping & mic sharing
- Group voices that share processing into Audio Channels via `/channels`
  (MCP: `21labs.list_channels`, `21labs.get_channel`, `21labs.create_channel`,
  `21labs.get_channel_voices`).
- `get_channel_voices` lists the voices routed through a channel, so you can apply ONE
  `effects_chain` to the whole group instead of per-clip.
- Mic-sharing rule: speakers recorded on the SAME mic in the SAME room MUST share a channel
  (identical capture chain → identical EQ/compressor/denoise). Different mics/rooms → separate channels.
- Create one channel per mic/room; assign multiple character voices to a channel only if they share
  the same EQ/compressor/denoise profile.

## Cross-links
- [conversation-mode](../conversation-mode/SKILL.md)
- [adr-mode](../adr-mode/SKILL.md)
- [stories-mode](../stories-mode/SKILL.md)
- [engine-atlas](../engine-atlas/SKILL.md)
- [effects-field-guide](../effects-field-guide/SKILL.md)
- [batch-queue](../batch-queue/SKILL.md)
