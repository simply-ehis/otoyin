# Dubbing

Route: `/dubbing` → `app/src/features/dubbing/DubPage.tsx`. In nav: yes (Video group).

## Job
A user comes here to dub a video: transcribe, translate, review segments (text/speaker/timing), pick voice per speaker, generate, fit timing, mix with preserved background, export audio/video.

## Complete-flow checklist
1. Input: video/audio import. PARTIAL.
2. Configure: segments edit, speaker, timing, voice per speaker. PARTIAL (segments PATCH/DELETE just wired per TAB_AUDIT).
3. Model readiness: STT + TTS. PARTIAL (model picker? GUESS).
4. Run: generate dub with progress. UNVERIFIED.
5. Preview: A/B with original. PARTIAL.
6. Outputs: export audio/video. `services/dubbing.py`, `routes/dubbing.py`. PARTIAL.
7. Save/history: project. UNVERIFIED.
8. Link out: to Export. GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Dubbing pipeline | yes (`services/dubbing.py`, `routes/dubbing.py`) | yes (DubPage) |
| Segments CRUD | yes | PARTIAL (just wired) |
| Voice per speaker | yes (profiles) | PARTIAL |

## Bugs/risks
- MAJOR: segments PATCH/DELETE recently wired — verify end-to-end. GUESS.
- MINOR: model picker missing (common gap). GUESS.

## Gaps & right UX
- Add model picker + progress/cancel + send-to Export. PROPOSAL.
Confidence: GUESS/TRACED.