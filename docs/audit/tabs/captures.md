# Captures

Route: `/captures` → `app/src/features/captures/CapturesTab.tsx`. In nav: yes (Voice & Transcription group).

## Job
A user comes here to capture/record audio clips, transcribe them, and route to other tabs.

## Complete-flow checklist
1. Input: record mic, file picker, drag/drop. PARTIAL (verify native mic).
2. Configure: capture settings. PARTIAL.
3. Model readiness: STT for transcription. PARTIAL.
4. Run: capture + transcribe. UNVERIFIED.
5. Preview: waveform + playback. PARTIAL.
6. Outputs: save to library/captures. `services/captures.py`, `routes/captures.py`. PRESENT (backend).
7. Save/history: captures list. PARTIAL.
8. Link out: to Transcript/Edit/Effects. GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: hotkeys? UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Captures CRUD | yes (`routes/captures.py`, `services/captures.py`) | yes (tab) |
| Transcription | yes (`transcribe.py`, `streaming_stt.py`) | PARTIAL |
| Audio tags | yes (`audio_tags.py`) | PARTIAL |

## Bugs/risks
- MINOR: native mic permission handling. GUESS (tests exist `nativeMic.test.tsx`).

## Gaps & right UX
- Add "Send to..." and model picker for STT. PROPOSAL.
Confidence: GUESS.