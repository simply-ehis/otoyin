"""Tool-call middleware for the local LLM model.

The 2B--4B on-device models have no native function-calling support. We embed
tool schemas in the system prompt and ask them to emit JSON, but small models
often produce malformed output. This module sits between the raw model
output and ``execute_tool`` to:

1. **Parse** — extract valid JSON tool calls from noisy output (code fences,
   trailing prose, mixed natural-language + JSON).
2. **Validate** — confirm tool names exist, required args are present, and
   arg types match the schema.
3. **Sanity-check** — reject hallucinated/out-of-range args before execution.
4. **Repair** — attempt lightweight fixes (fill missing required args with
   sensible defaults, strip trailing commas, coerce types).
5. **Retry** — when the output is unrecoverable, re-prompt the model with
   a targeted "fix your JSON" message (up to 2 retries).
6. **Fallback** — if retries exhaust, return a plain-text response explaining
   what went wrong so the user gets *something* useful.
7. **Confidence scoring** — rate tool calls by how well they match schemas
   and context, enabling the harness to reject low-confidence calls.
8. **Budget enforcement** — limit tool calls per turn for small models.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any

from .schemas import TOOLS
from .validator import find_similar_tool

logger = logging.getLogger(__name__)

# Minimum similarity ratio for a non-prefix fuzzy match. Substring containment
# alone misroutes short names (e.g. ``speak``), so only prefix matches or a
# >=0.8 edit similarity may rewrite a tool name.
FUZZY_MIN_RATIO = 0.8

# Maximum tool calls per turn for small models (2B--4B). Prevents runaway
# generation and keeps context manageable.
MAX_TOOL_CALLS_PER_TURN = 5

# Confidence threshold below which a tool call is rejected as likely hallucinated.
CONFIDENCE_THRESHOLD = 0.6

# ---------------------------------------------------------------------------
# Build lookup tables from the canonical tool schemas
# ---------------------------------------------------------------------------

_TOOL_SCHEMAS: dict[str, dict] = {}
_TOOL_REQUIRED: dict[str, list[str]] = {}
_TOOL_PROPERTIES: dict[str, dict[str, dict]] = {}
_TOOL_ARG_RANGES: dict[str, dict[str, tuple[float, float]]] = {}

for _t in TOOLS:
    _fn = _t.get("function", {})
    _name = _fn.get("name", "")
    if _name:
        _TOOL_SCHEMAS[_name] = _fn
        _params = _fn.get("parameters", {}) or {}
        _TOOL_REQUIRED[_name] = list(_params.get("required", []))
        _TOOL_PROPERTIES[_name] = _params.get("properties", {})

        # Extract numeric ranges for sanity checking
        _ranges: dict[str, tuple[float, float]] = {}
        for _prop_name, _prop_schema in _params.get("properties", {}).items():
            if _prop_schema.get("type") in ("number", "integer"):
                _min = _prop_schema.get("minimum")
                _max = _prop_schema.get("maximum")
                if _min is not None or _max is not None:
                    _ranges[_prop_name] = (
                        float(_min) if _min is not None else float("-inf"),
                        float(_max) if _max is not None else float("inf"),
                    )
        if _ranges:
            _TOOL_ARG_RANGES[_name] = _ranges

# Common typos / near-misses the model produces
_TOOL_ALIASES: dict[str, str] = {}
for _name in _TOOL_SCHEMAS:
    _words = _name.split("_")
    for _variant in (
        _name.replace("_", ""),  # generatespeech
        _name.replace("_", "-"),  # generate-speech
        _name.rstrip("s"),  # generate_spee (overgenerate)
    ):
        if _variant not in _TOOL_SCHEMAS:
            _TOOL_ALIASES[_variant] = _name


# ---------------------------------------------------------------------------
# JSON extraction helpers
# ---------------------------------------------------------------------------

_FENCE_RE = re.compile(r"```(?:json)?\s*\n?(.*?)\n?\s*```", re.DOTALL)
_TOOL_CALLS_RE = re.compile(r'"tool_calls"\s*:\s*\[', re.DOTALL)


def _strip_trailing_commas(text: str) -> str:
    """Remove trailing commas before } or ] — the most common JSON syntax error."""
    return re.sub(r",\s*([}\]])", r"\1", text)


def _extract_json_block(text: str) -> str | None:
    """Try to pull a JSON object out of noisy model output."""

    # 1. If there's a markdown code fence, extract its contents.
    fence_match = _FENCE_RE.search(text)
    if fence_match:
        candidate = fence_match.group(1).strip()
        if candidate.startswith(("{", "[")):
            return candidate

    # 2. Find the first { ... } block that contains "tool_calls".
    depth = 0
    start = None
    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start is not None:
                candidate = text[start : i + 1]
                if "tool_calls" in candidate:
                    return candidate
                start = None

    # 3. Last resort: find the first { ... } block at all.
    depth = 0
    start = None
    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start is not None:
                return text[start : i + 1]
            start = None

    return None


def _try_parse_json(text: str) -> dict | None:
    """Attempt to parse JSON with progressively lenient strategies."""
    strategies = [
        text,  # raw
        _strip_trailing_commas(text),  # fix trailing commas
        text.replace("'", '"'),  # single → double quotes
        _strip_trailing_commas(text.replace("'", '"')),
    ]
    for attempt in strategies:
        try:
            obj = json.loads(attempt)
            if isinstance(obj, dict):
                return obj
        except (json.JSONDecodeError, ValueError):
            continue
    return None


# ---------------------------------------------------------------------------
# Confidence scoring
# ---------------------------------------------------------------------------


@dataclass
class ToolCallConfidence:
    """Confidence assessment for a parsed tool call."""

    name: str
    score: float  # 0.0--1.0
    reasons: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def is_confident(self) -> bool:
        return self.score >= CONFIDENCE_THRESHOLD

    @property
    def is_low_confidence(self) -> bool:
        return self.score < 0.4


def score_tool_call(name: str, args: dict, schema: dict) -> ToolCallConfidence:
    """Score a tool call's likelihood of being correct.

    Evaluates:
    - Tool name exists in registry (strong signal)
    - All required args present
    - Arg types match schema
    - Numeric args within declared ranges
    - No unexpected/extra args (small models often hallucinate these)
    """
    reasons: list[str] = []
    warnings: list[str] = []
    score = 1.0

    # 1. Tool name validity
    if name not in _TOOL_SCHEMAS:
        score = 0.0
        reasons.append(f"Unknown tool: {name}")
        return ToolCallConfidence(name, score, reasons, warnings)

    # 2. Required args
    required = _TOOL_REQUIRED.get(name, [])
    missing = [r for r in required if r not in args or args[r] is None or args[r] == ""]
    if missing:
        score -= 0.3 * len(missing)
        reasons.append(f"Missing required args: {', '.join(missing)}")

    # 3. Type checking
    props = _TOOL_PROPERTIES.get(name, {})
    for key, value in args.items():
        if key not in props:
            # Extra args the model hallucinated
            score -= 0.15
            warnings.append(f"Unexpected arg '{key}' — not in schema")
            continue

        expected_type = props[key].get("type")
        if expected_type == "string" and not isinstance(value, str):
            score -= 0.1
            warnings.append(f"Arg '{key}' expected string, got {type(value).__name__}")
        elif expected_type in ("number", "integer") and not isinstance(value, (int, float)):
            score -= 0.15
            warnings.append(f"Arg '{key}' expected number, got {type(value).__name__}")
        elif expected_type == "boolean" and not isinstance(value, bool):
            score -= 0.1
            warnings.append(f"Arg '{key}' expected boolean, got {type(value).__name__}")
        elif expected_type == "array" and not isinstance(value, list):
            score -= 0.15
            warnings.append(f"Arg '{key}' expected array, got {type(value).__name__}")

    # 4. Numeric range validation
    ranges = _TOOL_ARG_RANGES.get(name, {})
    for key, (min_val, max_val) in ranges.items():
        if key in args and isinstance(args[key], (int, float)):
            val = float(args[key])
            if val < min_val or val > max_val:
                score -= 0.2
                warnings.append(f"Arg '{key}'={val} outside declared range [{min_val}, {max_val}]")

    # 5. Schema completeness bonus
    if not missing and not warnings:
        reasons.append("All required args present, types match, values in range")
        score = min(1.0, score + 0.1)

    # Clamp
    score = max(0.0, min(1.0, score))
    return ToolCallConfidence(name, round(score, 3), reasons, warnings)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def parse_tool_calls(raw_output: str) -> list[dict[str, Any]]:
    """Parse the raw model output into a list of tool-call dicts.

    Each returned dict has the shape:
        {"name": str, "arguments": dict, "id": str}

    Returns an empty list if the output is plain text (no tool calls).
    Raises ``ValueError`` if the output *looks* like a tool call but is
    irreparably malformed (caller should retry).
    """
    raw_output = raw_output.strip()

    # Quick check: does it even mention tool_calls?
    if '"tool_calls"' not in raw_output and "tool_calls" not in raw_output:
        return []

    # Try to extract and parse JSON
    json_block = _extract_json_block(raw_output)
    if json_block is None:
        raise ValueError("Output mentions tool_calls but no JSON could be extracted")

    parsed = _try_parse_json(json_block)
    if parsed is None:
        raise ValueError(f"JSON extracted but unparseable: {json_block[:200]}")

    raw_calls = parsed.get("tool_calls", [])
    if not isinstance(raw_calls, list):
        raise ValueError(f"tool_calls must be a list, got {type(raw_calls).__name__}")
    if not raw_calls:
        return []

    # Normalize each tool call
    result: list[dict[str, Any]] = []
    for i, tc in enumerate(raw_calls):
        fn = tc.get("function", {}) if isinstance(tc, dict) else {}
        if not isinstance(fn, dict):
            continue

        name = fn.get("name", "").strip()
        args_raw = fn.get("arguments", {})

        # Arguments might be a JSON string instead of a dict
        if isinstance(args_raw, str):
            try:
                args = json.loads(args_raw)
            except (json.JSONDecodeError, ValueError):
                args = {}
        elif isinstance(args_raw, dict):
            args = args_raw
        else:
            args = {}

        if not name:
            continue

        # Resolve aliases / typos
        resolved = _resolve_tool_name(name)
        if resolved != name:
            logger.debug("Tool alias resolved: %s -> %s", name, resolved)
            name = resolved

        if name not in _TOOL_SCHEMAS:
            logger.warning(
                "Unresolved tool name %r; raw output head: %s",
                name,
                raw_output[:200].replace("\n", " "),
            )

        tc_id = tc.get("id", "") or f"call_{i}_{name}"
        result.append({"name": name, "arguments": args, "id": tc_id})

    return result


def _resolve_tool_name(name: str) -> str:
    """Resolve a tool name through exact match, aliases, or fuzzy fallback.

    The fuzzy fallback is deliberately strict: only *prefix* matches (model
    truncated or padded the name) or a ``>=FUZZY_MIN_RATIO`` similarity may
    rewrite a name. Bare substring containment misroutes short names such
    as ``speak``.
    """
    # Exact match
    if name in _TOOL_SCHEMAS:
        return name

    # Alias match
    if name in _TOOL_ALIASES:
        return _TOOL_ALIASES[name]

    # Prefix match in either direction (strongest signal).
    prefix_candidates = [
        schema_name for schema_name in _TOOL_SCHEMAS if schema_name.startswith(name) or name.startswith(schema_name)
    ]
    if prefix_candidates:
        best = max(
            prefix_candidates,
            key=lambda s: min(len(name), len(s)) / max(len(name), len(s), 1),
        )
        logger.debug("Tool prefix-matched: %s -> %s", name, best)
        return best

    # Strict similarity only — substring containment alone is not enough.
    best_name = name
    best_ratio = 0.0
    for schema_name in _TOOL_SCHEMAS:
        ratio = SequenceMatcher(None, name, schema_name).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_name = schema_name

    if best_ratio >= FUZZY_MIN_RATIO:
        logger.debug("Tool fuzzy-matched: %s -> %s (ratio=%.2f)", name, best_name, best_ratio)
        return best_name

    return name  # return as-is; caller will get "Unknown tool"


def validate_tool_call(tc: dict[str, Any]) -> str | None:
    """Validate a parsed tool call against the schema.

    Returns an error string if invalid, or None if OK.
    """
    name = tc.get("name", "")
    args = tc.get("arguments", {})

    if len(name) > 100:
        return f"Tool name too long ({len(name)} chars): likely hallucinated"

    if name not in _TOOL_SCHEMAS:
        return f"Unknown tool: {name}"

    # Check required args
    for req in _TOOL_REQUIRED.get(name, []):
        if req not in args or args[req] is None or args[req] == "":
            similar = find_similar_tool(name)
            hint = f" Similar tools: {', '.join(similar)}" if similar else ""
            return f"Missing required argument '{req}' for tool '{name}'{hint}"

    # Type-check known argument types (with coercion)
    props = _TOOL_PROPERTIES.get(name, {})
    for key, value in args.items():
        if key in props:
            expected_type = props[key].get("type")
            if expected_type == "string" and not isinstance(value, str):
                args[key] = str(value)  # coerce
            elif expected_type == "number" and not isinstance(value, (int, float)):
                try:
                    args[key] = float(value)
                except (ValueError, TypeError):
                    return f"Argument '{key}' must be a number, got '{value}'"
            elif expected_type == "integer" and not isinstance(value, int):
                try:
                    args[key] = int(value)
                except (ValueError, TypeError):
                    return f"Argument '{key}' must be an integer, got '{value}'"
            elif expected_type == "boolean" and not isinstance(value, bool):
                if isinstance(value, str):
                    args[key] = value.lower() in ("true", "1", "yes")
            elif expected_type == "array" and not isinstance(value, list) and isinstance(value, str):
                try:
                    args[key] = json.loads(value)
                except (json.JSONDecodeError, ValueError):
                    return f"Argument '{key}' must be an array, got '{value}'"

    # Sanity check: numeric ranges
    ranges = _TOOL_ARG_RANGES.get(name, {})
    for key, (min_val, max_val) in ranges.items():
        if key in args and isinstance(args[key], (int, float)):
            val = float(args[key])
            if val < min_val or val > max_val:
                return f"Argument '{key}'={val} outside allowed range [{min_val}, {max_val}] for tool '{name}'"

    return None


def _fill_missing_defaults(tool_name: str, args: dict[str, Any]) -> dict[str, Any]:
    """Fill missing required args with safe defaults when possible.

    Returns a *new* dict — the original is not mutated.  Only fills args
    that have a schema-level ``default`` value.  If a required arg has no
    default, it remains missing and the caller will produce a specific
    retry prompt.  Empty strings are never filled — they would pass
    ``validate_tool_call`` but produce garbage output.
    """
    props = _TOOL_PROPERTIES.get(tool_name, {})
    required = _TOOL_REQUIRED.get(tool_name, [])
    filled = dict(args)
    for r in required:
        if r in filled and filled[r] is not None and filled[r] != "":
            continue
        schema = props.get(r, {})
        # Only fill if the schema declares an explicit default
        if "default" in schema:
            filled[r] = schema["default"]
    return filled


def build_retry_prompt(
    original_output: str,
    error: str,
    previous_attempts: list[str] | None = None,
) -> str:
    """Build a targeted retry prompt based on the specific validation error.

    Instead of a generic "fix your JSON", tells the model exactly what went
    wrong and how to fix it.  Critical for 2B--4B models which cannot reason
    about abstract error messages.

    ``previous_attempts`` is a list of prior error strings (most recent last).
    When present, the prompt includes a "previously tried" section so the
    model does not repeat the same mistake.
    """
    # --- Parse the error to provide specific guidance ---
    tool_name = ""
    if "for tool '" in error:
        tool_name = error.split("for tool '")[1].split("'")[0]
    elif error.startswith("Unknown tool: "):
        tool_name = error.split("Unknown tool: ")[1].strip()

    # --- Build previous-attempts section (item 5) ---
    history_block = ""
    if previous_attempts:
        lines = [f"  {i + 1}. {e}" for i, e in enumerate(previous_attempts[-3:])]
        history_block = "\n\nYou already tried and failed:\n" + "\n".join(lines) + "\nDo NOT repeat the same mistake."

    # Missing required argument
    if error.startswith("Missing required argument"):
        arg_name = error.split("'")[1] if "'" in error else "?"
        required = _TOOL_REQUIRED.get(tool_name, [])
        props = _TOOL_PROPERTIES.get(tool_name, {})
        arg_hints = []
        for r in required:
            schema = props.get(r, {})
            desc = schema.get("description", "")
            typ = schema.get("type", "string")
            hint = f'"{r}" ({typ})'
            if desc:
                hint += f" — {desc.split('.')[0]}"
            arg_hints.append(hint)
        required_block = ",\n      ".join(arg_hints)
        example_args = _example_args(tool_name)
        example_json = (
            '{"tool_calls": [{"id": "call_1", "function": {'
            f'"name": "{tool_name}", "arguments": {{{example_args}}}'
            "}}]}"
        )
        return (
            f"Your tool call to '{tool_name}' is missing the required argument '{arg_name}'.\n\n"
            f"Required arguments for {tool_name}:\n"
            f"  {{{required_block}}}\n\n"
            f"Fix: include ALL required arguments. Example:\n"
            f"{example_json}\n\n"
            "Reply with ONLY the corrected JSON object." + history_block
        )

    # Unknown tool
    if error.startswith("Unknown tool"):
        similar = find_similar_tool(tool_name) if tool_name else []
        if similar:
            options = ", ".join(similar)
            return (
                f"'{tool_name}' is not a valid tool name.\n\n"
                f"Did you mean one of: {options}?\n\n"
                "Check the tool list in your system prompt and retry with the exact name." + history_block
            )
        return (
            f"'{tool_name}' is not a valid tool name.\n\n"
            "Check the tool list in your system prompt and retry with an exact name." + history_block
        )

    # Out-of-range value
    if "outside allowed range" in error:
        return f"{error}\n\nFix the value to be within the allowed range and retry." + history_block

    # Type mismatch
    if "must be a" in error:
        return f"{error}\n\nFix the argument type and retry." + history_block

    # Generic fallback — but still include the error
    return (
        f"Your tool call had an error: {error}\n\n"
        "Available tools: " + ", ".join(sorted(_TOOL_SCHEMAS.keys())) + "\n\n"
        "Please respond with ONLY a valid JSON object:\n"
        '{"tool_calls": [{"id": "call_1", "function": {"name": "<tool_name>", "arguments": {<args>}}}]}\n'
        "Or reply with plain text if you don't need to call a tool." + history_block
    )


def _example_args(tool_name: str) -> str:
    """Build a minimal valid example arguments string for a tool."""
    props = _TOOL_PROPERTIES.get(tool_name, {})
    required = _TOOL_REQUIRED.get(tool_name, [])
    parts = []
    for r in required:
        schema = props.get(r, {})
        typ = schema.get("type", "string")
        if typ == "string":
            parts.append(f'"{r}": "..."')
        elif typ in ("number", "integer"):
            default = schema.get("default", 0)
            parts.append(f'"{r}": {default}')
        elif typ == "boolean":
            parts.append(f'"{r}": true')
        elif typ == "array":
            parts.append(f'"{r}": []')
        else:
            parts.append(f'"{r}": null')
    return ", ".join(parts) if parts else "{}"


def build_no_tool_response(error: str) -> str:
    """Build a user-facing response when tool calling fails after retries."""
    return (
        "I had trouble generating a valid tool call. "
        f"Technical details: {error}\n\n"
        "Please try rephrasing your request, or describe what you'd like me to do "
        "and I'll guide you through the available options."
    )


def filter_low_confidence_calls(
    tool_calls: list[dict[str, Any]],
    min_confidence: float = CONFIDENCE_THRESHOLD,
) -> tuple[list[dict[str, Any]], list[ToolCallConfidence]]:
    """Filter tool calls by confidence score.

    Returns ``(accepted, rejected)`` where rejected calls have confidence
    below the threshold. Rejected calls are logged but not executed.
    """
    accepted: list[dict[str, Any]] = []
    rejected: list[ToolCallConfidence] = []

    for tc in tool_calls:
        name = tc.get("name", "")
        args = tc.get("arguments", {})
        schema = _TOOL_SCHEMAS.get(name, {})
        confidence = score_tool_call(name, args, schema)

        if confidence.is_confident:
            accepted.append(tc)
        else:
            rejected.append(confidence)
            logger.warning(
                "Rejected low-confidence tool call: %s (score=%.2f, warnings=%s)",
                name,
                confidence.score,
                confidence.warnings,
            )

    return accepted, rejected


def enforce_tool_call_budget(
    tool_calls: list[dict[str, Any]],
    max_calls: int = MAX_TOOL_CALLS_PER_TURN,
) -> list[dict[str, Any]]:
    """Enforce per-turn tool call budget.

    For small models, limit the number of tool calls per turn to prevent
    context explosion and hallucination cascades. Returns the truncated list.
    """
    if len(tool_calls) > max_calls:
        logger.warning("Truncating tool calls from %d to %d (budget limit)", len(tool_calls), max_calls)
        return tool_calls[:max_calls]
    return tool_calls
