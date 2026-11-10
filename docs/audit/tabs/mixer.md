# Mixer

Route: `/mixer` → `app/src/features/workspace/MixerView.tsx`. In nav: yes (Studio group).

## Job
A user comes here for channel strips with volume/pan/VU, mute/solo, per-track effects, bus routing, auto-duck.

## Complete-flow checklist
1. Input: tracks from session/library. PARTIAL.
2. Configure: vol/pan/effects per track, buses. PRESENT.
3. Model readiness: n/a.
4. Run: playback/mix. PRESENT.
5. Preview: VU meters. PRESENT.
6. Outputs: export mix. `services/mixer.py`, `routes/mixer.py`, `mixer_sessions.py`. PARTIAL.
7. Save/history: mixer sessions. PARTIAL.
8. Link out: to Export/Mastering. GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Mixer | yes (`services/mixer.py`, `routes/mixer.py`, `mixer_sessions.py`) | yes |
| Auto-duck | yes (`conversation` auto-duck) | PARTIAL |

## Bugs/risks
- MINOR: auto-duck integration verify. GUESS.

## Gaps & right UX
- Verify session save/load + export. PROPOSAL.
Confidence: TRACED (TAB_AUDIT complete).