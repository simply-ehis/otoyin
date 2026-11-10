# Platform Export

Route: `/export` → `app/src/features/workspace/PlatformExportView.tsx`. In nav: yes (Export? actually top-level promoted).

## Job
A user comes here to export a finished mix to platform presets (Spotify/YouTube/Audible/podcast/etc.) with LUFS normalization.

## Complete-flow checklist
1. Input: audio from library. PARTIAL.
2. Configure: target platform, format/quality. PRESENT.
3. Model readiness: n/a.
4. Run: export with progress. UNVERIFIED.
5. Preview: loudness meter. PARTIAL.
6. Outputs: encoded file. `services/platform_export.py`? `routes/platform_export.py`, `mastering.py`, `loudness.py`. PARTIAL.
7. Save/history: UNVERIFIED.
8. Link out: to Library. GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Platform export | yes (`routes/platform_export.py`, `services/mastering.py`, `loudness.py`) | yes |

## Bugs/risks
- MINOR: verify encoding + LUFS target. GUESS.

## Gaps & right UX
- Add batch export + progress/cancel. PROPOSAL.
Confidence: GUESS.