"""Unit tests for scripts/check-report-headers.py — the report-header convention
gets its own regression floor: vocabulary, staleness, superseded pointers.

Tests build synthetic docs/reports trees under tmp_path and call the checker's
functions directly (no subprocess, no git), matching the pattern of
test_check_encoding.py.
"""

from __future__ import annotations

import importlib.util
from datetime import datetime, timedelta
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPT = REPO_ROOT / "scripts" / "check-report-headers.py"

spec = importlib.util.spec_from_file_location("check_report_headers", str(SCRIPT))
crh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(crh)


def make_repo(tmp_path: Path, files: dict[str, str]) -> Path:
    """Create a fake repo root with docs/reports/ populated from `files`."""
    reports = tmp_path / "docs" / "reports"
    reports.mkdir(parents=True, exist_ok=True)
    for name, content in files.items():
        (reports / name).write_text(content, encoding="utf-8")
    return tmp_path


HEADER = """# Some report

**Date:** 2026-09-01
**Status:** {status}
**Last verified:** {verified}
{extra}
Body text.
"""


def write(tmp_path: Path, name: str, status: str, verified: str, extra: str = "") -> Path:
    p = (
        make_repo(tmp_path, {name: HEADER.format(status=status, verified=verified, extra=extra)})
        / "docs"
        / "reports"
        / name
    )
    return p


# ── conforming cases ──────────────────────────────────────────────────────


@pytest.mark.parametrize("status", ["PLANNED", "IN PROGRESS", "DONE", "HISTORICAL", "GENERATED"])
def test_actionable_and_frozen_statuses_conform(tmp_path, status):
    path = write(tmp_path, "r.md", status, "2026-09-07")
    assert crh.check_file(path, tmp_path) == []


def test_superseded_with_pointer_conforms(tmp_path):
    path = write(tmp_path, "r.md", "SUPERSEDED", "2026-09-01", extra="**Superseded by:** docs/reports/newer.md\n")
    assert crh.check_file(path, tmp_path) == []


def test_frozen_statuses_do_not_need_last_verified(tmp_path):
    path = write(tmp_path, "r.md", "HISTORICAL", "")
    assert crh.check_file(path, tmp_path) == []


# ── violations ────────────────────────────────────────────────────────────


def test_missing_status_flagged(tmp_path):
    path = make_repo(tmp_path, {"r.md": "# report\n\nSome body.\n"}) / "docs" / "reports" / "r.md"
    v = crh.check_file(path, tmp_path)
    assert any("missing **Status:**" in x for x in v)


def test_missing_date_flagged(tmp_path):
    path = make_repo(tmp_path, {"r.md": "# report\n\n**Status:** DONE\n"}) / "docs" / "reports" / "r.md"
    v = crh.check_file(path, tmp_path)
    assert any("missing **Date:**" in x for x in v)


def test_unknown_status_token_flagged(tmp_path):
    path = write(tmp_path, "r.md", "MAYBE", "2026-09-07")
    v = crh.check_file(path, tmp_path)
    assert any("not in vocabulary" in x for x in v)


def test_actionable_without_last_verified_flagged(tmp_path):
    path = write(tmp_path, "r.md", "DONE", "")
    v = crh.check_file(path, tmp_path)
    assert any("requires **Last verified:**" in x for x in v)


def test_superseded_without_pointer_flagged(tmp_path):
    path = write(tmp_path, "r.md", "SUPERSEDED", "2026-09-01")
    v = crh.check_file(path, tmp_path)
    assert any("SUPERSEDED requires **Superseded by:**" in x for x in v)


def test_header_beyond_window_flagged(tmp_path):
    # Status on line 12 — outside the 10-line window → treated as missing.
    body = "# report\n\n" + "\n" * 10 + "**Status:** DONE\n**Last verified:** 2026-09-07\n"
    path = make_repo(tmp_path, {"r.md": body}) / "docs" / "reports" / "r.md"
    v = crh.check_file(path, tmp_path)
    assert any("missing **Status:**" in x for x in v)


# ── token parsing edge cases ──────────────────────────────────────────────


def test_in_progress_not_misread_as_in():
    assert crh.status_token("IN PROGRESS — live doc") == "IN PROGRESS"
    assert crh.status_token("IN PROGRESS") == "IN PROGRESS"


def test_status_with_em_dash_prose_parses():
    assert crh.status_token("DONE — work landed") == "DONE"
    assert crh.status_token("DONE - work landed") == "DONE"


def test_parse_date_rejects_garbage():
    assert crh.parse_date("not-a-date") is None
    assert crh.parse_date("2026-13-40") is None
    assert crh.parse_date("2026-09-07") is not None


# ── staleness ─────────────────────────────────────────────────────────────


def test_stale_warning_after_threshold(tmp_path):
    old = (datetime.now() - timedelta(days=45)).strftime("%Y-%m-%d")
    path = write(tmp_path, "r.md", "DONE", old)
    w = crh.stale_warnings(path, tmp_path)
    assert len(w) == 1 and "45 days ago" in w[0]


def test_fresh_actionable_not_warned(tmp_path):
    path = write(tmp_path, "r.md", "DONE", "2026-09-07")
    assert crh.stale_warnings(path, tmp_path) == []


def test_frozen_status_never_stale(tmp_path):
    path = write(tmp_path, "r.md", "HISTORICAL", "2020-01-01")
    assert crh.stale_warnings(path, tmp_path) == []


def test_superseeded_never_stale(tmp_path):
    path = write(tmp_path, "r.md", "SUPERSEDED", "2020-01-01", extra="**Superseded by:** newer.md\n")
    assert crh.stale_warnings(path, tmp_path) == []


# ── collection / exemption ────────────────────────────────────────────────


def test_collect_skips_readme_and_dashboard(tmp_path):
    make_repo(
        tmp_path,
        {
            "README.md": "# convention\n",
            "LOOP_STATUS.md": "# dashboard\n",
            "2026-09-01-a.md": HEADER.format(status="DONE", verified="2026-09-07", extra=""),
            "notes.txt": "txt reports count too\n",
        },
    )
    names = [p.name for p in crh.collect(tmp_path / "docs" / "reports")]
    assert "README.md" not in names and "LOOP_STATUS.md" not in names
    assert "2026-09-01-a.md" in names and "notes.txt" in names


def test_main_exit_zero_on_conforming_tree(tmp_path, capsys):
    make_repo(
        tmp_path,
        {
            "a.md": HEADER.format(status="DONE", verified="2026-09-07", extra=""),
            "README.md": "x",
            "LOOP_STATUS.md": "x",
        },
    )
    rc = crh.main(["--root", str(tmp_path)])
    assert rc == 0
    assert "20" not in capsys.readouterr().out  # real-tree count never leaks into fake-tree run


def test_main_exit_one_on_violation(tmp_path):
    make_repo(tmp_path, {"a.md": "# no header\n"})
    assert crh.main(["--root", str(tmp_path)]) == 1
