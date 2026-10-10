PURPOSE: Spec for podcast speaker-tag detection + per-speaker voice assignment.
OWNS: Conversation-mode dialogue casting (no code yet — design only).
READ-WHEN: implementing auto-cast in Conversation mode or stories dialogue.
KEY-FILES: app/src/features/audioStudio/PodcastProducer.tsx, backend/services/diarization.py, backend/services/profiles.py, backend/backends/configs/tts.py.
INVARIANTS: tags never reach any synthesis engine; emotion-tag syntax stays single-bracket; everything offline.
GOTCHAS: Chatterbox paralinguistics ([laugh],[sigh]) and Zonos emotion control both use single brackets — speaker tags must not.
UPDATED: 2026-09-23

# Dialogue casting: speaker-tag auto-detect + voice assign

## Decision: canonical tag is double-bracket `[[A]]`, `[[B]]`, …

Single-bracket `[…]` is taken: Chatterbox consumes `[laugh]/[sigh]/[cough]`
paralinguistics, Zonos-class engines read emotion tags, and users already write
stage directions (`[pause]`, `[whispers]`) in single brackets. A speaker tag in
the same syntax would be mis-synthesized as an emotion or spoken literally.

- **Canonical (written by the app, documented to users): `[[A]]`, `[[B]]`, …
  or named `[[Narrator]]`, `[[Ada]]`.** No engine uses double brackets; all
  supported engines treat them as plain text, so even a leak-through degrades
  to a spoken word, never a wrong emotion.
- **Accepted aliases on input (normalized to canonical):** `[speaker A]`,
  `[Speaker B]`, `Speaker A:`, `A:`. Detection runs a single normalize pass
  before anything else, so pasted scripts in any of these styles just work.
- **Strip rule:** every `[[…]]` token is removed before text reaches
  `POST /generate` / chunked TTS. Stripping happens in one place (the dialogue
  planner), never per-engine, so a new engine can't reintroduce the leak.

## Behavior

1. **Detect:** on script load/paste, scan for canonical or alias tags. If ≥2
   distinct speakers found → casting mode. If none → single-voice path
   (current behavior, unchanged).
2. **Assign UI:** a casting row appears above the script — one row per detected
   speaker (`[[A]]`, `[[B]]`), each with a voice picker (profile preset /
   cloned / designed) + engine picker constrained to `CLONING_ENGINES`-valid
   choices. Selections persist per project.
3. **Auto-assign:** unassigned speakers get sensible defaults (first run:
   `[[A]]` → default voice, `[[B]]` → a contrasting preset of opposite gender
   when available; never the same voice twice). User can override any row.
4. **Render:** the planner splits the script at tag boundaries, synthesizes
   each segment with its speaker's voice/engine, and concatenates through the
   existing Conversation-mode chain (auto-duck → auto-level → export).
   Segments keep `speaker_id` so the takes pipeline (`words.json`) records who
   said what.

## Example

Input:
`[speaker A] hi i love you [speaker B] boo i hate you`
Normalized: `[[A]] hi i love you [[B]] boo i hate you`
UI shows: `[[A]] → voice picker` + `[[B]] → voice picker` (auto-filled,
editable). Render: two voices, one timeline.

## Out of scope (later)

Diarization-driven auto-cast for unscripted audio (map `diarize_turns`
speaker_00/01 → casting rows); per-speaker emotion override UI.
