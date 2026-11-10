# Video Preview

Route: `/video` → `app/src/features/workspace/VideoPreviewView.tsx`. In nav: yes (Video group).

## Job
A user comes here to preview a video and extract its audio.

## Complete-flow checklist
1. Input: video file. PARTIAL.
2. Configure: n/a.
3. Model readiness: n/a.
4. Run: extract audio. UNVERIFIED.
5. Preview: video player. PRESENT.
6. Outputs: extracted audio to library. PARTIAL.
7. Save/history: UNVERIFIED.
8. Link out: to Dubbing/Transcript. GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Video preview/extract | yes (`routes/video?`, `extended_import.py`) | yes |

## Bugs/risks
- MINOR: UNVERIFIED.

## Gaps & right UX
- Add send-to Dubbing/Transcript. PROPOSAL.
Confidence: GUESS.