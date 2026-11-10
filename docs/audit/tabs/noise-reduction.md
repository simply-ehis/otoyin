# Noise Reduction

Route: `/noise-reduction` → `app/src/features/workspace/NoiseReductionView.tsx`. In nav: yes (Processing group).

## Job
A user comes here to remove background noise (AI or profile-based) with strength control and A/B.

## Complete-flow checklist
1. Input: audio file. PARTIAL.
2. Configure: mode (AI/profile), strength. PRESENT.
3. Model readiness: DeepFilter/RNNoise. PARTIAL (model picker missing per common gap).
4. Run: process with progress. UNVERIFIED.
5. Preview: spectrogram/waveform, A/B. PARTIAL.
6. Outputs: export. PARTIAL.
7. Save/history: UNVERIFIED.
8. Link out: to Edit/Effects. GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Noise reduction | yes (`services/noise_reduction.py`, `routes/noise?` via audio_pipeline; `deepfilter_onnx.py`) | yes |
| Modes | yes | PARTIAL |

## Bugs/risks
- MAJOR: model picker missing (common gap TAB_AUDIT). GUESS.
- MINOR: memory on 8GB if DeepFilter + others. GUESS.

## Gaps & right UX
- Add model picker + progress/cancel + A/B. PROPOSAL.
Confidence: GUESS.