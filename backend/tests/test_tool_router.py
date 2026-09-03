"""Tests for the offline (no-finetune) tool router + pruned tool prompt.

Replaces the unavailable Needle 2 router with a system-prompt approach: the
planner sees the top-K relevant tools in full, plus a name-only list of the
rest, so execution is never blocked by pruning.
"""

import pytest

from backend.routes.assistant_tools import schemas as schemas_mod
from backend.routes.assistant_tools.constants import build_local_tool_prompt
from backend.routes.assistant_tools.tool_router import (
    rank_tools,
    score_tool,
    select_tools_for_prompt,
)

FAKE_TOOLS = [
    {"function": {"name": "transcribe_audio", "description": "Convert speech audio to text transcription"}},
    {"function": {"name": "generate_speech", "description": "Generate spoken audio from text using a voice profile"}},
    {"function": {"name": "list_voices", "description": "List available voice profiles"}},
    {"function": {"name": "master_track", "description": "Master an audio track to a target loudness"}},
    {"function": {"name": "add_reverb", "description": "Apply reverb effect to an audio clip"}},
    {"function": {"name": "export_project", "description": "Export the current project to a file"}},
]


@pytest.fixture
def patch_tools(monkeypatch):
    from backend.routes.assistant_tools import constants as constants_mod

    monkeypatch.setattr(schemas_mod, "TOOLS", FAKE_TOOLS)
    monkeypatch.setattr(constants_mod, "TOOLS", FAKE_TOOLS)


def test_rank_tools_puts_relevant_first():
    ranked = rank_tools("transcribe my audio recording to text", FAKE_TOOLS)
    assert ranked[0]["function"]["name"] == "transcribe_audio"


def test_rank_tools_name_substring_is_decisive():
    # "transcribe" matches the whole tool name -> should win even with a noisy query
    ranked = rank_tools("please transcribe this", FAKE_TOOLS)
    assert ranked[0]["function"]["name"] == "transcribe_audio"


def test_select_tools_for_prompt_splits_detailed_and_remainder():
    detailed, remaining, meta = select_tools_for_prompt("transcribe audio", FAKE_TOOLS, k=2)
    assert len(detailed) == 2
    detailed_names = {t["function"]["name"] for t in detailed}
    assert "transcribe_audio" in detailed_names
    # remainder excludes everything in the detailed set
    assert all(n not in detailed_names for n in remaining)
    assert meta["category"] is not None  # "transcribe" should match transcription category


def test_select_tools_for_prompt_empty_query_returns_all():
    detailed, remaining, _meta = select_tools_for_prompt("", FAKE_TOOLS)
    assert detailed == FAKE_TOOLS
    assert remaining == []


def test_build_local_tool_prompt_subset_includes_appendix(patch_tools):
    subset = [t for t in FAKE_TOOLS if t["function"]["name"] in ("transcribe_audio", "generate_speech")]
    out = build_local_tool_prompt(subset)
    assert "transcribe_audio" in out
    assert "Other available tools" in out
    assert "list_voices" in out  # name-only remainder is present


def test_build_local_tool_prompt_none_is_backward_compatible(patch_tools):
    out = build_local_tool_prompt(None)
    assert "transcribe_audio" in out
    assert "Other available tools" not in out  # no pruning -> no appendix


def test_get_agent_system_prompt_prunes_with_query(patch_tools, monkeypatch):
    from backend.agents.manifest import get_agent_system_prompt
    from backend.routes.assistant_tools import tool_router as router_mod

    monkeypatch.setattr(router_mod, "DEFAULT_TOP_K", 2)
    out = get_agent_system_prompt(with_tools=True, query="transcribe audio to text")
    assert "transcribe_audio" in out
    assert "Other available tools" in out


def test_get_agent_system_prompt_no_query_includes_all(patch_tools):
    from backend.agents.manifest import get_agent_system_prompt

    out = get_agent_system_prompt(with_tools=True, query=None)
    assert "transcribe_audio" in out
    assert "Other available tools" not in out


def test_score_tool_rewards_name_overlap():
    q = {"audio", "text"}
    s_name = score_tool(q, "transcribe_audio", "does not mention audio or text")
    s_desc = score_tool(q, "mystery_tool", "audio and text processing here")
    assert s_name > s_desc
