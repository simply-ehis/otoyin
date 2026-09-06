# Component Lineage — Where Pre-Repair Sources Live

PURPOSE: Recovery map after the corrupt-source `archive/` directory was deleted.
OWNS: Nothing — a pointer doc. The lineage facts live in `REBUILD_LOG.md` (repo root).
READ-WHEN: A component looks wrong and you wonder whether the archive copy was better, or you need the pre-repair text of a restored file.
INVARIANTS: `archive/` is gone and must not be recreated; every recovery path below is git-object based.
GOTCHAS: The archive was **never tracked** — `git show` on archive paths fails. Recovery means git history, not `archive/`.
UPDATED: 2026-09-06

## TL;DR

The original component sources were corrupt (cp1252 bytes, U+FFFD, double-encoded
mojibake, stray control bytes) and were repaired in the working tree. The corrupt
archive copy has been deleted on purpose. Do **not** recreate `archive/` to
"recover" an old component — every recovery path below gives you the same bytes
from git objects, without reintroducing corruption.

## Recovery paths

| You need | Command |
|---|---|
| A component **before repair** (corrupt original) | `git show 630b6f9~1:app/src/components/<Path>/<File>.tsx` |
| A component **at restore time** (corrupt, as first committed) | `git show ba07d00:app/src/components/<Path>/<File>.tsx` |
| A component **after repair** (clean text) | `git show 630b6f9:app/src/components/<Path>/<File>.tsx` |
| The repair diff for one file | `git log -p --follow -- app/src/components/<Path>/<File>.tsx` |
| The corrupt archive copy itself (last resort) | `git log --all --oneline -- archive/frontend-components` (verify it was ever tracked — it was not) |

Replace `<Path>/<File>` with the current `features/` location if the file migrated;
use `git log --follow` to cross the `components/` → `features/` move (commit `bf7de3e`).

## Why the archive was deleted (and why that is safe)

- 342 restored files originated from `archive/frontend-components/`; the archive
  itself was a copy of pre-rebuild `app/src/components`.
- Pre-deletion audit: **314/342** byte-identical to their `app/src/components`
  counterparts, **21** were older pre-repair copies (the repaired tree version is
  strictly newer), **7** `Store/*` files already rebuilt into `features/store/`.
- The archive was the last corrupt-source copy in the tree; keeping it invited a
  future restore that would reintroduce exactly the corruption the gates
  (`.githooks/pre-commit` + `scripts/check-encoding.py` +
  `scripts/check-lossy-qmark.py`) now block.

Full audit and deletion record: `REBUILD_LOG.md`, section
"Restore provenance & archive/ deletion (2026-09-05)".

## Gate reminder

Anything you copy out of old git objects must pass the encoding gate before it can
be committed. If you recover a pre-repair file, expect it to **fail**
`scripts/check-encoding.py` — that is the corruption, not a gate bug. Repair the
glyphs rather than bypassing the hook.
