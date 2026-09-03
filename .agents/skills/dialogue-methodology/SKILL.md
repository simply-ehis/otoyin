---
name: dialogue-methodology
description: Decision flowchart for choosing the right dialogue mode (Conversation vs ADR vs Stories vs Comping) and the invariant auto-duck + auto-level + channel-grouping pipeline.
---
# Dialogue Methodology (Consolidated)

## Purpose
One reference for how dialogue is *meant* to be built in otoyin: pick the correct production mode
from the source material, group voices into channels for shared processing, and finish every path
with auto-duck + auto-level before export. Dialogue is discrete lines/takes, arranged — never one
giant TTS blob.

## When to use
- Any multi-speaker / acted / narrated speech task (podcast, film dialogue, audiobook, interview,
  debate).
- Before choosing a more specific skill (../conversation-mode, ../adr-mode, ../stories-mode,
  ../multi-take-comping).

## Mode-selection FLOWCHART
```
Is there a guide/picture track + an actor performing lines?
├─ YES → ADR mode (../adr-mode)
│        POST /adr/sessions → guide → takes → score → auto-select → select → align
└─ NO  → More than one scripted speaker?
         ├─ YES → Conversation mode (../conversation-mode)
         │        build lines → POST /conversation/auto-duck → POST /conversation/auto-level
         └─ NO  → Long narrative / audiobook?
                  ├─ YES → Stories mode (../stories-mode), one narrator split into chapters
                  └─ NO  → Quick segments?
                           ├─ YES → Stories items (fade/gain/trim/split/...)
                           └─ NO  → single TTS line via generate_speech
Character/clone voices → assign one profile per character (list_profiles).
```
Always run auto-duck + auto-level before export. Never hand-clip peaks.

## Channel grouping (mic-sharing)
- Group related voices with Audio Channels when they share processing (e.g. all guest mics share one
  noise-reduction chain).
- REST: `GET /channels`, `POST /channels {name, device_ids:[]}`, `GET /channels/{id}`,
  `GET /channels/{id}/voices`, `PUT /channels/{id}/voices {profile_ids:[...]}`.
- MCP: `21labs.list_channels()`, `21labs.create_channel(name, device_ids=[])`,
  `21labs.get_channel(channel_id)`, `21labs.get_channel_voices(channel_id)`.
- A channel carries `profile_ids` (assigned voices), not audio itself — it is a routing/grouping
  handle.

## Invariant pipeline (every dialogue job)
1. **Cast** — one profile per character; group shared-mic voices into a channel.
2. **Build** — choose mode above; produce discrete lines/takes.
3. **Comp/correct** — multi-take comping (UI) + pitch correction (Pitch Map / `POST /audio/
   pitch-analysis` YIN + auto-tune).
4. **Mix/master** — bus routing + sidechain duck; `measure_loudness`; export preset:
   | content | LUFS | channels |
   |---------|------|----------|
   | Podcast | −16 | mono |
   | Audiobook | −18 | stereo |
   | Movie audio | −24 | 5.1 |
   | Voiceover | −12 | mono |
   | Social/YouTube | −14 | mono |

## Pitfalls / Gotchas
- **Render gap.** `POST /conversation/render` is documented (doc 21) but NOT in
  `backend/routes/conversation.py`; see ../conversation-mode pitfalls.
- **Route name.** Level-match = `/conversation/auto-level`.
- **Agent limits.** Never mutate live graph for Voice Changer / Timeline / Comping (AGENTS.md).
  Agent stages; human commits.
- **Engine missing?** Say so, fall back to nearest engine, keep the speaker→profile mapping.

## Cross-links
- [conversation-mode](../conversation-mode/SKILL.md)
- [adr-mode](../adr-mode/SKILL.md)
- [stories-mode](../stories-mode/SKILL.md)
- [multi-take-comping](../multi-take-comping/SKILL.md)
- [transcript-edit](../transcript-edit/SKILL.md)
- [engine-atlas](../engine-atlas/SKILL.md)
- [effects-field-guide](../effects-field-guide/SKILL.md)

## Validation
- Each mode's validation lives in its own skill. Global check: exported mix `measure_loudness`
  matches the table above (±1 LUFS).
