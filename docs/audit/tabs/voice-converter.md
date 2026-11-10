# Voice Converter (RVC)

Route: `/voice-converter` → `app/src/features/workspace/VoiceConverterView.tsx`. `/voice-changer` redirects here. In nav: yes (Create group).

## Job
A user comes here for AI voice-to-voice conversion (RVC/Seed-VC/OpenVoice).

## Complete-flow checklist
1. Input: audio file. PARTIAL.
2. Configure: target voice/model. PARTIAL.
3. Model readiness: VC models. PARTIAL (model picker missing common gap).
4. Run: convert with progress. UNVERIFIED.
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
| Voice convert | yes (`services/voice_convert?`, `routes/voice_convert.py`, `rvc_onnx_backend.py`, `seed_vc_backend.py`, `openvoice_onnx_backend.py`) | yes |

## Bugs/risks
- MAJOR: model picker missing (common gap). GUESS.
- MINOR: voice-changer (real-time) collapsed into converter via redirect; real-time pipeline exists separately (`voice_changer/`). GUESS (orphan UI?).

## Gaps & right UX
- Separate real-time voice changer UI if needed; add model picker. PROPOSAL.
Confidence: GUESS.