# Timeline

Route: `/timeline` → `app/src/features/workspace/TimelineView.tsx`. In nav: yes (Studio group, as Studio? actually promoted top-level).

## Job
A user comes here to arrange audio clips on a timeline, scrub, and export a session.

## Complete-flow checklist
1. Input: clips from library/drag-drop. PARTIAL (paste clip from clipboard exists; no drag/drop handlers verified).
2. Configure: arrange, snap, zoom. MISSING (no snap/drag handlers found in TimelineView.tsx; verified grep).
3. Model readiness: n/a.
4. Run: playback. PARTIAL.
5. Preview: waveform. PARTIAL.
6. Outputs: export session. PARTIAL.
7. Save/history: UNVERIFIED.
8. Link out: to Mixer/Export. GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: PARTIAL (empty state present).
11. Feel: keyboard shortcuts, undo/redo. UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Timeline view | client | yes (TimelineView) |
| Clip ops | client | PARTIAL (paste clip exists; drag/drop + snap MISSING verified) |

## Bugs/risks
- MAJOR (verified): clip drag/drop and snap not implemented (grep: no onDrop/onDrag/snap in TimelineView.tsx).

## Gaps & right UX
- Implement clip drag/drop + snap + zoom + undo. PROPOSAL (spec).
Confidence: TRACED (code read).