# PowerShell-Redirect Corruption — the Valid-UTF-8 Class Byte Gates Miss

PURPOSE: Document the corruption mechanism behind the two mangled `.txt` reports (`2026-09-04-typecheck-triage.txt`, `2026-09-04-wiring-audit.txt`), pin the corrupting tool class (PowerShell `>` redirection + an encoding-conversion pass), and extend doc 79's taxonomy with the class that defeats byte-level gates: corruption that is **well-formed UTF-8** with no U+FFFD, no C1 bytes, and no BOM.
OWNS: The mechanism analysis, the detection heuristic (script-run audit), and the repair recipe for this class. Doc 79 owns the general repair/verification method; `scripts/check-encoding.py` owns byte-level scanning.
READ-WHEN: A file looks like garbage but `check-encoding.py` passes it; a report/log snapshot contains CJK, Hangul, or Private-Use-Area characters it has no business containing; you are about to trust "valid UTF-8" as "not corrupt".
INVARIANTS: Never paste the actual corruption glyphs into source, tests, or docs — describe them by code point or hex (the gate flags literal glyphs). Label every mechanism claim as PROVED (byte-verified against the git blob) or INFERRED (plausible, not reconstructible from surviving evidence).
GOTCHAS: This class passes every check `check-encoding.py` runs — validity, FFFD, C1, BOM all come back clean. Detection needs a script-run heuristic, not a byte validator. The corruption concentrates at line boundaries; content lines survive verbatim, which is exactly why it looks "mostly fine" in a pager.
UPDATED: 2026-09-07

## TL;DR

A PowerShell `>` redirect captured tsc output through an encoding mismatch. The
result was committed looking like this: **valid UTF-8**, no replacement chars,
no C1 bytes, no BOM — but every line boundary had become two CJK code points and
the file header a three-glyph mangled BOM. Byte-level gates pass it; only a
"does this ASCII report contain Hangul?" audit catches it. All 70 tsc error
lines survived byte-intact between the mangled boundaries.

## The two cases (evidence)

| | typecheck-triage.txt | wiring-audit.txt |
|---|---|---|
| History | **Born corrupt** — its single blob (`976912c`) is already garbage; no clean ancestor exists | **Re-capture corrupt** — clean ancestor at `493bbb3` (content byte-identical); a later re-capture mangled it |
| Signature | Mangled 3-glyph BOM prefix + a fixed 2-glyph pair at **all 78 line boundaries**; body otherwise pure ASCII | UTF-8 BOM + 4 em-dashes mangled to u-acute (cp850 lens) + CRLF endings |
| Byte-level gate verdict | PASSES (valid UTF-8, no FFFD/C1/BOM) | FAILS (BOM) |
| Repair | Character-level surgery: strip prefix + strip the 78 boundary pairs; verify all 70 error lines intact | Restore from clean ancestor; verify content-identical modulo BOM/EOL/glyphs |
| Char accounting | Closes exactly: 78 pairs x 2 + 3 prefix chars (+1 residual leading LF) = the full corrupt-vs-repaired delta | N/A (ancestor diff is the proof) |

## The mechanism

PROVED, from the corrupt blob at `976912c`:

- The blob is **valid UTF-8 end to end**. `decode("utf-8")` succeeds; there is
  nothing for a byte validator to reject.
- The garbage characters are: two Hangul syllables + a Private-Use-Area char in
  the 3-char file prefix, then the same 2-char pair repeated at every line
  boundary. The pair's code points are U+0A0D and U+0D00 (written as code
  points per the invariant — never paste the glyphs).
- **The pair is the CRLF bytes themselves, read as UTF-16 code units.** U+0A0D
  is the code unit whose little-endian bytes are `0d 0a` (CR LF); U+0D00 is the
  code unit whose bytes are `00 0d` (NUL CR). So the pre-final byte stream
  contained the literal sequence `0d 0a 00 0d` at every line boundary: a **raw
  CRLF** followed by a **byte-swapped CR**. The corrupting writer mixed newline
  conventions at boundaries — raw bytes from one encoding pass, swapped bytes
  from another.
- That mixing is why damage concentrates at line boundaries while every content
  line survives verbatim: the payload bytes were consistent, only the
  boundary bytes were written twice under two conventions.
- The classic double-encoding reversal (decode as cp1252, re-encode) **fails**
  on this garbage — the characters have no cp1252 mapping. This is NOT the
  "a-circumflex/euro/arrow" class in doc 79's table; it only looks similar in
  a pager.

INFERRED (plausible, not reconstructible from the surviving blob):

