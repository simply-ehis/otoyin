# Library

Route: `/library` → `app/src/features/library/LibraryTab.tsx`. In nav: yes (Library group).

## Job
A user comes here for a unified audio library of generated/imported/captured files.

## Complete-flow checklist
1. Input: files from all tabs. PARTIAL (central write? verify).
2. Configure: search/filter/sort. PARTIAL.
3. Model readiness: n/a.
4. Run: n/a.
5. Preview: playback. PARTIAL.
6. Outputs: download/delete/share. PARTIAL.
7. Save/history: library persisted. `services/library.py`, `audio_metadata.py`, `audio_sample_library.py`. PARTIAL.
8. Link out: open in tabs (Send to). PARTIAL.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Library | yes (`routes/library.py`, `services/library.py`) | yes |

## Bugs/risks
- MAJOR: whether all tabs write here is unverified (shared asset library invariant). GUESS.

## Gaps & right UX
- Verify universal write + Send-to targets. PROPOSAL.
Confidence: GUESS.