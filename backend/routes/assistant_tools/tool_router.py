"""Offline tool router — relevance pruning without a finetuned model.

The original assistant design reserved a dedicated "Needle 2" 45M router model
to retrieve the top-K relevant tools from the ~128-tool catalogue so only those
few reached the planner's context. That binary is not obtainable offline
(redistribution terms unresolved, no source URL), so it cannot ship.

This module delivers the *same benefit* — a focused, smaller tool list for the
planner — using only lexical relevance scoring against the user's query. No
model, no weights, no network. It is fully deterministic and on-device.

Designed for small on-device models (2B--4B Qwen3.5 family). Aggressive
context pruning keeps the prompt under the model's sweet spot while the
name-only appendix ensures no tool is ever hidden from execution.

Execution is never blocked by pruning: tools are resolved by name from the
global ENDPOINT_MAP registry at call time, so the planner can still invoke any
tool it names, even one not described in the (pruned) prompt. All tool names
remain visible in the prompt as a name-only appendix for exactly that reason.
"""

from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)

# Number of tools rendered with full descriptions (the "retrieved" set).
# DEFAULT_TOP_K = 12 was too generous for 2B--4B models — top-5 keeps the
# prompt compact and forces the planner to focus on the most relevant tools.
DEFAULT_TOP_K = 5

