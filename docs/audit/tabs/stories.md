# Stories (Narrative Sequencing)

Route: `/stories` → `app/src/features/stories/StoryEditor.tsx`. In nav: yes (Studio group). Note: file is 1000+ lines (AGENTS.md).

## Job
A user comes here to sequence long narrative (audiobook/chapters) as ordered story items with per-item edits, then export one mixed WAV.

## Complete-flow checklist
1. Input: import text/EPUB? `services/book_import.py`, `story_export.py`. PARTIAL (verify import UI).
2. Configure: per-item fade/gain/trim/split/reverse/normalize/silence-removal/version/reorder. PRESENT (per stories skill).
3. Model readiness: TTS engine per item. PARTIAL (model picker? GUESS).
4. Run: render chapter. Progress? UNVERIFIED.
5. Preview: waveform per item + mixed. PARTIAL.
6. Outputs: export one mixed WAV. PRESENT (`story_export.py`).
7. Save/history: story drafts (`services/song_drafts.py`? `story`?). `services/stories/` dir. PARTIAL.
8. Link out: to Audiobooks/Export. GUESS.
9. Errors/recovery: UNVERIFIED.
10. States: UNVERIFIED.
11. Feel: undo/redo? non-destructive edits required by invariant; verify. GUESS.

## Needed vs has
| Capability | Backend | UI |
|---|---|---|
| Story items CRUD | yes (`routes/stories.py`, `services/stories/`) | yes |
| Per-item ops (fade/gain/trim/split/reverse/normalize/silence) | yes | yes (per skill) |
| Export mixed WAV | yes (`story_export.py`) | yes |
| Book import | yes (`book_import.py`) | UNVERIFIED |

## Bugs/risks
- MAJOR: 1000+ line single component (AGENTS.md) — maintainability, but not a bug. GUESS.
- MINOR: model picker possibly missing per TAB_AUDIT (common gap). GUESS.

## Gaps & right UX
- Add model/voice picker per story item. PROPOSAL.
- Confirm undo/redo. PROPOSAL if missing.
Confidence: TRACED (route/ops), GUESS (UI details/cancel).