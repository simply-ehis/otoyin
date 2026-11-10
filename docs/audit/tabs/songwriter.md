# Songwriter

Route: `/songwriter` → `app/src/features/songwriter/SongwriterTab.tsx`. In nav: yes (Create group).

## Job
A user comes here to draft song lyrics with sections, rhyme/line help and AI suggestions, then send lyrics to music generation or TTS.

## Complete-flow checklist
1. Input: lyrics editor with sections. PRESENT (per minimum-flow).
2. Configure: rhyme/line help, AI suggestions. PARTIAL (verify LLM wiring).
3. Model readiness: LLM (gguf) for suggestions. PARTIAL.
4. Run: generate suggestions. UNVERIFIED.
5. Preview: n/a (text). 
6. Outputs: save draft (`services/song_drafts.py`, `routes/song_drafts.py`). PRESENT (backend).
7. Save/history: drafts. PRESENT (backend).
8. Link out: to Music Gen / Generate. PROPOSAL (verify).
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Song drafts | yes (`routes/song_drafts.py`, `services/song_drafts.py`) | yes (tab) |
| LLM suggestions | yes (`services/llm.py`, `routes/llm.py`, `assistant`) | PARTIAL |
| Send to music gen | backend supports music gen | UNVERIFIED UI |

## Bugs/risks
- MINOR: LLM model may not be installed; need "model not installed" state. GUESS.

## Gaps & right UX
- Add explicit "Send lyrics to Music Gen" and "Send to Generate". PROPOSAL.
Confidence: GUESS.