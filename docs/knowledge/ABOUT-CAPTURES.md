# About: Captures Tab

> **PURPOSE:** Reference for the Captures tab — transcription, dictation, and speech-to-text.
> **OWNS:** Captures list, capture detail, dictation
> **READ-WHEN:** Working on captures, STT, transcription features
> **KEY-FILES:** `CapturesTab.tsx`, `CapturesActionBar.tsx`, `CaptureDetailPane.tsx`
> **INVARIANTS:** Captures have raw and refined transcripts; Play As uses selected voice
> **GOTCHAS:** Import and Dictate are separate actions; Dictate starts live recording
> **UPDATED:** 2026-08-07

## Overview

Captures handles speech-to-text: import audio files for transcription or dictate live. Each capture has raw and refined transcripts.

## Action Bar

| Button | Action |
|---|---|
| Configure | Link to Settings > Captures page |
| Import | Open file picker to import audio for transcription |
| Dictate | Start new dictation recording session |
| Stop | Stop current dictation recording |

## Capture Detail Pane

### Transcript Tabs

| Tab | Description |
|---|---|
| Refined | LLM-refined transcript |
| Raw | Original STT transcript |

### Actions

| Button | Action |
|---|---|
| Play As | Generate TTS of transcript using selected voice |
| Play As dropdown | Switch voice for Play As playback |
| Copy | Copy transcript text to clipboard |
| Refine / Re-Refine | Send transcript through LLM for refinement |

### Export Menu

| Option | Description |
|---|---|
| Audio | Export capture audio as WAV |
| Transcript | Export transcript as .txt |
| Markdown | Export capture as structured .md |

### Other

| Button | Action |
|---|---|
| Delete | Delete capture (with confirmation) |

## Agent Callable
- **MCP Tools:** `21labs.list_captures`, `21labs.captures_refine`, `21labs.captures_retranscribe`, `21labs.transcribe`
- **REST Endpoints:** `POST /captures`, `GET /captures`, `GET /captures/{id}`, `DELETE /captures/{id}`, `POST /captures/{id}/refine`, `POST /captures/{id}/retranscribe`, `GET /capture/readiness`, `POST /transcribe`
- **Key Backend Files:** `backend/routes/captures.py`, `backend/services/captures.py`, `backend/routes/transcription.py`
- **Key Frontend Files:** `app/src/features/captures/CapturesTab.tsx`, `app/src/features/captures/ListPane.tsx`, `app/src/features/captures/DetailPane.tsx`, `app/src/features/captures/ActionBar.tsx`
