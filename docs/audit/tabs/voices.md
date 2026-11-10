# Voices (Clone & Profiles)

Route: `/voices` → `app/src/features/voices/ClonePage.tsx`. In nav: yes (Create group). Legacy `components/VoiceProfiles/` is dead (AGENTS.md).

## Job
A user comes here to clone a voice from samples, create a voice profile, test it, and save to the voice library used by Generate/Dubbing.

## Complete-flow checklist
1. Input: record or upload samples with quality check (length, noise). PARTIAL (verify).
2. Configure: consent confirmation. UNVERIFIED (required by minimum-flow; check).
3. Model readiness: cloning engine (Qwen/XTTS/Chatterbox). PARTIAL (model picker? GUESS).
4. Run: create profile with progress. UNVERIFIED.
5. Preview: test phrase playback. PARTIAL.
6. Outputs: profile saved to library. `services/profiles.py`, `/profiles`. PRESENT (backend).
7. Save/history: voice library. PRESENT.
8. Link out: to Generate/Dubbing. GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Voice profiles CRUD | yes (`services/profiles.py`, `routes/profiles.py`) | yes (live UI in features/voices) |
| Cloning engines | yes (qwen/xtts/chatterbox backends) | yes (ClonePage) |
| Reference voices | yes (`services/reference_voices.py`) | PARTIAL (inside VoicesTab) |
| Consent | policy? | UNVERIFIED |

## Bugs/risks
- MAJOR (verified): no consent confirmation UI in ClonePage (grep: no consent/Consent/checkbox/Checkbox). Minimum-flow requires consent. (TRACED)
- MINOR: legacy `components/VoiceProfiles/` dead code (orphan, AGENTS.md). (TRACED)

## Gaps & right UX
- Add consent step + quality check (length/noise) + model picker. PROPOSAL.
Confidence: TRACED (code read).