- The producing pipeline was a PowerShell `>` redirect (PowerShell 5.1 and 7
  both write UTF-16LE by default for `>` unless `$PSDefaultParameterValues`
  overrides it) followed by an encoding-conversion pass whose intermediate
  artifact was not preserved. The exact stage chain — which pass inserted the
  boundary mixing, which pass re-encoded to UTF-8 — cannot be proven from the
  output alone. Do not claim more than the signature supports.

## Why the byte gate missed it

`check-encoding.py` validates: UTF-8 well-formedness, U+FFFD presence, C1
bytes 0x80-0x9F, BOM misuse, raw high bytes. This corruption is:

- valid UTF-8 (the CJK characters are legally encoded),
- FFFD-free (the destruction happened at a *previous* stage; the final write
  produced clean encodings of garbage),
- C1-free and BOM-free.

Every check returns clean. **Valid UTF-8 is a statement about byte structure,
not about content plausibility.** The missing check is a script-run audit: a
file that should be ASCII English prose (a tsc log, a wiring audit) containing
Hangul syllables, CJK ideographs, or Private-Use-Area characters is corrupt
no matter how valid its bytes are.

Detection heuristic (recommended addition to the gate toolchain):

```python
# Flag scripts/log snapshots whose script runs are implausible.
# ASCII-only expectation: reports, logs, captured tool output.
SUSPECT = [
    (0x0600, 0x06FF),   # Arabic
    (0x0900, 0x097F),   # Devanagari
    (0x0A00, 0x0D7F),   # Indic blocks (Gurmukhi/Tamil... boundary artifacts live here)
    (0x3000, 0x303F),   # CJK punctuation
    (0x3040, 0x30FF),   # Kana
    (0x4E00, 0x9FFF),   # CJK ideographs
    (0xAC00, 0xD7A3),   # Hangul syllables
    (0xE000, 0xF8FF),   # Private Use Area
    (0xFFF0, 0xFFFF),   # specials (FFFD lives at FFFD — already gated separately)
]
# Whitelist files that legitimately carry non-ASCII (i18n locales, translation
# files, docs quoting user content) — the audit only asserts on files whose
# ENTIRE body is otherwise ASCII, where any non-ASCII run is anomalous.
```

The "body otherwise pure ASCII" qualifier keeps the heuristic out of the
whitelist business: it only fires on files where a single non-ASCII code point
is already anomalous, which is exactly the shape of this corruption.

## Repair recipe for this class

1. **Snapshot the corrupt blob first** (`git show <commit>:<path>`). It is your
   ground truth for accounting, even though it is not your repair source.
2. **Characterize before cutting**: count the boundary-pair occurrences; assert
   the count equals the line count (78/78 here). Assert every content line
   between boundaries is pure ASCII. If any content line carries non-ASCII,
   stop — this recipe does not apply.
3. **Surgical strip**: remove the fixed prefix and the boundary pairs with
   count assertions (see doc 79's per-site replacement pattern). Normalize the
   line endings you intend (LF for committed docs).
4. **Prove content survival**: diff the stripped body against the corrupt body
   line-by-line; every tsc/error/log line must be byte-identical. The char
   delta must close exactly (pairs x 2 + prefix + any residual LF).
5. **Prefer ancestor restoration when one exists** (the wiring-audit case):
   `git log --all -- <path>` for a clean blob, restore it, and verify the
   current content is otherwise byte-identical. Restoration beats surgery.
6. **Header it as a snapshot** per the docs/reports convention
   (`Status: HISTORICAL` / `GENERATED`) so future staleness sweeps skip it.
7. **Close the loop**: add the file's signature to the regression tests so the
   scanner/gate learns the class (see `backend/tests/test_check_encoding.py`
   for the describe-by-codepoint pattern).

## Prevention

- Never capture tool output with PowerShell `>` into files meant for the repo.
  Use `python -X utf8 -c "..."` drivers, or set
  `$PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'` in the capture
  shell. The `scripts/` gates themselves are captured this way on purpose.
- The pre-commit gate's byte checks remain necessary but are **not
  sufficient**; the script-run audit above is the missing half. Until it is
  wired, treat "valid UTF-8" as "not yet proven clean" for captured output.
- The round-trip + per-glyph proofs in doc 79 apply unchanged to this class —
  they verify the *repair*, whatever the corruption's origin.

## Related

- `79-encoding-repairs.md` — the general repair/verification method this doc extends
- `scripts/check-encoding.py` — byte-level scanner (passes this class; see gap above)
- `backend/tests/test_check_encoding.py` — regression floor; add script-run cases here
- `docs/reports/2026-09-04-typecheck-triage.txt` — repaired case 1 (born corrupt)
- `docs/reports/2026-09-04-wiring-audit.txt` — repaired case 2 (restored from ancestor)
- `docs/reports/README.md` — the header convention for marking snapshots
