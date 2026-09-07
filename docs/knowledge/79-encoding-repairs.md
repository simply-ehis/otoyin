# Encoding Repairs — Method for Fixing and Proving Corrupted Files

PURPOSE: Repeatable procedure for repairing encoding-corrupted files (mojibake, control bytes, invalid UTF-8) and **proving the repair correct** with the round-trip + per-glyph method.
OWNS: The repair/verification method. The scanner tool itself lives in `scripts/check-encoding.py`; the gate wiring in `.githooks/pre-commit`; the recovery-after-deletion map in `78-component-lineage.md`.
READ-WHEN: `check-encoding.py` or the pre-commit gate fails on a file; you need to repair a corrupted file and be able to prove no intact text was touched; you are about to hand-replace "weird characters" without a verification plan.
INVARIANTS: Every repair must end with the scanner reporting zero violations AND a round-trip proof against the git-history blob. Control-byte repairs require per-site ground truth from the repo tree — never guess a replacement.
GOTCHAS: Git stores LF, worktrees are CRLF — normalize before any byte comparison or the round-trip diff is garbage. Never embed literal corruption sequences (e.g. the double-encoded quote run) in comments or tests — the gate will flag them; describe the bytes in words instead.
UPDATED: 2026-09-06

## TL;DR

1. Inventory with `check-encoding.py`, classify each violation (map-fixable vs lossy).
2. Snapshot the git-history blob — that is your "before" ground truth.
3. Repair: `--fix` for mapped corruption; tree-verified per-site replacements for lossy bytes.
4. Prove: re-run the identical fix pipeline on the HEAD blob and demand byte equality with the repaired worktree (line-endings normalized).
5. Prove: per-line diff classification showing every changed block originates from corruption bytes.
6. Final gates: scanner clean, `--fix` idempotent, pre-commit encoding check green.

## Corruption taxonomy

| Class | Example | Recoverable? |
|---|---|---|
| Double-encoded runs | UTF-8 bytes decoded as cp1252 (a-circumflex/euro/arrow glyph triples; the scanner reports the exact sequences) | Yes — `--fix` maps, round-trip guarded |
| C1 bytes 0x80–0x9F | cp1252 smart quotes/punct as raw controls | Yes — mapped, reported with cp1252 glyph hint |
| BOM misuse | UTF-8 file carrying a UTF-16 BOM | Yes — stripped by `--fix` |
| Letter→control-byte swaps | `` `b ``/`` `f `` shell escapes → 0x08/0x0C eating letters | **Lossy** — maps cannot know the letter; needs per-site ground truth |
| U+FFFD, invalid UTF-8 | Information already destroyed at write time | **Lossy** — recover only from external sources (git history, the running code, docs) |
| Valid-UTF-8 script-run garbage | PowerShell `>` redirect + conversion pass: CJK/Hangul/PUA glyphs at line boundaries of an ASCII-only log | **Lossy-ish** — boundary bytes unrecoverable, content lines survive verbatim; strip surgically (see 80) |

The fixer's maps handle the first three classes. The last two require a human decision
grounded in evidence — the verification method below proves those decisions touched
nothing else. The sixth class is worse in a different way: it is **invisible to this
file's byte-level scanner** (valid UTF-8, no FFFD/C1/BOM) and needs the script-run
audit in `80-powershell-redirect-corruption.md`.

## Repair procedure

```bash
# 1. Inventory (whole tree, one file, or staged)
python -X utf8 scripts/check-encoding.py             # all tracked files
python -X utf8 scripts/check-encoding.py --staged    # gate view

# 2. Snapshot the git-history blob BEFORE touching anything
git show HEAD:path/to/file.md > /tmp/repair-orig.md

# 3a. Auto-fix mapped corruption (worktree; keeps CRLF via keepends)
python -X utf8 scripts/check-encoding.py --fix

# 3b. Repair lossy sites manually — ONLY with tree-verified ground truth.
#     Every recovered word must be confirmed to exist in the codebase/docs
#     before substitution. Count-assert the replacements:
python -X utf8 - <<'PY'
from pathlib import Path
p = Path("path/to/file.md")
data = p.read_bytes()
assert data.count(b"\x08") == 11, "site count changed — re-verify each site"
data = data.replace(b"\x08", b"b")   # PowerShell `b ate the letter b
data = data.replace(b"\x0c", b"f")   # PowerShell `f ate the letter f
p.write_bytes(data)
PY
```

## Verification method (the part that makes repairs trustworthy)

### A. Round-trip proof — the fixer is deterministic against the same input

Apply the **identical** fix pipeline to the pristine HEAD blob and demand byte
equality with the repaired worktree. This proves the output is a function of the
corruption alone — no manual drift, no missed sites, no over-repair.

```python
# /tmp/roundtrip.py — run from repo root
import subprocess, sys
from pathlib import Path
sys.path.insert(0, "scripts")
import importlib.util
spec = importlib.util.spec_from_file_location("ce", "scripts/check-encoding.py")
ce = importlib.util.module_from_spec(spec); spec.loader.exec_module(ce)

