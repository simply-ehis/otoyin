# Audio Enhance

Route: `/audio-enhance` → `app/src/features/workspace/AudioEnhanceView.tsx`. In nav: yes (Processing group).

## Job
A user comes here for one-click enhance (bandwidth extension + denoise) with strength control and A/B.

## Complete-flow checklist
1. Input: audio file. PARTIAL.
2. Configure: strength. PRESENT.
3. Model readiness: LavaSR + DeepFilter. PARTIAL (model picker missing common gap).
4. Run: process with progress. UNVERIFIED.
5. Preview: A/B. PARTIAL.
6. Outputs: export. PARTIAL.
7. Save/history: UNVERIFIED.
8. Link out: to Edit/Export. GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Audio enhance | yes (`services/audio_enhancer.py`, `streaming_lavasr.py`, `deepfilter_onnx.py`) | yes |

## Bugs/risks
- MAJOR: model picker missing (common gap). GUESS.
- MINOR: memory spike LavaSR+DeepFilter together on 8GB. GUESS.

## Gaps & right UX
- Add model picker + progress/cancel + A/B. PROPOSAL.
Confidence: GUESS.