"""Lossy-question-mark gate: find degraded glyphs that survived as '?'.

The cp1252/UTF-8 archive corruption destroyed some characters entirely:
smart quotes, em dashes and accented letters became literal '?' instead of
U+FFFD. Those pass every encoding check (the bytes are valid UTF-8), so this
scanner hunts them by *context* and then confirms them with twins:

1. Candidate collection — only prose contexts count:
   - .ts/.tsx/.js/.jsx: matches must sit inside a string/template literal,
     a comment, or (for dash/CJK shapes) plain JSX text — never in bare
     code, where `a?b:c` ternaries would flood the report.
   - docs (.md/.txt/.json/...): every line is prose.
   Categories: contraction (don?t), accent (Espa?ol), spaced dash
   (word ? word), CJK-adjacent, uppercase contraction (DON?T).

2. Twin-based probe — evidence of the original glyph before any claim:
   - git twin: the same file at HEAD — a nearby line with the identical
     pre/post context but a real glyph where the candidate has '?'
     (proves in-tree degradation).
   - repo twin: the same pre/post phrase anywhere else in the corpus.
   Both probes run in bulk: one `git cat-file --batch` for all candidate
   files, and C-speed `str.find` passes over a single corpus string.

A candidate with NO twin, or with disagreeing twins, stays "unconfirmed" —
reported, never auto-fixed (a legitimate '?' can sit in prose: "really?",
French "word ?").
Auto-fix (--fix) applies only when every twin agrees on one replacement
character and the category is replaceable.

Usage:
  python scripts/check-lossy-qmark.py            # scan + probe, report
  python scripts/check-lossy-qmark.py --fix      # apply twin-confirmed fixes
  python scripts/check-lossy-qmark.py --json     # machine-readable report

Allowlist: scripts/lossy-qmark-allow.json holds reviewed false positives
(e.g. CJK locales whose '?' deliberately mirrors the English source's own
ASCII '?'). Each entry pins path, line, category and an excerpt prefix; an
entry whose line no longer matches is reported as stale instead of silently
suppressing.

Exit 0 when nothing needs attention, 1 otherwise.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SKIP_DIRS = {".git", "node_modules", "target", "venv", ".venv", "dist",
             "build", "__pycache__", ".pytest_cache", "archive", "data",
             "binaries", "coverage"}

TEXT_EXTS = {".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".py", ".html",
             ".css", ".txt", ".yml", ".yaml", ".toml", ".svg"}

CODE_FILE_EXTS = {".ts", ".tsx", ".js", ".jsx"}

CATEGORIES: list[tuple[str, re.Pattern[str]]] = [
    ("contraction", re.compile(r"[A-Za-z]\?(?:s|t|ve|re|ll|d|m)\b")),
    ("accent", re.compile(r"[a-z]\?[a-z]")),
    ("spaced-dash", re.compile(r"[a-z,] \? [a-z]")),
    ("cjk", re.compile(r"[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]\?")),
    ("contraction-upper", re.compile(r"[A-Z]{2,}\?[A-Z]")),
]

# characters a degraded glyph plausibly was; twins must agree on one of these
TWIN_CHARS = set(
    "—–-''\u2019\u2018\u201c\u201d…×≈§→«»\u00b7\uff1f\uff01"
    "àáâãäåèéêëìíîïòóôõöùúûüçñýÿÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÑ"
)
REPLACEABLE = {"contraction", "contraction-upper", "accent", "spaced-dash", "cjk"}

CTX = 24  # chars of pre/post context used for twin matching


@dataclass
class Candidate:
    path: str
    line_no: int
    col: int
    category: str
    raw_line: str
    twins: dict[str, str] = field(default_factory=dict)  # probe -> chars found

    @property
    def pre(self) -> str:
        return self.raw_line[max(0, self.col - CTX):self.col]

    @property
    def post(self) -> str:
        return self.raw_line[self.col + 1:self.col + 1 + CTX]

    @property
    def replacement(self) -> str | None:
        chars = {c for cs in self.twins.values() for c in cs}
        if len(chars) == 1 and self.category in REPLACEABLE:
            return next(iter(chars))
        return None


def _iter_files() -> list[Path]:
    out: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            p = Path(dirpath) / name
            if p.suffix in TEXT_EXTS:
                out.append(p)
    return out


def _string_spans(text: str) -> list[tuple[int, int]]:
    """Spans of string/template literals in JS/TS code."""
    return [m.span() for m in re.finditer(
        r"'(?:[^'\\\n]|\\.)*'|\"(?:[^\"\\\n]|\\.)*\"|`(?:[^`\\]|\\.)*`", text)]


def _looks_like_comment(line: str, at: int) -> bool:
    return "//" in line[:at] or line.lstrip().startswith(("*", "//", "/*"))


def _looks_like_url(line: str, q: int) -> bool:
    """True when the '?' at index `q` sits in a URL query (?a=b&c=d)."""
    before = line[max(0, q - 60):q]
    if "http" in before or before.rstrip().endswith(("/", "&", "=")):
        return True
    return bool(re.match(r"^[a-z_]+=?", line[q + 1:q + 40]))


def _collect(files: list[Path]) -> tuple[list[Candidate], dict[str, str]]:
    """Scan all files; return candidates and their raw lines by (path, line_no)."""
    cands: list[Candidate] = []
    raw_lines: dict[str, str] = {}
    for p in files:
        rel = str(p.relative_to(ROOT)).replace("\\", "/")
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        is_code = p.suffix in CODE_FILE_EXTS
        str_spans = _string_spans(text) if is_code else None
        pos = 0
        for lineno, line in enumerate(text.splitlines(keepends=True), 1):
            line_start = pos
            pos += len(line)
            for cat, rx in CATEGORIES:
                for m in rx.finditer(line):
                    # the '?' itself: patterns begin with a letter/run, so the
                    # '?' index is inside the match span
                    q = line.find("?", m.start(), m.end())
                    if q < 0 or "qmark-ok" in line:
                        continue
                    if _looks_like_url(line, q):
                        continue
                    abs_at = line_start + q
                    if is_code and str_spans is not None:
                        in_string = any(s <= abs_at < e for s, e in str_spans)
                        in_comment = _looks_like_comment(line, q)
                        # operator-shaped patterns in code are noise: ternaries
                        # always carry ` : ` after the true-branch. This holds
                        # inside strings too (a degraded dash would need real
                        # prose after it, not ` : expr`).
                        if re.search(r"\s:\s", line[q + 1:q + 90]):
                            continue
                        if cat in ("accent", "contraction") and not (in_string or in_comment):
                            continue
                    raw_lines_key = f"{rel}:{lineno}"
                    raw_lines[raw_lines_key] = line
                    cands.append(Candidate(rel, lineno, q, cat, line))
    return cands, raw_lines


def _git_head_blobs(paths: list[str]) -> dict[str, str]:
    """Fetch HEAD content of every candidate file in one batch call."""
    if not paths:
        return {}
    payload = "".join(f"HEAD:{p}\n" for p in paths).encode("utf-8")
    try:
        out = subprocess.run(
            ["git", "cat-file", "--batch"],
            input=payload, capture_output=True, check=False, cwd=str(ROOT),
        ).stdout
    except OSError:
        return {}
    blobs: dict[str, bytes] = {}
    pos = 0
    for p in paths:
        nl = out.find(b"\n", pos)
        if nl < 0:
            break
        parts = out[pos:nl].split()
        pos = nl + 1
        if len(parts) != 3:  # "<path> missing"
            continue
        size = int(parts[2])
        blobs[p] = out[pos:pos + size]
        pos += size + 1
    return {k: v.decode("utf-8", errors="replace") for k, v in blobs.items()}


def _probe_git_twins(cands: list[Candidate]) -> None:
    """Same file at HEAD, window around the candidate line: identical
    pre/post context with a real glyph at the '?' position."""
    paths = sorted({c.path for c in cands})
    blobs = _git_head_blobs(paths)
    head_lines: dict[str, list[str]] = {
        p: t.splitlines() for p, t in blobs.items()
    }
    for c in cands:
        lines = head_lines.get(c.path)
        if not lines:
            continue
        pre, post = c.pre, c.post
        if len(pre.strip()) < 6 or len(post.strip()) < 4:
            continue
        found: list[str] = []
        lo, hi = max(0, c.line_no - 9), min(len(lines), c.line_no + 9)
        for ln in lines[lo:hi]:
            start = 0
            while True:
                i = ln.find(pre, start)
                if i < 0:
                    break
                start = i + 1
                j = i + len(pre)
                if j >= len(ln) or ln[j] == "?":
                    continue
                if not ln[j + 1:].startswith(post[:8]):
                    continue
                if ln[j] in TWIN_CHARS:
                    found.append(ln[j])
        if found:
            c.twins["git"] = "".join(found)


class _Corpus:
    """All corpus lines with fast phrase lookup, skipping given (path, line)."""

    def __init__(self, files: list[Path]):
        self.lines: list[tuple[str, int, str]] = []
        offsets = [0]
        chunks: list[str] = []
        for p in files:
            rel = str(p.relative_to(ROOT)).replace("\\", "/")
            try:
                text = p.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            for n, ln in enumerate(text.splitlines(), 1):
                self.lines.append((rel, n, ln))
                offsets.append(offsets[-1] + len(ln) + 1)
                chunks.append(ln)
            chunks.append("")  # keeps offsets aligned per file
        self.text = "\n".join(chunks)
        self.offsets = offsets[:-1]

    def _line_of(self, off: int) -> tuple[str, int, str]:
        import bisect
        i = bisect.bisect_right(self.offsets, off) - 1
        return self.lines[i]

    def find_phrase(self, pre: str, post: str, skip: tuple[str, int]) -> list[str]:
        """Chars at the '?' position in corpus lines matching pre+?+post."""
        found: list[str] = []
        if len(pre.strip()) < 6 or len(post.strip()) < 4:
            return found
        start = 0
        hits = 0
        while hits < 2000:
            i = self.text.find(pre, start)
            if i < 0:
                break
            start = i + 1
            j = i + len(pre)
            if j >= len(self.text) or self.text[j] == "?":
                continue
            if not self.text[j + 1:].startswith(post[:8]):
                continue
            rel, n, _ = self._line_of(i)
            if (rel, n) == skip:
                continue
            if self.text[j] in TWIN_CHARS:
                found.append(self.text[j])
            hits += 1
        return found


def _probe_repo_twins(cands: list[Candidate], corpus: _Corpus) -> None:
    for c in cands:
        found = corpus.find_phrase(c.pre, c.post, (c.path, c.line_no))
        if found:
            c.twins["repo"] = "".join(found)


def _apply_fixes(confirmed: list[Candidate]) -> int:
    by_path: dict[str, list[Candidate]] = {}
    for c in confirmed:
        by_path.setdefault(c.path, []).append(c)
    fixed = 0
    for path, cands in by_path.items():
        p = ROOT / path
        lines = p.read_text(encoding="utf-8").splitlines(keepends=True)
        changed = False
        for c in sorted(cands, key=lambda x: (x.line_no, x.col), reverse=True):
            ch = c.replacement
            assert ch is not None
            line = lines[c.line_no - 1]
            if c.col < len(line) and line[c.col] == "?":
                lines[c.line_no - 1] = line[:c.col] + ch + line[c.col + 1:]
                changed = True
                fixed += 1
            else:
                print(f"  ! col drift at {path}:{c.line_no}:{c.col} — skipped")
        if changed:
            p.write_text("".join(lines), encoding="utf-8")
            print(f"fixed {sum(1 for c in cands if c.replacement)} site(s) in {path}")
    return fixed


def _load_allowlist() -> list[dict]:
    path = ROOT / "scripts" / "lossy-qmark-allow.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []


def _is_allowed(c: Candidate, allow: list[dict]) -> str | None:
    """Return the entry's reason when (path, line, category) matches and the
    line still starts with the pinned excerpt; None otherwise."""
    prefix = c.raw_line.strip()[:60]
    for e in allow:
        if (e.get("path") == c.path and e.get("line") == c.line_no
                and e.get("category") == c.category):
            if str(prefix).startswith(str(e.get("excerpt", ""))[:40]):
                return e.get("reason", "allowlisted")
            return None  # stale entry — do not suppress
    return None


def main() -> int:
    argv = sys.argv[1:]
    do_fix = "--fix" in argv
    as_json = "--json" in argv

    files = [p for p in _iter_files()
             if p.name not in (Path(__file__).name, "lossy-qmark-allow.json")]
    cands, _raw = _collect(files)
    if not cands:
        print("lossy-? scan OK — no candidates in prose contexts")
        return 0

    _probe_git_twins(cands)
    _probe_repo_twins(cands, _Corpus(files))

    allow = _load_allowlist()
    allowed: list[tuple[Candidate, str]] = []
    disallowed: list[Candidate] = []
    for c in cands:
        reason = _is_allowed(c, allow)
        (allowed if reason else disallowed).append(
            (c, reason) if reason else c)

    confirmed = [c for c in disallowed if c.replacement]
    unconfirmed = [c for c in disallowed if not c.replacement]

    if as_json:
        print(json.dumps({
            "candidates": [
                {"path": c.path, "line": c.line_no, "col": c.col,
                 "category": c.category, "excerpt": c.raw_line.strip()[:120],
                 "twins": c.twins, "replacement": c.replacement}
                for c in cands
            ],
        }, ensure_ascii=False, indent=1))
        return 1 if cands else 0

    if do_fix and confirmed:
        _apply_fixes(confirmed)

    for c in unconfirmed:
        twins = {k: "".join(sorted(set(v))) for k, v in c.twins.items() if v}
        print(f"{c.path}:{c.line_no}:{c.col} [{c.category}] no-agreement "
              f"twins={twins or '{}'} :: {c.raw_line.strip()[:100]}")
    for c in confirmed:
        ch = c.replacement
        assert ch is not None
        print(f"{c.path}:{c.line_no}:{c.col} [{c.category}] confirmed "
              f"replacement {ch!r} :: {c.raw_line.strip()[:100]}"
              + ("  (fixed)" if do_fix else ""))
    stale_allow = []
    for e in allow:
        hit = next((c for c in cands if c.path == e.get("path")
                    and c.line_no == e.get("line")
                    and c.category == e.get("category")), None)
        matches = hit is not None and _is_allowed(hit, allow) is not None
        if hit is None or not matches:
            stale_allow.append(e)
    for e in stale_allow:
        print(f"stale allowlist entry (no longer matches): {e.get('path')}:{e.get('line')}")

    remaining = unconfirmed if do_fix else disallowed
    if remaining or stale_allow:
        print(f"lossy-? scan: {len(remaining)} site(s) need attention "
              f"({len(confirmed)} confirmed, {len(unconfirmed)} unconfirmed, "
              f"{len(allowed)} allowlisted)")
        return 1
    print(f"lossy-? scan OK — {len(allowed)} reviewed allowlisted, "
          f"0 need attention")
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
    raise SystemExit(main())