# Task categories and their keyword triggers. Used to bias scoring toward
# tools that match the user's intent category, which small models benefit
# from because they cannot reason about abstract relevance as well.
TASK_CATEGORIES: dict[str, dict] = {
    "generation": {
        "keywords": {
            "speak",
            "say",
            "say hello",
            "generate speech",
            "text to speech",
            "tts",
            "voice clip",
            "voice message",
            "read this",
            "narrate",
            "narration",
            "voiceover",
            "voice over",
            "tell me",
            "read aloud",
            "audio from text",
            "generate music",
            "music track",
            "beat",
            "song",
            "musical",
            "acestep",
            "heartmula",
            "generate sfx",
            "sound effect",
            "sfx",
            "foley",
            "sound from text",
            "audio generation",
        },
        "boost_tools": {"generate_speech", "generate_music", "generate_sfx"},
        "weight": 3.0,
    },
    "voice": {
        "keywords": {
            "voice",
            "voices",
            "voice profile",
            "clone",
            "character",
            "personality",
            "vocal",
            "tone",
            "speaker",
            "recording voice",
            "voice design",
            "voice clone",
            "reference voice",
            "voice pack",
        },
        "boost_tools": {
            "create_profile",
            "clone_voice",
            "list_voices",
            "get_profile",
            "update_profile",
            "delete_profile",
            "add_profile_sample",
            "list_profile_samples",
            "list_preset_voices",
        },
        "weight": 2.5,
    },
    "editing": {
        "keywords": {
            "edit",
            "cut",
            "copy",
            "paste",
            "trim",
            "splice",
            "fade",
            "blend",
            "combine",
            "mix",
            "master",
            "effect",
            "effects chain",
            "eq",
            "compress",
            "reverb",
            "delay",
            "pitch",
            "time stretch",
            "normalize",
            "duck",
            "silence",
            "noise",
            "denoise",
            "de-esser",
            "enhance",
            "process",
            "apply effects",
            "audio edit",
            "waveform",
        },
        "boost_tools": {
            "apply_effects",
            "noise_reduce",
            "compress_audio",
            "normalize_audio",
            "duck_audio",
            "silence_removal",
            "time_stretch",
            "blend",
            "fade_in",
            "fade_out",
            "copy_segment",
            "cut_segment",
            "paste_segment",
            "splice",
            "delete_region",
            "insert_silence",
            "trim_silence",
            "adjust_pauses",
            "breath_pause",
            "shout_to_whisper",
        },
        "weight": 2.5,
    },
    "analysis": {
        "keywords": {
            "analyze",
            "analysis",
            "measure",
            "loudness",
            "pitch",
            "frequency",
            "spectrogram",
            "waveform",
            "stats",
            "statistics",
            "quality check",
            "check quality",
            "loud",
            "db",
            "lufs",
            "true peak",
            "meter",
            "pitch analysis",
            "audio analysis",
        },
        "boost_tools": {
            "measure_loudness",
            "analyze_loudness",
            "analyze_pitch",
            "spectrogram",
            "spatial_binaural",
            "spatial_doppler",
            "spatial_convolution",
            "spatial_render",
        },
        "weight": 2.0,
    },
    "adr": {
        "keywords": {
            "adr",
            "replace dialogue",
            "dub a line",
            "sync a take",
            "acted",
            "over picture",
            "re-record",
            "replacement",
            "voice match",
            "dialogue replacement",
            "auto select",
            "score take",
        },
        "boost_tools": {
            "adr_create_session",
            "adr_upload_guide",
            "adr_upload_take",
            "adr_select_take",
            "adr_auto_select",
            "adr_align",
            "adr_score",
        },
        "weight": 3.0,
    },
    "batch": {
        "keywords": {
            "batch",
            "bulk",
            "queue",
            "render all",
            "render many",
            "all lines",
            "every line",
            "multiple",
            "parallel generate",
            "mass",
        },
        "boost_tools": {
            "batch_create_from_list",
            "batch_job_progress",
            "batch_job_items",
            "batch_job_retry",
            "cancel_batch_job",
        },
        "weight": 2.5,
    },
    "export": {
        "keywords": {
            "export",
            "download",
            "save",
            "file",
            "spotify",
            "audible",
            "podcast",
            "deliver",
            "platform",
            "preset",
            "m4b",
            "mp3",
            "wav",
            "reaper",
        },
        "boost_tools": {
            "export_audio",
            "export_subtitles",
            "export_story_audio",
            "export_audiobook",
            "apply_export_preset",
            "export_reaper_project",
        },
        "weight": 2.0,
    },
    "conversation": {
        "keywords": {
            "conversation",
            "dialogue",
            "chat",
            "interview",
            "panel",
            "multi-speaker",
            "multi speaker",
            "two characters",
            "back and forth",
            "auto duck",
            "auto level",
            "level",
            "duck",
        },
        "boost_tools": {
            "conversation_auto_duck",
            "conversation_auto_level",
            "list_conversation_presets",
        },
        "weight": 2.5,
    },
    "studio": {
        "keywords": {
            "studio",
            "daw",
            "track",
            "session",
            "arrange",
            "multitrack",
            "project",
            "workspace",
            "import",
            "audio studio",
            "playlist",
        },
        "boost_tools": {
            "studio_save_session",
            "studio_load_session",
            "studio_list_sessions",
            "studio_add_track",
            "studio_set_master_volume",
            "studio_import_session",
        },
        "weight": 2.0,
    },
    "project": {
        "keywords": {
            "project",
            "workspace",
            "plan",
            "task",
            "acquire",
            "search asset",
            "source",
            "template",
        },
        "boost_tools": {
            "list_projects",
            "create_agent_project",
            "get_project",
            "get_project_context",
            "list_project_sources",
            "add_project_source",
            "list_project_plans",
            "create_plan",
            "get_plan",
            "acquire_search",
            "acquire_download",
            "list_project_templates",
        },
        "weight": 1.5,
    },
    "workflow": {
        "keywords": {
            "plan",
            "workflow",
            "skill",
            "playbook",
            "step",
            "sequence",
            "how to",
            "guide",
            "recipe",
            "run recipe",
        },
        "boost_tools": {
            "list_skills",
            "plan_workflow",
            "execute_plan",
            "plan_templates",
            "run_recipe",
            "master_audio",
        },
        "weight": 2.0,
    },
    "import": {
        "keywords": {
            "import",
            "incoming",
            "upload",
            "load audio",
            "load video",
            "video",
            "extract",
            "convert",
            "transcode",
            "video preview",
            "audio preview",
        },
        "boost_tools": {
            "video_preview",
            "audio_preview",
            "extract_audio",
            "convert_audio",
            "import_info",
            "list_import_formats",
        },
        "weight": 1.5,
    },
    "transcription": {
        "keywords": {
            "transcribe",
            "subtitle",
            "srt",
            "captions",
            "diarize",
            "speaker label",
            "speech to text",
            "stt",
            "transcript",
            "voice to text",
            "words",
            "chapters",
            "highlights",
        },
        "boost_tools": {
            "transcribe",
            "export_subtitles",
            "list_captures",
            "capture_words",
            "capture_chapters",
        },
        "weight": 2.5,
    },
    "dubbing": {
        "keywords": {
            "dub",
            "translate video",
            "dubbing",
            "voiceover video",
            "localize",
            "language",
            "dub into",
        },
        "boost_tools": {
            "dub_languages",
            "dub_video",
            "dub_status",
            "dub_preview",
            "dub_download",
            "dub_cancel",
            "translate_text",
            "translate_batch",
        },
        "weight": 2.5,
    },
}

_TOKENS_RE = re.compile(r"[a-z0-9]+")


def _tokens(text: str) -> set[str]:
    return set(_TOKENS_RE.findall(text.lower()))


def _name_tokens(name: str) -> set[str]:
    return set(_TOKENS_RE.findall(name.lower().replace(".", "_").replace("-", "_")))


