# Comping (Multi-take)

Route: `/comping` → `app/src/features/workspace/MultiTakeCompingView.tsx`. In nav: yes (Studio group).

## Job
A user comes here to stack take lanes, select best regions, and assemble a composite clip.

## Complete-flow checklist
1. Input: multiple takes. PARTIAL.
2. Configure: lane selection, crossfades. PARTIAL.
3. Model readiness: n/a.
4. Run: assemble. `routes/comping.py`, `comping_sessions.py`, `services/comping`. PRESENT (backend).
5. Preview: composite playback. PARTIAL.
6. Outputs: assembled clip. PRESENT (backend).
7. Save/history: comping sessions. PARTIAL.
8. Link out: to Edit/Export. GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: undo/redo. UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Comping | yes (`routes/comping.py`, `comping_sessions.py`) | yes |
| Assemble | yes (`POST /comping/assemble`) | yes |

## Bugs/risks
- MINOR: UNVERIFIED end-to-end.

## Gaps & right UX
- Verify assembly + export. PROPOSAL.
Confidence: TRACED (skill).