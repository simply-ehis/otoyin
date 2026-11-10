# Music Generation

Route: `/music-gen` → `app/src/features/workspace/MusicGenView.tsx`. In nav: yes (Music group).

## Job
A user comes here to generate music from a prompt with genre/BPM/duration controls, preview, extend, and route to stem separation.

## Complete-flow checklist
1. Input: prompt + controls. PRESENT.
2. Configure: genre, BPM, duration, seed, variations. PARTIAL.
3. Model readiness: music models (ACE-Step/HeartMuLa/MiniMax/Stable Audio). PARTIAL (model picker added per TAB_AUDIT).
4. Run: generate with progress. PARTIAL.
5. Preview: audio preview. PRESENT.
6. Outputs: download/extend. PARTIAL.
7. Save/history: UNVERIFIED.
8. Link out: to Stem Separation. PROPOSAL (verify).
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Music gen | yes (`routes/generate.py` /generate/music, `acestep_gguf_backend.py`, `heartmula`, `minimax`, `stable_audio`) | yes |
| Model picker | backend supports | PARTIAL (added) |

## Bugs/risks
- MAJOR: model picker possibly incomplete (common gap). GUESS.
- MINOR: memory on 8GB for ACE-Step. GUESS.

## Gaps & right UX
- Complete model picker + send-to stems. PROPOSAL.
Confidence: GUESS/TRACED.