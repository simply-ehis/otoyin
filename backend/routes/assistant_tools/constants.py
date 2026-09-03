"""Constants and prompt helper for the AI assistant tools."""

import logging

from .schemas import TOOLS

logger = logging.getLogger(__name__)

MAX_TOOL_ITERATIONS = 10

# Category-specific few-shot examples.  Small models (2B-4B) anchor hard
# on examples — wrong examples lead to wrong tool calls.  Each category
# gets 1-2 examples matching its typical tools.
_CATEGORY_EXAMPLES: dict[str, str] = {
    "generation": (
        'User: "Generate speech saying hello with profile abc123"\n'
        '{"tool_calls": [{"id": "call_1", "function": {"name": "generate_speech", '
        '"arguments": {"text": "hello", "profile_id": "abc123"}}}]\n\n'
        'User: "Make a sound effect of rain"\n'
        '{"tool_calls": [{"id": "call_1", "function": {"name": "generate_sfx", '
        '"arguments": {"prompt": "rain falling", "duration": 5.0}}}]}'
    ),
    "voice": (
        'User: "List available voices"\n'
        '{"tool_calls": [{"id": "call_1", "function": {"name": "list_voices", '
        '"arguments": {}}}]}\n\n'
        'User: "Clone this voice using reference abc.wav"\n'
        '{"tool_calls": [{"id": "call_1", "function": {"name": "clone_voice", '
        '"arguments": {"reference_audio": "abc.wav"}}}]}'
    ),
    "editing": (
        'User: "Add reverb to the clip"\n'
        '{"tool_calls": [{"id": "call_1", "function": {"name": "apply_effects", '
        '"arguments": {"effects": [{"type": "reverb", "wet": 0.3}]}}}]}\n\n'
        'User: "Normalize to -14 LUFS"\n'
        '{"tool_calls": [{"id": "call_1", "function": {"name": "normalize_audio", '
        '"arguments": {"target_lufs": -14.0}}}]}'
    ),
    "analysis": (
        'User: "Check the loudness"\n'
        '{"tool_calls": [{"id": "call_1", "function": {"name": "measure_loudness", '
        '"arguments": {"audio_path": "output.wav"}}}]}'
    ),
    "transcription": (
        'User: "Transcribe this audio"\n'
        '{"tool_calls": [{"id": "call_1", "function": {"name": "transcribe", '
        '"arguments": {"audio_path": "recording.wav"}}}]}'
    ),
    "export": (
        'User: "Export as MP3 for Spotify"\n'
        '{"tool_calls": [{"id": "call_1", "function": {"name": "export_audio", '
        '"arguments": {"path": "output.wav", "preset": "spotify"}}}]}'
    ),
    "batch": (
        'User: "Render all lines in the script"\n'
        '{"tool_calls": [{"id": "call_1", "function": {"name": "batch_create_from_list", '
        '"arguments": {"items": [{"text": "line 1"}, {"text": "line 2"}]}}}]}'
    ),
    "studio": (
        'User: "Set master volume to 0.8"\n'
        '{"tool_calls": [{"id": "call_1", "function": {"name": "studio_set_master_volume", '
        '"arguments": {"volume": 0.8}}}]}'
    ),
    "conversation": (
        'User: "Auto-duck the music under speech"\n'
        '{"tool_calls": [{"id": "call_1", "function": {"name": "conversation_auto_duck", '
        '"arguments": {"track_roles": ["speech", "music"]}}}]}'
    ),
    "adr": (
        'User: "Upload a guide track"\n'
        '{"tool_calls": [{"id": "call_1", "function": {"name": "adr_upload_guide", '
        '"arguments": {"audio_path": "guide.wav"}}}]}'
    ),
    "dubbing": (
        'User: "Dub this video to Spanish"\n'
        '{"tool_calls": [{"id": "call_1", "function": {"name": "dub_video", '
        '"arguments": {"audio_path": "video.mp4", "target_language": "es"}}}]}'
    ),
    "workflow": (
        'User: "Run the mastering recipe"\n'
        '{"tool_calls": [{"id": "call_1", "function": {"name": "run_recipe", '
        '"arguments": {"recipe_name": "mastering"}}}]}'
    ),
    "import": (
        'User: "Import this video file"\n'
        '{"tool_calls": [{"id": "call_1", "function": {"name": "extract_audio", '
        '"arguments": {"video_path": "clip.mp4"}}}]}'
    ),
}

