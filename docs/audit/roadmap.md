# Roadmap (suggested order, one slice at a time)

Each slice: one tab or one linking fix. Definition of done = build+lint+tests pass + states shown.

1. Fix sidebar malformed Sounds entry (BUG-001). DoD: sidebar renders, typecheck pass.
2. Timeline: clip drag/drop + snap (BUG-003). DoD: spec in specs/timeline.md implemented; tests.
3. Audio Plan: per-track voice picker + model picker (BUG-004, BUG-006). DoD: UI calls PlanTrackUpdate with voice_profile_id/engine.
4. Conversation: per-speaker voice picker (BUG-005). DoD: linePayload includes profile_id; default profile selection.
5. Model picker rollout to AI tabs (BUG-006): Music Gen, ADR, Stems, Enhance, Noise Reduction, Diarize, Voice Converter. One tab per slice.
6. Voice clone consent + quality check (BUG-007). DoD: consent step + length/noise check.
7. Dubbing segments verify end-to-end (BUG-008).
8. Linking: implement shared Send-to helper + load-by-query-param on target tabs (BUG-019). Start with Generate→Effects, Stems→Effects, Music Gen→Stems.
9. Memory audit: verify model lifecycle rules; add unload on tab switch for heavy tabs (BUG-002, BUG-010).
10. Kokoro chunking verification (BUG-011).
11. Conversation mixed-engine resampling (BUG-012).
12. Configs.py split (BUG-013) — refactor only.
13. Orphan cleanup: remove legacy `components/VoiceProfiles/` after confirming (BUG-009).
14. Help search via app_features.json (BUG-022).
15. Cancel/progress verification pass across tabs (BUG-016/017).

Specs to write under docs/audit/specs/ for tabs scoring ≤3: timeline, audio-plan, conversation, noise-reduction, audio-enhance, vocal-isolation, diarize, music-gen, dubbing, stories, audiobooks. (Create as slices are picked.)