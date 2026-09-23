"""MCP registration invariant.

Locks the two-layer registration design (see mcp_server/tools/__init__):
TR regex-scans the @mcp.tool decorators for metadata, tr_dispatch generates
the live wrappers. Decorated names and TR names must match exactly — drift in
either direction fails the build.
"""

import re
from pathlib import Path

import pytest

from backend.tool_registry import TR
from backend.tool_registry_populate import populate


def _decorated_names() -> set[str]:
    tools_dir = Path(__file__).parent.parent / "mcp_server" / "tools"
    names = set()
    for tool_file in tools_dir.iterdir():
        if tool_file.suffix != ".py" or tool_file.name.startswith("_") or tool_file.name == "tr_dispatch.py":
            continue
        content = tool_file.read_text(encoding="utf-8", errors="replace")
        names.update(re.findall(r'name="(21labs\.[a-z_0-9]+)"', content))
    return names


def test_decorated_names_equal_tr_names():
    populate()
    tr_names = {t.name for t in TR.for_surface("mcp")}
    decorated = _decorated_names()
    assert decorated == tr_names, (
        f"decorated-only: {sorted(decorated - tr_names)[:10]}, TR-only: {sorted(tr_names - decorated)[:10]}"
    )


def test_workflow_step_budget():
    from backend.services.workflow import MAX_PLAN_STEPS, build_plan

    assert MAX_PLAN_STEPS == 25
    with pytest.raises(ValueError, match="budget"):
        build_plan("too big", [{"tool": "x", "description": "y"} for _ in range(26)])
    plan = build_plan("ok", [{"tool": "x", "description": "y"}])
    assert len(plan.steps) == 1
