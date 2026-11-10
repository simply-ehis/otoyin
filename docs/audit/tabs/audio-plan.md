# Audio Plan

Route: `/audio-plan` → `app/src/features/workspace/AudioPlanView.tsx`. In nav: yes (Studio group).

## Job
A user comes here to generate a scene-based AI audio plan (dialogue/SFX/music track assignment) from a script.

## Complete-flow checklist
1. Input: script/scenes. PARTIAL.
2. Configure: voice per scene, engine. PARTIAL (backend supports voice_profile_id/engine per PlanTrackUpdate, but UI missing per TAB_AUDIT).
3. Model readiness: TTS. PARTIAL (model picker missing common gap).
4. Run: generate plan + audio. PARTIAL.
5. Preview: per-track. PARTIAL.
6. Outputs: export. PARTIAL.
7. Save/history: UNVERIFIED.
8. Link out: to Generate/Stems. GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Audio plan | yes (`services/audio_plan.py`, `routes/audio_plan.py`) | yes |
| voice_profile_id/engine per track | yes (PlanTrackUpdate) | PARTIAL (UI has voiceProfileId field and selector, but `generateAutoPlan` call omits voiceProfileId (AudioPlanView.tsx:206-217); verified) |

## Bugs/risks
- MAJOR (verified): per-dialogue voice selection not sent in generate request (AudioPlanView.tsx:215).
- MAJOR: model picker missing (common gap). GUESS.

## Gaps & right UX
- Include voiceProfileId/engine in generate payload; add model picker. PROPOSAL.
Confidence: TRACED (code read).