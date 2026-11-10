# Spectrogram

Route: `/spectrogram` → `app/src/features/workspace/SpectrogramView.tsx`. In nav: yes (Voice & Transcription group).

## Job
A user comes here to visualize frequency spectrum of audio.

## Complete-flow checklist
1. Input: audio file. PARTIAL.
2. Configure: FFT params. PARTIAL.
3. Model readiness: n/a.
4. Run: render. UNVERIFIED.
5. Preview: spectrogram viz. PRESENT.
6. Outputs: export image? UNVERIFIED.
7. Save/history: UNVERIFIED.
8. Link out: GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Spectrogram | backend? (`routes/spectrogram.py`) | yes |

## Bugs/risks
- MINOR: UNVERIFIED.

## Gaps & right UX
- Add export + send-to. PROPOSAL.
Confidence: GUESS.