# 35 — Dialogue Methodology

PURPOSE: How real dialogue is meant to be built in otoyin — the deliberate pipeline an agent should follow for conversational, dramatic, or narrated speech.
OWNS: docs/knowledge/35-dialogue-methodology.md
READ-WHEN: Producing podcasts, film/TV dialogue, audiobooks, interviews, debates, or any multi-speaker speech.
KEY-FILES: backend/routes/adr.py, backend/routes/conversation.py, backend/routes/stories.py, backend/routes/channels.py, docs/knowledge/08-adr-mode.md, 21-conversation-mode.md, 26-multi-take-comping.md
INVARIANTS: Dialogue is built as discrete lines/takes, then arranged — never one giant TTS blob. Characters map to distinct voice profiles. Levels are matched, not clipped.
GOTCHAS: Conversation `auto-level` route is named `/conversation/auto-level` (doc 21 says level-match). ADR scoring needs a guide track uploaded first.
UPDATED: 2026-07-15

## The dialogue pipeline

### 1. Cast the voices
- One cloned/profile per character. `list_voices` to resolve ids. For character work, use profiles
  with a personality prompt so the rewrite stays in-character.
- Group related voices with **Audio Channels** (`/channels`) when you need per-channel processing
  (e.g. all guest mics share one noise-reduction chain).

### 2. Choose the production mode
- **Scripted multi-speaker (podcast/debate/interview):** Conversation mode.
  - Build lines: `speaker_id`, `text`, `voice_profile_id`, `start_ms`, optional `effects_chain`.
  - **`run_recipe`** → mixed/timed multi-track audio (crossfades speakers, ducks any music bed, masters to LUFS). Note: `POST /conversation/render` is NOT implemented.
  - `POST /conversation/auto-duck` → gain envelope so the primary speaker ducks background.
  - `POST /conversation/auto-level` → match all speakers to a target LUFS (no one voice dominates).
- **Acted/looped dialogue (film/TV):** ADR mode.
  - `POST /adr/sessions` with lines (character, original_text, target_duration_ms).
  - `POST /adr/sessions/{id}/guide` (or `/guide-path`) → upload the reference/guide track.
  - `POST /adr/sessions/{id}/lines/{line_id}/takes` → record/ upload actor takes.
  - `POST /adr/score` → quality score; `POST /adr/auto-select` → best take per line.
  - `POST /adr/sessions/{id}/lines/{line_id}/select/{take_id}` → lock the chosen take.
  - `POST /adr/align` → sync to timeline.
- **Long-form narrative (audiobook):** single narrator profile; split into chapter generations;
  use Stories (`/stories`) to sequence and apply per-item fade/gain/trim; character voices per chapter.
- **Quick segment sequencing:** Stories — items support fade, gain, trim, split, reverse,
  normalize, silence-removal, version, reorder, then `export-audio`.

### 3. Comp and correct
- Multi-take comping (`26-multi-take-comping.md`): stack lanes, select best regions. (Client-side
  UI; not agent-live-controlled by design.)
- Pitch correction via Pitch Map (`03-pitch-map.md`) or `POST /audio/pitch-analysis` (YIN) to read,
  then a pitch/auto-tune effect in the chain.

### 4. Mix and master
- Bus routing + sidechain duck in the mixer (`06-mixer.md`).
- `measure_loudness` to confirm target; `export_audio` with the right preset:
  - Podcast −16 LUFS mono, Audiobook −18 LUFS stereo, Movie Audio −24 LUFS 5.1, Voiceover −12 LUFS mono.
- (Phase 4) Run the mastering chain for broadcast grade.

## Agent decision rules
- More than one speaker and scripted → Conversation. One speaker acted over picture → ADR.
- Always auto-duck + auto-level before export. Never hand-clip peaks.
- If the chosen engine for a character is missing, say so and fall back; keep the speaker mapping.

## Agent Callable
- **MCP Tools:** `21labs.list_channels`, `21labs.conversation_auto_duck`, `21labs.conversation_auto_level`, `21labs.analyze_loudness`, `21labs.run_recipe`
- **REST Endpoints:** `POST /conversation/auto-duck`, `POST /conversation/auto-level`, `POST /adr/sessions`, `POST /adr/score`, `POST /adr/auto-select`, `POST /adr/align`, `POST /audio/pitch-analysis`
- **Key Backend Files:** `backend/routes/adr.py`, `backend/routes/conversation.py`, `backend/routes/stories.py`, `backend/routes/channels.py`, `backend/services/adr.py`
- **Key Frontend Files:** `app/src/features/workspace/adr/ADRView.tsx`, `app/src/features/workspace/ConversationView.tsx`, `app/src/features/workspace/MultiTakeCompingView.tsx`
