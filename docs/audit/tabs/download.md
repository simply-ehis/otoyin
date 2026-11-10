# Download (YouTube/SoundCloud)

Route: `/download` → `app/src/features/workspace/YouTubeDownloadView.tsx`. In nav: yes (Video group).

## Job
A user comes here to import audio from YouTube/SoundCloud.

## Complete-flow checklist
1. Input: URL. PRESENT.
2. Configure: format/quality. PARTIAL.
3. Model readiness: n/a.
4. Run: download with progress. UNVERIFIED.
5. Preview: audio preview. PARTIAL.
6. Outputs: save to library. PARTIAL.
7. Save/history: UNVERIFIED.
8. Link out: to Library/Editor. GUESS.
9. Errors/recovery: UNVERIFIED (network failures).
10. States: UNVERIFIED.
11. Feel: UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| YouTube download | yes (`services/youtube_download.py`, `routes/youtube.py`) | yes |

## Bugs/risks
- MINOR: network/timeout handling. GUESS.

## Gaps & right UX
- Add progress/cancel + send-to. PROPOSAL.
Confidence: GUESS.