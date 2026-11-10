# Help

Route: `/help` → `app/src/features/help/HelpPage.tsx` (+ HelpCenter, HelpCenterOverlay, TabHelp, FeatureTour, CommandPalette, SkillsBrowser). In nav: yes (Help group).

## Job
A user comes here for support, docs, what's new, and in-app help search.

## Complete-flow checklist
1. Input: search query. PRESENT.
2. Configure: n/a.
3. Model readiness: n/a.
4. Run: search. PARTIAL.
5. Preview: n/a.
6. Outputs: n/a.
7. Save/history: UNVERIFIED.
8. Link out: to tabs. PARTIAL.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: command palette (Cmd+K?) UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Help | yes (`routes/help.py`) | yes |
| Skills browser | client | yes (SkillsBrowser) |
| Feature tour | client | yes (FeatureTour) |

## Bugs/risks
- MINOR: UNVERIFIED.

## Gaps & right UX
- Use app_features.json for help search (feature-exposure audit). PROPOSAL.
Confidence: GUESS.