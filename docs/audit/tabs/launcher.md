# Launcher

Route: `/launcher` → `app/src/features/launcher/LauncherTab.tsx` (+ `StepSequencer.tsx`). In nav: yes (Studio group).

## Job
A user comes here to set up and run a step sequencer / launcher session for triggering samples/instruments.

## Complete-flow checklist
1. Input: samples/instruments from library. PARTIAL (verify).
2. Configure: steps, tempo, pattern. PRESENT (`StepSequencer`).
3. Model readiness: n/a (synth). 
4. Run: play/stop. UNVERIFIED.
5. Preview: audio out. UNVERIFIED.
6. Outputs: export? UNVERIFIED.
7. Save/history: launcher sessions (`services/launcher_sessions.py`? `routes/launcher_sessions.py`). PARTIAL (backend exists).
8. Link out: to Instruments/Audio Studio. GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: keyboard shortcuts? UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Launcher sessions | yes (`routes/launcher_sessions.py`) | yes (tab) |
| Step sequencer | n/a (client) | yes (`StepSequencer.tsx`) |

## Bugs/risks
- MINOR: session persistence unverified. GUESS.

## Gaps & right UX
- Verify save/load session and export. PROPOSAL if missing.
Confidence: GUESS.