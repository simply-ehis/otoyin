#!/usr/bin/env python3
"""Mechanical header-convention checker for docs/archive/reports/.

Every report (md/txt) must carry, within its first 10 lines:
    **Date:** YYYY-MM-DD
    **Status:** <TOKEN> [ — prose]      TOKEN ∈ PLANNED|IN PROGRESS|DONE|SUPERSEDED|HISTORICAL|GENERATED
    **Last verified:** YYYY-MM-DD       required for actionable statuses
    **Superseded by:** <path>           required when Status is SUPERSEDED

Exit codes: 0 = conforming (warnings allowed), 1 = structural violation.
`--stale` additionally WARNS (exit still 0) when an actionable status hasn't
been re-verified in STALE_DAYS — that warning list *is* the staleness sweep.

Exempt: README.md (defines the convention) and LOOP_STATUS.md (the dashboard —
its per-row table IS the status). See docs/archive/reports/README.md.
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPORTS_DIR = ROOT / "docs" / "archive" / "reports"
EXEMPT = {"README.md", "LOOP_STATUS.md"}
HEADER_WINDOW = 10
STALE_DAYS = 30

VOCABULARY = ("PLANNED", "IN PROGRESS", "DONE", "SUPERSEDED", "HISTORICAL", "GENERATED")
# Statuses whose claims can rot and therefore need re-verification.
ACTIONABLE = ("PLANNED", "IN PROGRESS", "DONE")

FIELD_RE = {
    "date": re.compile(r"^\*\*Date:\*\*\s*(\d{4}-\d{2}-\d{2})\s*$", re.MULTILINE),
    "status": re.compile(r"^\*\*Status:\*\*(.*)$", re.MULTILINE),
    "verified": re.compile(
        r"^\*\*Last verified:\*\*\s*(\d{4}-\d{2}-\d{2})", re.MULTILINE
    ),
    "superseded": re.compile(r"^\*\*Superseded by:\*\*\s*(\S+)", re.MULTILINE),
}


def parse_date(value: str) -> datetime | None:
    """Parse YYYY-MM-DD into an aware UTC datetime, None when malformed."""
    from datetime import UTC

    try:
        return datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=UTC)
    except ValueError:
        return None


def status_token(status_line: str) -> str | None:
    """Extract the leading vocabulary token from a **Status:** value.

    The multi-word token is matched before single words so "IN PROGRESS"
    isn't misread as "IN".
    """
    value = status_line.strip()
    for token in sorted(VOCABULARY, key=len, reverse=True):
        if value == token or value.startswith(
            (token + " ", token + "\n", token + "—", token + " -")
        ):
            return token
    return None


def check_file(path: Path, root: Path = ROOT) -> list[str]:
    """Return the list of structural violations for one report file."""
    violations: list[str] = []
    head = "\n".join(
        path.read_text(encoding="utf-8", errors="replace").splitlines()[:HEADER_WINDOW]
    )

    def field(name: str) -> str | None:
        m = FIELD_RE[name].search(head)
        return m.group(1).strip() if m else None

    rel = path.relative_to(root).as_posix()
    if field("date") is None:
        violations.append(
            f"{rel}: missing **Date:** (YYYY-MM-DD) within first {HEADER_WINDOW} lines"
        )
    raw_status = field("status")
    if raw_status is None:
        violations.append(
            f"{rel}: missing **Status:** within first {HEADER_WINDOW} lines"
        )
        return violations
    token = status_token(raw_status)
    if token is None:
        violations.append(
            f"{rel}: **Status:** token not in vocabulary {list(VOCABULARY)} (got {raw_status.strip()[:40]!r})"
        )
        return violations

    verified = field("verified")
    if token in ACTIONABLE and verified is None:
        violations.append(
            f"{rel}: actionable Status {token} requires **Last verified:** (YYYY-MM-DD)"
        )
    if token == "SUPERSEDED" and field("superseded") is None:
        violations.append(f"{rel}: SUPERSEDED requires **Superseded by:** <path>")
    if verified is not None and parse_date(verified) is None:
        violations.append(
            f"{rel}: **Last verified:** is not YYYY-MM-DD (got {verified!r})"
        )
    return violations


def stale_warnings(
    path: Path, root: Path = ROOT, today: datetime | None = None
) -> list[str]:
    """Return warnings for actionable reports not re-verified within STALE_DAYS."""
    from datetime import UTC

    today = today or datetime.now(tz=UTC)
    head = "\n".join(
        path.read_text(encoding="utf-8", errors="replace").splitlines()[:HEADER_WINDOW]
    )
    raw_status = FIELD_RE["status"].search(head)
    verified = FIELD_RE["verified"].search(head)
    if raw_status is None or verified is None:
        return []
    token = status_token(raw_status.group(1))
    if token not in ACTIONABLE:
        return []
    checked = parse_date(verified.group(1))
    if checked is None:
        return []
    age = today - checked
    if age > timedelta(days=STALE_DAYS):
        rel = path.relative_to(root).as_posix()
        return [
            f"{rel}: Status {token} last verified {checked.date()} ({age.days} days ago) — re-check against the tree"
        ]
    return []


def collect(directory: Path) -> list[Path]:
    """Report files to check: md + txt, minus the exempt dashboard/README."""
    return sorted(
        p
        for p in directory.iterdir()
        if p.suffix in (".md", ".txt") and p.name not in EXEMPT
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--stale",
        action="store_true",
        help="also warn when Last verified exceeds 30 days",
    )
    parser.add_argument("--root", type=Path, default=ROOT, help="repo root (for tests)")
    args = parser.parse_args(argv)
    reports = args.root / "docs" / "archive" / "reports"

    if not reports.is_dir():
        print(f"error: {reports} not found", file=sys.stderr)
        return 1

    violations: list[str] = []
    warnings: list[str] = []
    files = collect(reports)
    for path in files:
        violations.extend(check_file(path, args.root))
        if args.stale:
            warnings.extend(stale_warnings(path, args.root))

    print(f"report headers: {len(files)} files checked")
    for w in warnings:
        print(f"  STALE  {w}")
    if violations:
        for v in violations:
            print(f"  FAIL   {v}", file=sys.stderr)
        print(
            f"{len(violations)} header violation(s) — see docs/archive/reports/README.md",
            file=sys.stderr,
        )
        return 1
    if not warnings:
        print(
            "  OK     all headers conform" + (", nothing stale" if args.stale else "")
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
