# Pitch Map

Route: `/pitch` → `app/src/features/workspace/PitchMapView.tsx`. In nav: yes (Voice & Transcription group).

## Job
A user comes here to view piano-roll pitch analysis of an audio clip.

## Complete-flow checklist
1. Input: audio file. PARTIAL.
2. Configure: n/a (analysis).
3. Model readiness: pitch analysis backend. `services/pitch.py`? `routes/pitch.py`. PRESENT.
4. Run: analyze. UNVERIFIED.
5. Preview: piano-roll viz. PRESENT (view).
6. Outputs: export pitch data? UNVERIFIED.
7. Save/history: UNVERIFIED.
8. Link out: to Edit/Automation. GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Pitch analysis | yes (`routes/pitch.py`) | yes (PitchMapView) |

## Bugs/risks
- MINOR: UNVERIFIED end-to-end.

## Gaps & right UX
- Add export + send-to. PROPOSAL.
Confidence: GUESS.