def _detect_task_category(query: str) -> tuple[str | None, float]:
    """Detect the task category from the query text. Returns (category, score)."""
    q_tokens = _tokens(query)
    best_category: str | None = None
    best_score = 0.0
    for category, spec in TASK_CATEGORIES.items():
        hits = q_tokens & spec["keywords"]
        if hits:
            score = len(hits) / len(spec["keywords"])
            if score > best_score:
                best_score = score
                best_category = category
    return best_category, best_score


def score_tool(
    query_tokens: set[str],
    name: str,
    description: str,
    query: str | None = None,
    tool_confidence: dict[str, float] | None = None,
) -> float:
    """Lexical relevance of one tool to a query. Higher is better.

    For small models (2B--4B), the score incorporates task-category bias so
    the router preferentially surfaces tools that match the user's intent
    category, compensating for the model's limited reasoning ability.

    When *tool_confidence* is provided (from the harness), the score is
    multiplied by the tool's confidence value so that tools with a history
    of failures are demoted.
    """
    if not query_tokens:
        return 0.0
    desc_tokens = _tokens(description)
    name_set = _name_tokens(name)

    overlap = len(query_tokens & desc_tokens)
    name_overlap = len(query_tokens & name_set)
    score = overlap + 3.0 * name_overlap
    if name.lower().replace("_", " ") in query_tokens:
        score += 5.0

    # Task-category bias: boost tools whose name matches a category keyword.
    if query is not None:
        category, cat_score = _detect_task_category(query)
        if category is not None:
            spec = TASK_CATEGORIES[category]
            if name in spec["boost_tools"]:
                score += spec["weight"] * (1.0 + cat_score)

    # Confidence decay: tools with failure history are demoted.
    if tool_confidence and name in tool_confidence:
        score *= tool_confidence[name]

    return float(score)


def rank_tools(
    query: str,
    tools: list[dict],
    k: int = DEFAULT_TOP_K,
    tool_confidence: dict[str, float] | None = None,
) -> list[dict]:
    """Return the ``k`` tools most relevant to ``query``, scored offline.

    Deterministic: ties break by the tool's original catalogue order so the
    result is stable across calls.

    When *tool_confidence* is provided, tools with failure history are
    demoted so the model sees them less often.
    """
    if not query or not query.strip():
        return list(tools)

    q_tokens = _tokens(query)
    scored: list[tuple[float, int, dict]] = []
    for idx, tool in enumerate(tools):
        fn = tool.get("function", {})
        name = fn.get("name", "")
        desc = fn.get("description", "") or ""
        scored.append((score_tool(q_tokens, name, desc, query, tool_confidence), idx, tool))

    scored.sort(key=lambda t: (-t[0], t[1]))
    return [t[2] for t in scored[:k]]


def select_tools_for_prompt(
    query: str | None,
    tools: list[dict],
    k: int | None = None,
    tool_confidence: dict[str, float] | None = None,
) -> tuple[list[dict], list[str], dict]:
    """Split the catalogue into the rendered set and a name-only remainder.

    Returns ``(detailed, remaining_names, meta)``. When ``query`` is empty/absent,
    every tool is rendered in full and the remainder is empty (backward
    compatible with the pre-router behaviour).

    ``meta`` contains routing metadata useful for the harness:
    - ``category``: detected task category (or None)
    - ``top_k``: number of detailed tools selected
    - ``confidence``: a 0--1 score indicating routing confidence
    - ``total_tools``: total number of tools in the catalogue
    """
    if k is None:
        k = DEFAULT_TOP_K
    if not query or not query.strip():
        return (
            list(tools),
            [],
            {
                "category": None,
                "top_k": len(tools),
                "confidence": 1.0,
                "total_tools": len(tools),
            },
        )

    detailed = rank_tools(query, tools, k=k, tool_confidence=tool_confidence)
    detailed_names = {t["function"]["name"] for t in detailed}
    remaining = [t["function"]["name"] for t in tools if t["function"]["name"] not in detailed_names]

    category, cat_score = _detect_task_category(query)
    confidence = min(1.0, len(detailed) / k + cat_score * 0.2) if category else 0.5

    meta = {
        "category": category,
        "top_k": len(detailed),
        "confidence": round(confidence, 3),
        "total_tools": len(tools),
    }
    return detailed, remaining, meta


def get_focus_mode_prompt(query: str | None, tools: list[dict]) -> str:
    """Build a focused prompt for small models (2B--4B).

    Always shows exactly the top-5 detailed tools plus a name-only appendix
    of the rest. This minimizes tokens spent on tool descriptions while
    keeping every tool visible for execution.
    """
    from .constants import build_local_tool_prompt

    detailed, _remaining, meta = select_tools_for_prompt(query, tools)
    return build_local_tool_prompt(detailed, meta=meta)
