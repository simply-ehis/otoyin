# Conversation

Route: `/conversation` → `app/src/features/workspace/ConversationView.tsx`. In nav: yes (Studio group).

## Job
A user comes here to build multi-speaker podcast/debate/interview audio with timed lines, auto-duck, auto-level.

## Complete-flow checklist
1. Input: lines/speakers. PRESENT.
2. Configure: timing, overlap, ducking. PRESENT.
3. Model readiness: TTS per line (engine + profile_id on ConversationLine). PARTIAL (per-speaker voice picker missing per TAB_AUDIT; engine defaults to kokoro).
4. Run: generate conversation. PRESENT (`/conversation/generate` backend TRACED).
5. Preview: playback. PRESENT.
6. Outputs: mixed audio. PRESENT.
7. Save/history: UNVERIFIED.
8. Link out: to Export. GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Conversation generate | yes (`routes/conversation.py` /conversation/generate) | yes |
| Per-line engine/profile | yes (ConversationLine fields) | PARTIAL (selector exists for speakers, but `linePayload()` omits engine/profile_id → backend defaults to kokoro + first profile; verified) |
| Auto-duck/level | yes (`/conversation/auto-duck`, `/auto-level`) | yes |

## Bugs/risks
- MAJOR (verified): per-speaker voice picker UI exists but selection is NOT sent to backend (`linePayload()` lines 83-92 omits engine/profileId), so generation ignores chosen voices and uses default profile. Fix: include engine + profileId per line.
- MINOR: resampling not handled if mixed engines (backend comment at conversation.py:184). (TRACED)

## Gaps & right UX
- Fix linePayload to carry engine/profileId; add model picker. PROPOSAL.
Confidence: TRACED (code read).