TARGET = "IMPACT_MAP.md"
head_blob = subprocess.run(["git", "show", f"HEAD:{TARGET}"], capture_output=True, check=True).stdout

# normalize: the worktree copy is CRLF, git history is LF
def norm(b: bytes) -> bytes: return b.replace(b"\r\n", b"\n")

# run the same _fix_text the CLI --fix path uses, on the normalized blob
fixed_blob = ce._fix_text(norm(head_blob).decode("utf-8", errors="surrogateescape"))

worktree = norm(Path(TARGET).read_bytes())
print("ROUND-TRIP EQUAL:", fixed_blob.encode("utf-8", errors="surrogateescape") == worktree)
```

`ROUND-TRIP EQUAL: True` is the acceptance bar. If False: a manual edit did not come
from the pipeline — re-audit every hand replacement.

### B. Per-glyph proof — every change originates from corruption bytes

Round-trip equality proves determinism; this proves **minimality**: no intact ASCII
was touched. Diff the pristine blob against the repaired file **per line** (whole-file
`SequenceMatcher` on 50KB+ buffers is quadratic and will hang; per-line is instant),
and for every changed block assert the *source* span contains only corruption bytes.

```python
# /tmp/perglyph.py — run from repo root
import subprocess, difflib
from pathlib import Path
TARGET = "IMPACT_MAP.md"
def norm(b): return b.replace(b"\r\n", b"\n")
head = subprocess.run(["git", "show", f"HEAD:{TARGET}"], capture_output=True, check=True).stdout
before = norm(head).decode("utf-8", errors="surrogateescape").splitlines()
after  = norm(Path(TARGET).read_bytes()).decode("utf-8", errors="surrogateescape").splitlines()

CORRUPTION = set(range(0x00, 0x20)) - {0x09, 0x0a, 0x0d}  # controls minus TAB/LF/CR
CORRUPTION |= set(range(0x80, 0x100))                      # high bytes
CORRUPTION |= {0xFFFD}

def corrupt_only(src: str) -> bool:
    return all(ord(ch) in CORRUPTION for ch in src)

sm = difflib.SequenceMatcher(None, before, after, autojunk=False)
bad = []
for tag, i1, i2, j1, j2 in sm.get_opcodes():
    if tag == "equal": continue
    src = "".join(before[i1:i2])
    if src and not corrupt_only(src):
        bad.append((tag, i1, src[:60]))
print("blocks with intact source text touched:", len(bad))
for b in bad: print(b)
```

`0` is the acceptance bar. (Same-line mixed damage — corruption adjacent to intact
text — shows up as blocks whose source is the intact prefix/suffix; eyeball those few
against the fix maps rather than auto-accepting.)

### C. Final gates

```bash
python -X utf8 scripts/check-encoding.py          # zero violations repo-wide
python -X utf8 scripts/check-encoding.py --fix    # second run: "no changes" (idempotent)
python -X utf8 scripts/check-encoding.py --staged # what the pre-commit gate runs
```

## Gotchas learned the hard way

- **Line endings poison byte comparison.** `git show` yields LF, the worktree is CRLF.
  An unnormalized comparison of a repaired 52KB file against its blob produces total
  garbage — and a false alarm that the "concurrent session changed the file". Normalize
  `\r\n` → `\n` on both sides first. The fixer itself preserves the worktree's CRLF
  (`splitlines(keepends=True)`), so repairs cause zero line-ending churn.
- **No clean original ≠ no verification.** When HEAD itself is corrupt (one commit of
  history, corruption predates the repo), the round-trip target is the **HEAD blob** —
  you are proving pipeline determinism and minimality, not restoration of a lost
  original. Say which one you proved in the summary.
- **Letter-eating control bytes need the tree as ground truth.** PowerShell's backtick
  escapes (`b`, `f`, `t`, `r`) strip the following letter when pasted into files, leaving
  0x08/0x0C/0x09. Recover the word by confirming the identifier exists in code
  (`grep` the real name in the codebase), then replace with a count assertion.
- **Do not quote corruption literally in source.** A test comment embedding the actual
  double-encoded sequence is indistinguishable from corruption to the gate — it failed
  a real commit. Describe the bytes in words ("lowercase a-umlaut + euro sign + quote
  glyph, twice") or build them programmatically (`"\u00e2\u20ac\u0153"`), as
  `backend/tests/test_check_encoding.py` does.
- **`--fix` is deliberately conservative.** Files with lossy bytes get their mapped
  corruption fixed and the lossy sites reported for manual repair — a second `--fix`
  run after manual repairs must report no changes (idempotency is itself a check).

## Related

- `scripts/check-encoding.py` — scanner/fixer (classes, maps, `--staged`, `--fix`)
- `.githooks/pre-commit` — the gate that makes new corruption uncommittable
- `backend/tests/test_check_encoding.py` — regression floor for the tool
- `78-component-lineage.md` — where pre-repair component sources live
- `REBUILD_LOG.md` — the restore history this method was proven on