# Fallback examples when no category is detected
_DEFAULT_EXAMPLES = (
    'User: "Generate speech saying hello with profile abc123"\n'
    '{"tool_calls": [{"id": "call_1", "function": {"name": "generate_speech", '
    '"arguments": {"text": "hello", "profile_id": "abc123"}}}]}\n\n'
    'User: "What voices are available?"\n'
    '{"tool_calls": [{"id": "call_1", "function": {"name": "list_voices", '
    '"arguments": {}}}]}'
)

# Below this confidence the model should ask for clarification instead of guessing.
_AMBIGUITY_THRESHOLD = 0.5


def build_local_tool_prompt(
    tools: list[dict] | None = None,
    meta: dict | None = None,
) -> str:
    """Render a compact tool-call instruction block for the LOCAL GGUF planner.

    The local llama.cpp path has no native function-calling, so we embed the
    tool schemas plus an explicit JSON output format into the system prompt.
    The model is instructed to reply with a single JSON object carrying a
    ``tool_calls`` list when it wants to act, otherwise with plain text.

    When ``tools`` is provided it is treated as the *retrieved* subset (already
    relevance-ranked); the remaining catalogue tool names are appended as a
    name-only list so the planner can still name any tool. When omitted, the
    full catalogue is rendered (backward compatible).

    ``meta`` carries routing metadata (category, confidence) from the tool
    router for logging and debugging.

    Tuned for 2B-4B jackrong Qwen3.5 planner: explicit formatting, concrete
    examples, and minimal token footprint.
    """
    full = tools if tools is not None else TOOLS
    # Keep all names visible even when pruned, so execution can never be blocked
    # by a tool the router left out of the detailed section.
    remaining_names: list[str] = []
    if tools is not None:
        detailed_names = {t.get("function", {}).get("name") for t in tools}
        remaining_names = [
            t.get("function", {}).get("name") for t in TOOLS if t.get("function", {}).get("name") not in detailed_names
        ]

    # Compact form: name + one-line description only. Embedding the full JSON
    # parameter schemas for ~90 tools would blow the local model's context
    # (especially on low-RAM tiers), and a small on-device model mainly needs
    # to pick the RIGHT tool; execute_tool validates the arguments it receives.
    lines = []
    for t in full:
        fn = t.get("function", {})
        name = fn.get("name", "?")
        desc = (fn.get("description") or "").split("\n")[0].strip()
        lines.append(f"- {name}: {desc}")
    schema = "\n".join(lines)

    appendix = ""
    if remaining_names:
        joined = ", ".join(remaining_names)
        appendix = "\n\nOther available tools (name only — you may call any of them):\n" + joined + "\n"

    # --- Category-specific examples ---
    category = meta.get("category") if meta else None
    confidence = meta.get("confidence", 0.0) if meta else 0.0
    examples = _CATEGORY_EXAMPLES.get(category, _DEFAULT_EXAMPLES) if category else _DEFAULT_EXAMPLES

    category_hint = ""
    if category:
        category_hint = f"\n\nDetected task category: {category}. Focus on tools listed above.\n"

    # --- Intent confirmation for ambiguous queries ---
    ambiguity_hint = ""
    if meta and confidence < _AMBIGUITY_THRESHOLD and confidence > 0:
        ambiguity_hint = (
            "\n\nThe user's request is ambiguous. If you are not confident about "
            "which tool to use, ask a brief clarifying question instead of guessing. "
            "For example: 'I can help with that — do you mean X, Y, or Z?'\n"
        )
    elif meta and confidence is not None:
        ambiguity_hint = (
            f"\nRouting confidence: {confidence:.0%}. "
            "If the result seems wrong, you may call any tool from the full catalogue.\n"
        )

    return (
        "\n\n# Available Tools\n"
        "You have access to tools for audio production. To use a tool, respond "
        "with ONLY a JSON object (no markdown, no code fences, no extra text):\n\n"
        '{"tool_calls": [{"id": "call_1", "function": {"name": "tool_name", "arguments": {"arg": "value"}}}]}\n\n'
        "Rules:\n"
        "- Respond with ONLY the JSON object — nothing before or after it\n"
        "- Use double quotes for all strings and keys\n"
        "- No trailing commas\n"
        "- Call a tool only when you have enough information\n"
        "- For tools with no required arguments, use empty arguments: {}\n"
        "- If you don't need a tool, reply with normal text\n"
        "- If you are unsure which tool to use, ask a clarifying question\n\n"
        "Examples:\n" + examples + "\n\n"
        "Tools:\n" + schema + appendix + category_hint + ambiguity_hint
    )
