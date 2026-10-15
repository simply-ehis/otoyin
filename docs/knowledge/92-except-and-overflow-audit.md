"""Backend broad-except audit (WHATS_NEXT item 4).

497 `except Exception` blocks in production backend code, classified with an
AST pass (audit_excepts.py writes except-audit.json):

| Bucket | Count | Meaning |
|---|---|---|
| logs properly | 321 | `logger.*` with context |
| re-raises | 23 | propagates |
| raises domain error | 61 | `HTTPException`/`RuntimeError` etc. |
| **silent (fallback, no log)** | 23 | was 84 |
| **naked (no log, no fallback)** | 5 | was 8 |

A second pass (find_swallowers.py) separated the *real* swallowers from
legitimate ones: `routes/health.py` and `services/crash_reports.py` capture
the error into their response payload (`detail=str(e)[:120]`) - that is the
endpoint's job, not a swallow. True swallowers: **60 -> 15**.

The 15 that remain are all deliberate best-effort paths:
- 3 PyInstaller bootstrap hooks (`pyi_rth_*`) - run before logging exists
- `fatal_handlers.py` - a crash handler must never raise
- `build_binary.py` dep probing, `scripts/check_placeholders.py`
- 4 `tool_registry_populate.py` blocks (comment-documented "don't crash startup")

Fix applied: `logger.debug("<what> (suppressed)", exc_info=True)` inserted as
the first statement of every previously-unlogged block (64 blocks in 32 files,
then 15 more in 6 files that had no module logger and got one). Behaviour is
unchanged - control flow, returns and fallbacks are untouched - the failures
just become diagnosable.

Six files needed a module-level `logger` added: tool_registry_populate,
routes/library, services/{audiobook_llm,audio_conversion,breath_pause,settings}.
routes/library.py has `from __future__ import annotations`, which must stay
first - the logger goes after the whole import block.

Verified: ruff check + format clean on 591 files; every file compiles;
`backend.main` imports; 280 tests pass across the model/download/audit suites.

## Overflow audit (companion)

`audit_overflow.py` scans `app/src` for text-escape patterns and writes
overflow-audit.txt. Raw result: 436 candidates - but the heuristics are
deliberately noisy and need a human pass before anything is changed:

- **325 flex-no-minw0** - most are false positives (rows whose children are
  `shrink-0`, or that already truncate nearby). Only worth fixing per-file.
- **97 usercontent-no-break** - includes ~40 false positives where the match
  is a *prop* (`title={title}`, `error={error}`), not rendered text.
- **8 nowrap-no-truncate** - all 8 are intentional shadcn/ui patterns
  (button, tooltip, table header). No change needed.
- **6 fixed-height text containers** - `h-36px`/`h-60px` on rows that hold
  dynamic text; the real risk, worth a targeted look.

Conclusion: no systemic overflow bug was proven. The honest next step is a
per-file review of the 97 user-content hits in the components that render
long strings (StoreFilters, ProductActions, BookDetail, ChapterList,
ImportWizard, DubbingTab) - not a blanket sed.
"""