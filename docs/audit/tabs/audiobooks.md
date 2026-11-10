# Audiobooks

Route: `/audiobooks` → `app/src/features/audiobooks/AudiobooksTab.tsx`. In nav: yes (Studio group).

## Job
A user comes here to produce an audiobook: import script/EPUB, cast voices per character, render chapters, export Audible-ready format.

## Complete-flow checklist
1. Input: import script/EPUB (`services/book_import.py`, `chapters.py`). PARTIAL (verify).
2. Configure: voice per character, pacing. PARTIAL.
3. Model readiness: TTS engines per voice. PARTIAL (model picker? GUESS).
4. Run: render chapters with progress. UNVERIFIED.
5. Preview: per-chapter audio. UNVERIFIED.
6. Outputs: export Audible-ready. `services/audiobook_render.py`. PARTIAL.
7. Save/history: audiobook project. UNVERIFIED.
8. Link out: to Library/Export. GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: UNVERIFIED.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Book import | yes (`book_import.py`) | PARTIAL |
| Chapters | yes (`chapters.py`, `routes/audiobooks.py`) | yes (tab) |
| Render | yes (`audiobook_render.py`, `audiobook_llm.py`) | PARTIAL |
| LLM casting assist | yes (`audiobook_llm.py`) | UNVERIFIED |

## Bugs/risks
- MAJOR: memory spike rendering many chapters on 8GB target. GUESS (needs tracing).
- MINOR: model picker likely missing (common gap). GUESS.

## Gaps & right UX
- Add per-chapter progress + cancel + model picker. PROPOSAL.
Confidence: GUESS.