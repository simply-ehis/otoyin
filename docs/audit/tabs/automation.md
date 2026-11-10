# Automation

Route: `/automation` → `app/src/features/workspace/AutomationView.tsx`. In nav: yes (Studio group).

## Job
A user comes here to drive parameter automation lanes (volume/pan/pitch/effects) and cue matrix.

## Complete-flow checklist
1. Input: tracks/params. PARTIAL.
2. Configure: lanes, curves, cues. PRESENT (per skill).
3. Model readiness: n/a.
4. Run: interpolate/playback. PARTIAL.
5. Preview: lane viz. PRESENT.
6. Outputs: export automation. PARTIAL.
7. Save/history: UNVERIFIED.
8. Link out: to Mixer/DSP. GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Automation | yes (`routes/automation.py`, `services/`?) | yes (AutomationView) |

## Bugs/risks
- MINOR: backend service for automation lanes? UNVERIFIED (GUESS: client-side).

## Gaps & right UX
- Verify persistence. PROPOSAL.
Confidence: GUESS.