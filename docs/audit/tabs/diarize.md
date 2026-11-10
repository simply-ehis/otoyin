# Diarization

Route: `/diarize` → `app/src/features/workspace/DiarizationView.tsx`. In nav: yes (Voice & Transcription group).

## Job
A user comes here to transcribe audio with speaker labels.

## Complete-flow checklist
1. Input: audio file. PARTIAL.
2. Configure: language, model. PARTIAL.
3. Model readiness: STT (Whisper/Parakeet/Qwen3-ASR). PARTIAL (model picker missing common gap).
4. Run: process with progress. UNVERIFIED.
5. Preview: transcript with speakers. PRESENT.
6. Outputs: export SRT/VTT. `services/subtitles.py`, `scribe_json.py`. PARTIAL.
7. Save/history: UNVERIFIED.
8. Link out: to Transcript Edit/Export. GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Diarization | yes (`services/diarization.py`, `routes/diarization.py`) | yes |

## Bugs/risks
- MAJOR: model picker missing (common gap). GUESS.

## Gaps & right UX
- Add model picker + export + send-to. PROPOSAL.
Confidence: GUESS.