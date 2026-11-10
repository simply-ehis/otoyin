# DSP / Synth

Route: `/dsp` → `app/src/features/workspace/DspView.tsx`. In nav: yes (Studio group).

## Job
A user comes here for offline synthesis and DSP processing.

## Complete-flow checklist
1. Input: signal/params. PARTIAL.
2. Configure: DSP params. PARTIAL.
3. Model readiness: n/a.
4. Run: process. UNVERIFIED.
5. Preview: audio. PARTIAL.
6. Outputs: export. PARTIAL.
7. Save/history: UNVERIFIED.
8. Link out: to Audio Studio. GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| DSP synth | yes (`services/dsp_synth.py`, `routes/dsp?` via audio_pipeline) | yes (DspView) |

## Bugs/risks
- MINOR: route registration — `dsp` may be under audio_pipeline subpackage; verify import. GUESS.

## Gaps & right UX
- Verify wiring. PROPOSAL.
Confidence: GUESS.