"""SSE event formatting and tool error formatting.

Extracted from execution.py for reuse across assistant and MCP layers.
"""

from __future__ import annotations

import contextlib
import json
from typing import Any

from .validator import find_similar_tool


def sse_event(event_type: str, content: str, **extra: Any) -> str:
    """Format an SSE data line."""
    payload = {"type": event_type, "content": content}
    payload.update(extra)
    return f"data: {json.dumps(payload)}\n\n"


def format_tool_error(tool_name: str, error: str, args: dict) -> str:
    """Format a tool error with context and suggestions."""
    similar = find_similar_tool(tool_name)
    hint = f" Did you mean: {', '.join(similar)}?" if similar else ""
    arg_hint = ""
    if args:
        arg_hint = f" Args provided: {', '.join(str(k) for k in args)}."
    return f"Tool '{tool_name}' failed: {error}.{arg_hint}{hint}"


def build_structured_result(
    tool_name: str,
    result: str,
    args: dict[str, Any] | None = None,
    *,
    fallback: str | None = None,
) -> dict[str, Any]:
    """Build a structured result object for agent consumption (item 8).

    Agents need to branch programmatically on tool outcomes.  This builds
    a JSON-serialisable dict that sits alongside the free-text ``tool_result``
    in the SSE event.  The ``structured`` field is consumed by MCP clients
    and programmatic callers; the ``content`` field stays human-readable.
    """
    is_error = isinstance(result, str) and (result.startswith("Error") or "failed" in result.lower())
    parsed = None
    if not is_error and isinstance(result, str):
        with contextlib.suppress(json.JSONDecodeError, ValueError):
            parsed = json.loads(result)

    out: dict[str, Any] = {
        "status": "error" if is_error else "success",
        "tool": tool_name,
    }
    if parsed is not None:
        out["result"] = parsed
    elif is_error:
        out["error"] = result
    else:
        out["result"] = result
    if args:
        out["args"] = args
    if fallback:
        out["fallback"] = fallback
    return out


# ---------------------------------------------------------------------------
# Tool fallback chain (item 9)
# ---------------------------------------------------------------------------

# Maps tool names to (fallback_tool, reason_template) tuples.
# When a primary tool fails, the fallback suggestion is included in the
# structured output so agents can retry with an alternative.
TOOL_FALLBACKS: dict[str, list[tuple[str, str]]] = {
    "generate_speech": [
        ("speak", "Try 21labs.speak with a different engine"),
    ],
    "speak": [
        ("generate_speech", "Try 21labs.generate_speech with a different engine"),
    ],
    "master_track": [
        ("normalize_audio", "Try 21labs.normalize_audio for loudness-only mastering"),
        ("apply_effects", "Try 21labs.apply_effects for manual mastering chain"),
    ],
    "normalize_audio": [
        ("master_track", "Try 21labs.master_track for full mastering chain"),
    ],
    "apply_effects": [
        ("master_track", "Try 21labs.master_track for automated mastering"),
    ],
    "transcribe": [
        ("extract_audio", "Try 21labs.extract_audio to extract audio first"),
    ],
    "extract_audio": [
        ("transcribe", "Try 21labs.transcribe if audio is already available"),
    ],
    "list_profiles": [
        ("list_voices", "Try 21labs.list_voices for alternative voice listing"),
    ],
    "list_voices": [
        ("list_profiles", "Try 21labs.list_profiles for alternative profile listing"),
    ],
    "noise_reduce": [
        ("apply_effects", "Try 21labs.apply_effects with a noise gate or highpass filter"),
    ],
    "compress_audio": [
        ("apply_effects", "Try 21labs.apply_effects for manual compression"),
    ],
    "silence_removal": [
        ("trim_silence", "Try 21labs.trim_silence for edge silence"),
    ],
    "trim_silence": [
        ("silence_removal", "Try 21labs.silence_removal for internal silence"),
    ],
    "fade_in": [
        ("apply_effects", "Try 21labs.apply_effects with a fade envelope"),
    ],
    "fade_out": [
        ("apply_effects", "Try 21labs.apply_effects with a fade envelope"),
    ],
    "read_pdf": [
        ("read_file", "Try 21labs.read_file for plain text files"),
    ],
    "read_epub": [
        ("read_file", "Try 21labs.read_file for plain text files"),
    ],
    "dsp_synth": [
        ("generate_sfx", "Try 21labs.generate_sfx for AI-generated sounds"),
    ],
    "dsp_effect": [
        ("apply_effects", "Try 21labs.apply_effects for standard audio effects"),
    ],
}


def suggest_fallback(tool_name: str, error: str) -> str | None:
    """Suggest a fallback tool when the primary fails (item 9).

    Returns a human-readable suggestion string, or None if no fallback
    is known for this tool/error combination.
    """
    fallbacks = TOOL_FALLBACKS.get(tool_name)
    if not fallbacks:
        return None
    # Return the first fallback — a more sophisticated version could match
    # on error type (e.g. "missing engine" → suggest different engine)
    _fb_tool, fb_reason = fallbacks[0]
    return fb_reason
