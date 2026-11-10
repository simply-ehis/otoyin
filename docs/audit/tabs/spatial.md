# Spatial Audio

Route: `/spatial` → `app/src/features/workspace/SpatialView.tsx`. In nav: yes (Studio group).

## Job
A user comes here to place sources on a 2D/3D stage, binaural preview, distance/reverb, export.

## Complete-flow checklist
1. Input: audio sources. PARTIAL.
2. Configure: position, distance, reverb. PRESENT (backend `steam_audio.py`).
3. Model readiness: n/a (DSP).
4. Run: render binaural. UNVERIFIED.
5. Preview: binaural preview. PARTIAL.
6. Outputs: export formats. PARTIAL.
7. Save/history: UNVERIFIED.
8. Link out: to Export. GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Spatial/steam audio | yes (`services/steam_audio.py`, `routes/spatial.py`) | yes (SpatialView) |
| Binaural/doppler/convolution | yes | PARTIAL |

## Bugs/risks
- MINOR: export formats verification. GUESS.

## Gaps & right UX
- Add export + send-to. PROPOSAL.
Confidence: TRACED (skill).