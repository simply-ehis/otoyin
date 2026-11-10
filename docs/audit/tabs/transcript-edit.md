# Transcript Edit

Route: `/transcript` → `app/src/features/workspace/TranscriptEditView.tsx` (also `lib/transcript/TranscriptEditor.tsx`, `TranscriptDrawer.tsx`). `/live-transcript` redirects here. In nav: yes (Voice & Transcription group).

## Job
A user comes here to edit audio by manipulating word-level transcript (click-to-playhead, word timestamps), remove fillers, re-render.

## Complete-flow checklist
1. Input: audio + transcript (STT). PARTIAL.
2. Configure: word selection, cuts. PRESENT (TranscriptEditor).
3. Model readiness: STT for transcription. PARTIAL.
4. Run: re-render. UNVERIFIED.
5. Preview: playback at word. PRESENT.
6. Outputs: exported audio. PARTIAL.
7. Save/history: UNVERIFIED.
8. Link out: to Edit/Export. GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: keyboard shortcuts. UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Transcript edit | yes (`routes/transcript_edit.py`, `services/transcription.py`) | yes |
| Word timestamps | yes (`faster_whisper` word timestamps) | yes |
| Streaming STT | yes (`streaming_stt.py`, `routes/streaming_stt.py`) | PARTIAL (live transcript redirected) |

## Bugs/risks
- MINOR: live transcript redirect collapses two modes. GUESS.

## Gaps & right UX
- Separate live capture mode or keep redirect documented. PROPOSAL.
Confidence: GUESS.