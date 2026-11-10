# ADR (Automated Dialogue Replacement)

Route: `/adr` → `app/src/features/workspace/adr/ADRView.tsx`. In nav: yes (Studio group).

## Job
A user comes here to replace dialogue over picture: guide track, take recording, quality scoring, auto-select, lock, alignment.

## Complete-flow checklist
1. Input: guide track upload + record takes. PRESENT.
2. Configure: takes, scoring. PRESENT.
3. Model readiness: STT/TTS for alignment. PARTIAL (model picker missing common gap).
4. Run: align/score/auto-select. PRESENT (per adr skill).
5. Preview: A/B. PARTIAL.
6. Outputs: locked take. PARTIAL.
7. Save/history: sessions (`adr.py` service, `routes/adr.py`). PARTIAL.
8. Link out: to Edit/Export. GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| ADR | yes (`services/adr.py`, `routes/adr.py`) | yes (ADRView) |

## Bugs/risks
- MAJOR: model picker missing (common gap). GUESS.

## Gaps & right UX
- Add model picker + send-to. PROPOSAL.
Confidence: TRACED (skill).