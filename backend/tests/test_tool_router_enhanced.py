"""Tests for the enhanced task-aware tool router (Phase 1).

Covers:
- Task category detection via keyword matching
- Task-biased scoring in score_tool
- Confidence scoring in select_tools_for_prompt
- Top-5 default focus for small models
"""

from backend.routes.assistant_tools.tool_router import (
    DEFAULT_TOP_K,
    TASK_CATEGORIES,
    _detect_task_category,
    rank_tools,
    score_tool,
    select_tools_for_prompt,
)

FAKE_TOOLS = [
    {"function": {"name": "generate_speech", "description": "Generate spoken audio from text using a voice profile"}},
    {"function": {"name": "generate_music", "description": "Generate a music track from a text prompt"}},
    {"function": {"name": "generate_sfx", "description": "Generate a sound effect from a text prompt"}},
    {"function": {"name": "list_voices", "description": "List available voice profiles"}},
    {"function": {"name": "clone_voice", "description": "Clone a voice from a reference audio sample"}},
    {"function": {"name": "apply_effects", "description": "Apply an effects chain to an audio clip"}},
    {"function": {"name": "noise_reduce", "description": "Remove background noise from audio"}},
    {"function": {"name": "measure_loudness", "description": "Measure the loudness of an audio file in LUFS"}},
    {"function": {"name": "export_audio", "description": "Export the current audio to a file"}},
    {"function": {"name": "transcribe", "description": "Convert speech audio to text transcription"}},
    {"function": {"name": "list_projects", "description": "List all projects"}},
    {"function": {"name": "list_batch_jobs", "description": "List all batch jobs"}},
    {"function": {"name": "conversation_auto_duck", "description": "Auto-duck music for conversation"}},
    {"function": {"name": "master_audio", "description": "Master an audio track to a target loudness"}},
]


class TestDetectTaskCategory:
    def test_generation_category(self):
        cat, score = _detect_task_category("speak hello")
        assert cat == "generation"
        assert score > 0

    def test_voice_category(self):
        cat, _score = _detect_task_category("clone this voice")
        assert cat == "voice"

    def test_editing_category(self):
        cat, _score = _detect_task_category("apply reverb and compress")
        assert cat == "editing"

    def test_analysis_category(self):
        cat, _score = _detect_task_category("measure the loudness")
        assert cat == "analysis"

    def test_no_match(self):
        cat, score = _detect_task_category("do something random")
        assert cat is None
        assert score == 0.0

    def test_all_categories_present(self):
        assert "generation" in TASK_CATEGORIES
        assert "voice" in TASK_CATEGORIES
        assert "editing" in TASK_CATEGORIES
        assert "analysis" in TASK_CATEGORIES
        assert "adr" in TASK_CATEGORIES
        assert "batch" in TASK_CATEGORIES
        assert "export" in TASK_CATEGORIES
        assert "conversation" in TASK_CATEGORIES
        assert "studio" in TASK_CATEGORIES
        assert "project" in TASK_CATEGORIES
        assert "workflow" in TASK_CATEGORIES
        assert "import" in TASK_CATEGORIES
        assert "transcription" in TASK_CATEGORIES
        assert "dubbing" in TASK_CATEGORIES


class TestScoreTool:
    def test_name_overlap_wins(self):
        q = {"generate", "speech"}
        s_name = score_tool(q, "generate_speech", "does not mention generate or speech")
        s_desc = score_tool(q, "mystery_tool", "does not mention generate or speech")
        assert s_name > s_desc

    def test_exact_name_match_bonus(self):
        q = {"generate speech"}
        s = score_tool(q, "generate_speech", "some desc")
        assert s >= 5.0  # exact name match bonus is +5

    def test_task_category_boost(self):
        q_tokens = {"generate", "speech"}
        s = score_tool(q_tokens, "generate_speech", "Generate spoken audio", query="generate speech")
        assert s > 0

    def test_no_query_returns_zero(self):
        s = score_tool(set(), "generate_speech", "some desc")
        assert s == 0.0

    def test_category_boost_magnitude(self):
        q_tokens = {"generate", "speech"}
        s_gen = score_tool(q_tokens, "generate_speech", "Generate speech")
        s_list = score_tool(q_tokens, "list_voices", "List available voices")
        assert s_gen > s_list


class TestRankTools:
    def test_relevant_first(self):
        ranked = rank_tools("transcribe my audio recording to text", FAKE_TOOLS)
        assert ranked[0]["function"]["name"] == "transcribe"

    def test_name_substring_decisive(self):
        ranked = rank_tools("please transcribe this", FAKE_TOOLS)
        assert ranked[0]["function"]["name"] == "transcribe"

    def test_top_k_default_is_five(self):
        assert DEFAULT_TOP_K == 5

    def test_rank_tools_limited_to_k(self):
        ranked = rank_tools("generate speech", FAKE_TOOLS, k=3)
        assert len(ranked) == 3

    def test_empty_query_returns_all(self):
        ranked = rank_tools("", FAKE_TOOLS)
        assert len(ranked) == len(FAKE_TOOLS)

    def test_deterministic_ordering(self):
        ranked1 = rank_tools("generate speech", FAKE_TOOLS)
        ranked2 = rank_tools("generate speech", FAKE_TOOLS)
        assert [t["function"]["name"] for t in ranked1] == [t["function"]["name"] for t in ranked2]


class TestSelectToolsForPrompt:
    def test_splits_detailed_and_remainder(self):
        detailed, remaining, _meta = select_tools_for_prompt("generate speech", FAKE_TOOLS, k=2)
        assert len(detailed) == 2
        detailed_names = {t["function"]["name"] for t in detailed}
        assert "generate_speech" in detailed_names
        assert all(n not in detailed_names for n in remaining)

    def test_empty_query_returns_all(self):
        detailed, remaining, meta = select_tools_for_prompt("", FAKE_TOOLS)
        assert detailed == FAKE_TOOLS
        assert remaining == []
        assert meta["category"] is None
        assert meta["confidence"] == 1.0

    def test_returns_meta_with_category(self):
        _detailed, _remaining, meta = select_tools_for_prompt("speak", FAKE_TOOLS, k=2)
        assert meta["category"] == "generation"
        assert meta["top_k"] == 2
        assert meta["total_tools"] == len(FAKE_TOOLS)
        assert 0.0 <= meta["confidence"] <= 1.0

    def test_confidence_present_for_known_query(self):
        _, _, meta = select_tools_for_prompt("generate speech", FAKE_TOOLS, k=2)
        assert meta["confidence"] > 0.0

    def test_k_parameter_respected(self):
        detailed, _, _ = select_tools_for_prompt("generate speech", FAKE_TOOLS, k=1)
        assert len(detailed) == 1

    def test_top_k_focus(self):
        # With a long query, top-5 should be the most relevant tools
        detailed, _remaining, meta = select_tools_for_prompt(
            "generate speech saying hello with profile abc123", FAKE_TOOLS, k=5
        )
        assert len(detailed) == 5
        assert meta["top_k"] == 5
        # The detailed set should contain the most relevant tools
        detailed_names = {t["function"]["name"] for t in detailed}
        assert "generate_speech" in detailed_names
