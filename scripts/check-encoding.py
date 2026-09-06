"""Encoding gate: fail on non-UTF-8 bytes, U+FFFD, and double-encoded text.

Guards against archive-restore corruption landing in the repo. Corruption
signatures caught:
1. Invalid UTF-8 bytes (raw cp1252 0x80-0x9F punctuation).
2. U+FFFD replacement characters (lossy conversion already happened).
3. Double-encoded mojibake — valid UTF-8 that was decoded as cp1252 and
   re-encoded (an em dash reads as three cp1252-high characters, an arrow
   as three more, a times sign as two). Such text passes any decode check,
   so each run of cp1252-high characters is tested: if encoding it back to
   cp1252 yields valid UTF-8, it is mojibake.
4. Stray ASCII control bytes other than tab/newline/form-feed (a lost letter
   surfacing as backspace/vertical-tab/etc. is the signature seen in the
   archive restores).
5. C1 control characters U+0080-U+009F — the same cp1252 bytes as (1) after
   a latin-1/surrogate-escape round-trip laundered them into *valid* UTF-8
   (byte 0x93 becomes U+0093, two bytes C2 93). Never intentional in text.
6. Mid-file U+FEFF (BOM / zero-width no-break space away from position 0) —
   a BOM that drifted into the middle of a file through a bad conversion.

Usage (from anywhere in the repo):
  python scripts/check-encoding.py            # scan tracked files (worktree)
  python scripts/check-encoding.py --staged   # scan only staged files
  python scripts/check-encoding.py --commit [REV]   # scan committed blobs at
                                              # REV (default HEAD)
  python scripts/check-encoding.py --fix      # worktree only: rewrite known
                                              # corruption maps in place

- `--staged` lists files via `git diff --cached` and reads each file's **index
  blob** (`git show :path`), so pre-commit verifies the exact bytes git is
  about to commit — not whatever happens to be in the working tree.
- `--commit [REV]` reads the tree at REV straight from git (`git ls-tree` +
  one `git cat-file --batch`), so a dirty working tree cannot mask or invent
  corruption: it reports exactly what is committed at that revision.
- Without flags, files come from `git ls-files` and content is read from the
  working tree.
- Binary files (NUL byte in the first 8 KiB) are skipped: UTF-16 logs, icons,
  archives and fonts are legitimate non-UTF-8. Corrupted text never contains
  NULs, so it is always caught.
- Deliberately no allowlist: corruption markers in a text file are never
  intended content.

--fix applies only the deterministic, reversible maps:
  - raw cp1252 bytes inside mostly-UTF-8 data → their cp1252 character
    (byte-splice repair; up to 200 bad bytes per file);
  - double-encoded mojibake runs → the text they round-trip to
    (cp1252-encode → UTF-8-decode, exactly what the detector validates);
  - C1 controls U+0080-U+009F → the cp1252 character of their byte value
    (the inverse of the latin-1 laundering);
  - mid-file U+FEFF → removed (a leading BOM at position 0 is kept).
U+FFFD, stray ASCII control bytes and DEL are *lossy* (the original glyph is
unknowable) — reported, never rewritten. Every repaired file is re-scanned;
--fix exits 1 if anything (fixed or not) still violates, and refuses to run
together with --staged/--commit (git objects cannot be rewritten).

Exit 0 when clean, 1 with a per-file report otherwise, 2 on usage errors.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SKIP_DIRS = {".git", "node_modules", "target", "venv", ".venv", "dist",
             "build", "__pycache__", ".pytest_cache", "archive"}

_FFFD = "\ufffd"
_BOM = "\ufeff"
_MAX_SPLICE = 200

# All characters Windows-1252 maps 0x80-0xFF to; mojibake output can only
# contain these. Runs of 2+ such chars are the double-encoding signature.
_CP1252_HIGH = set(
    bytes(range(0x80, 0x100)).decode("cp1252", errors="replace")
) - {_FFFD}
_MOJIBAKE_RUN = re.compile("[" + re.escape("".join(sorted(_CP1252_HIGH))) + "]{2,}")

_ASCII_CTRL_NAMES = {8: "backspace", 11: "vertical-tab",
                     12: "form-feed", 127: "DEL"}


def _round_trips(run: str) -> bool:
    """True when the run decodes back to real characters via cp1252→UTF-8."""
    try:
        out = run.encode("cp1252").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return False
    return all(ord(c) >= 0x20 and c != _FFFD for c in out)


def _c1_hint(ch: str) -> str:
    """Describe a C1 control and the cp1252 glyph its byte value maps to."""
    code = ord(ch)
    try:
        intended = bytes([code]).decode("cp1252")
    except UnicodeDecodeError:
        return f"U+{code:04X}"
    return f"U+{code:04X} (cp1252 {intended!r})"


def _read_staged(rel: str) -> bytes | None:
    """Return a file's staged (index) content, or None when not in the index.

    `rel` is repo-root-relative; git is run with cwd=ROOT so `:rel` resolves.
    """
    try:
        out = subprocess.run(
            ["git", "show", f":{rel}"],
            capture_output=True, check=True,
            cwd=str(ROOT),
        ).stdout
    except (OSError, subprocess.CalledProcessError):
        return None
    return out


def _git_files(staged: bool) -> list[str] | None:
    """Return tracked/staged file list, or None when git is unavailable."""
    if staged:
        cmd = ["git", "diff", "--cached", "--name-only", "-z", "--diff-filter=ACM"]
    else:
        cmd = ["git", "ls-files", "-z"]
    try:
        out = subprocess.run(cmd, capture_output=True, check=True,
                             cwd=str(ROOT)).stdout
    except (OSError, subprocess.CalledProcessError):
        return None
    return [p for p in out.decode("utf-8", errors="surrogateescape").split("\0") if p]


def _rev_files(rev: str) -> list[str] | None:
    """Return all file paths in the tree at `rev`, or None when git fails."""
    try:
        out = subprocess.run(
            ["git", "ls-tree", "-r", "-z", "--name-only", rev],
            capture_output=True, check=True,
            cwd=str(ROOT),
        ).stdout
    except (OSError, subprocess.CalledProcessError):
        return None
    return [p for p in out.decode("utf-8", errors="surrogateescape").split("\0") if p]


def _rev_blobs(rev: str, files: list[str]) -> dict[str, bytes]:
    """Fetch every blob at `rev` in one `git cat-file --batch` call."""
    payload = "".join(f"{rev}:{p}\n" for p in files).encode("utf-8")
    out = subprocess.run(
        ["git", "cat-file", "--batch"],
        input=payload, capture_output=True, check=True,
        cwd=str(ROOT),
    ).stdout
    blobs: dict[str, bytes] = {}
    pos = 0
    for rel in files:
        nl = out.index(b"\n", pos)
        header = out[pos:nl]
        pos = nl + 1
        parts = header.split()
        if len(parts) != 3:  # "<obj> missing" — path not in tree
            continue
        size = int(parts[2])
        blobs[rel] = out[pos:pos + size]
        pos += size + 1  # skip the trailing newline after the object
    return blobs


def _walk_files() -> list[str]:
    """Fallback walker when git is unavailable (prunes ignored-style dirs)."""
    out: list[str] = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        rel = Path(dirpath).relative_to(ROOT)
        for name in filenames:
            out.append(str(rel / name))
    return out


def _is_binary(data: bytes) -> bool:
    return b"\x00" in data[:8192]


def _decode_or_report(rel: str, data: bytes, report: list[str]) -> str | None:
    """UTF-8-decode `data`, reporting (and not scanning) on failure."""
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError as exc:
        report.append(f"  {rel}: invalid UTF-8 ({exc})")
        return None


def _scan_text(rel: str, text: str, report: list[str]) -> None:
    """Append one violation line per corrupted spot in `text`.

    Lines are split with keepends so separator-class control characters
    (U+0085 NEL, U+2028/29) stay visible to the checks instead of being
    consumed as line breaks.
    """
    for lineno, line in enumerate(text.splitlines(keepends=True), 1):
        if _FFFD in line:
            excerpt = line.strip().replace(_FFFD, "\u2400")  # visible marker
            report.append(f"  {rel}:{lineno}: {excerpt[:100]}")
        ctrl = [c for c in line
                if ord(c) < 0x20 and c not in "\t\r\n\f"
                or ord(c) == 0x7F
                or 0x80 <= ord(c) <= 0x9F]
        if ctrl:
            pretty: list[str] = []
            for c in dict.fromkeys(ctrl):
                if ord(c) in _ASCII_CTRL_NAMES:
                    pretty.append(_ASCII_CTRL_NAMES[ord(c)])
                elif 0x80 <= ord(c) <= 0x9F:
                    pretty.append(_c1_hint(c))
                else:
                    pretty.append(f"U+{ord(c):04X}")
            excerpt = line.strip()[:80]
            report.append(f"  {rel}:{lineno}: stray control byte(s) "
                          f"{', '.join(pretty)} in {excerpt!r}")
        if _MOJIBAKE_RUN.search(line):
            # Report only runs that round-trip (real double-encoded mojibake).
            shown = []
            for run in _MOJIBAKE_RUN.findall(line):
                if _round_trips(run):
                    out = run.encode("cp1252").decode("utf-8")
                    shown.append(f"{run!r} should be {out!r}")
            if shown:
                excerpt = line.strip()[:80]
                report.append(f"  {rel}:{lineno}: double-encoded: {', '.join(shown)}")
        if _BOM in line and not (lineno == 1 and line.startswith(_BOM)):
            excerpt = line.strip()[:80]
            report.append(f"  {rel}:{lineno}: mid-file U+FEFF (BOM) in {excerpt!r}")


def _scan_bytes(rel: str, data: bytes, report: list[str]) -> None:
    """Append a violation line per corrupted spot in `data`; binary is skipped."""
    if _is_binary(data):
        return
    text = _decode_or_report(rel, data, report)
    if text is None:
        return
    _scan_text(rel, text, report)


def check_file(rel: str, report: list[str], staged: bool = False) -> None:
    """Fetch `rel` (index blob in staged mode, else worktree) and scan it.

    In staged mode the **index blob** is checked, so the result reflects what
    a commit would write. Falls back to the working-tree file when the path
    has no staged version (e.g. intent-to-add entries).
    """
    data: bytes | None
    if staged:
        data = _read_staged(rel)
        if data is None:
            try:
                data = (ROOT / rel).read_bytes()
            except OSError:
                return
    else:
        try:
            data = (ROOT / rel).read_bytes()
        except OSError:
            return  # deleted in the working tree; cannot be committed
    _scan_bytes(rel, data, report)


# ── --fix pipeline: deterministic, verified rewrites ─────────────────────────


def _splice_cp1252_bytes(data: bytes) -> tuple[bytes, int]:
    """Replace raw cp1252 bytes that break UTF-8 decoding, one at a time.

    Returns (possibly-repaired bytes, spliced count). Undefined cp1252 bytes
    (0x81 0x8D 0x8F 0x90 0x9D) abort the repair — no known glyph exists.
    """
    spliced = 0
    while spliced < _MAX_SPLICE:
        try:
            data.decode("utf-8")
            return data, spliced
        except UnicodeDecodeError as exc:
            i = exc.start
            if i >= len(data):
                return data, spliced
            try:
                ch = data[i:i + 1].decode("cp1252")
            except UnicodeDecodeError:
                return data, spliced  # undefined cp1252 byte: cannot map
            data = data[:i] + ch.encode("utf-8") + data[i + 1:]
            spliced += 1
    return data, spliced


def _fix_text(text: str) -> str:
    """Apply the known corruption maps to decoded text."""
    # Mid-file BOMs: drop every U+FEFF except a leading one at position 0.
    if _BOM in text:
        head = _BOM if text.startswith(_BOM) else ""
        body = text[len(head):] if head else text
        text = head + body.replace(_BOM, "")
    out_lines = []
    for line in text.splitlines(keepends=True):
        for run in set(_MOJIBAKE_RUN.findall(line)):
            if _round_trips(run):
                line = line.replace(run, run.encode("cp1252").decode("utf-8"))
        for c in dict.fromkeys(line):
            if 0x80 <= ord(c) <= 0x9F:
                try:
                    line = line.replace(c, bytes([ord(c)]).decode("cp1252"))
                except UnicodeDecodeError:
                    pass  # undefined cp1252 byte: leave for the report
        out_lines.append(line)
    return "".join(out_lines)


def fix_file(rel: str, report: list[str]) -> bool:
    """Repair `rel` in place where the corruption maps are known.

    Appends scan lines for whatever remains after the fix. Returns True when
    the file was rewritten.
    """
    path = ROOT / rel
    try:
        data = path.read_bytes()
    except OSError:
        return False
    if _is_binary(data):
        return False
    fixed_bytes, spliced = _splice_cp1252_bytes(data)
    text = fixed_bytes.decode("utf-8", errors="replace") if spliced else None
    if spliced and text is not None:
        text = _fix_text(text)
        new_data = text.encode("utf-8")
    else:
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            report.append(f"  {rel}: invalid UTF-8 — not auto-fixable, skipped")
            return False
        new_text = _fix_text(text)
        new_data = new_text.encode("utf-8")
    if new_data == data:
        return False  # nothing the known maps could change
    path.write_bytes(new_data)
    return True


def main() -> int:
    argv = sys.argv[1:]
    staged = "--staged" in argv
    do_fix = "--fix" in argv
    commit_rev: str | None = None
    if "--commit" in argv:
        i = argv.index("--commit")
        commit_rev = argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith("-") else "HEAD"
    for arg in argv:
        if arg.startswith("--commit="):
            commit_rev = arg.split("=", 1)[1] or "HEAD"
    if staged and commit_rev is not None:
        print("error: --staged and --commit are mutually exclusive")
        return 2
    if do_fix and (staged or commit_rev is not None):
        print("error: --fix works on the working tree only "
              "(git index/objects cannot be rewritten)")
        return 2

    if commit_rev is not None:
        files = _rev_files(commit_rev)
        if files is None:
            print(f"error: cannot read tree at {commit_rev!r} (bad rev or git unavailable)")
            return 2
        if not files:
            print(f"encoding check OK — no files in tree at {commit_rev}")
            return 0
        blobs = _rev_blobs(commit_rev, files)
        report: list[str] = []
        for rel in files:
            if rel in blobs:
                _scan_bytes(rel, blobs[rel], report)
        if report:
            print(f"encoding check FAILED — {len(report)} violation(s) committed at {commit_rev}:")
            for line in report:
                print(line)
            return 1
        print(f"encoding check OK — {len(files)} files at {commit_rev} clean "
              f"(no invalid UTF-8, U+FFFD, C1/BOM, or double-encoding)")
        return 0

    files = _git_files(staged)
    if files is None:
        files = _walk_files()  # git unavailable: scan the tree instead
    if not files:
        # git available but nothing matches: nothing to scan, nothing to fail on
        scope = "staged files" if staged else "tracked files"
        print(f"encoding check OK — no {scope} to scan")
        return 0

    report = []
    fixed_files = 0
    for rel in files:
        check_file(rel, report, staged=staged)
    if do_fix and not staged:
        report = []
        for rel in files:
            if fix_file(rel, report):
                fixed_files += 1
                check_file(rel, report, staged=False)  # verify post-fix state
    if report:
        scope = "staged files" if staged else "tracked files"
        print(f"encoding check FAILED — {len(report)} violation(s) in {scope}:")
        for line in report:
            print(line)
        if not do_fix:
            print("Fix the corrupted bytes (re-type the intended character),")
            print("then re-stage and re-run. Or run scripts/check-encoding.py --fix")
            print("to auto-apply the known corruption maps (worktree only).")
        else:
            print(f"--fix rewrote {fixed_files} file(s); remaining violations "
                  f"above are lossy (U+FFFD / stray controls) and need manual repair.")
        return 1
    scope = "staged files" if staged else f"{len(files)} tracked files"
    print(f"encoding check OK — {scope} clean (no invalid UTF-8, U+FFFD, "
          f"C1/BOM, or double-encoding)")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
    raise SystemExit(main())
