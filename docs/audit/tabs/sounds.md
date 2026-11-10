# Sound Effects

Route: `/sounds` → `app/src/features/workspace/SoundEffectsView.tsx`. In nav: yes (Help group + stray duplicate entry at Sidebar.tsx:164).

## Job
A user comes here to generate SFX from a prompt and browse a library (Freesound) with search/tags/preview/favorites, source+license shown.

## Complete-flow checklist
1. Input: prompt or search. PRESENT.
2. Configure: params. PARTIAL.
3. Model readiness: Stable Audio Open / SA3. PARTIAL (model picker? GUESS).
4. Run: generate. PARTIAL.
5. Preview: audio preview. PRESENT.
6. Outputs: download/favorite. PARTIAL.
7. Save/history: favorites. PARTIAL.
8. Link out: to Audio Studio. GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| SFX gen | yes (`routes/generate.py` /generate/sfx, `sa3_sfx_backend.py`, `stable_audio_backend.py`) | yes |
| Freesound browser | yes (`services/freesound.py`, `routes/sounds.py`) | yes |

## Bugs/risks
- MINOR: sidebar duplicate Sounds entry (Sidebar.tsx:164) — malformed nav. TRACED.
- MINOR: license display. GUESS.

## Gaps & right UX
- Fix sidebar duplicate; add model picker + license display. PROPOSAL.
Confidence: GUESS.