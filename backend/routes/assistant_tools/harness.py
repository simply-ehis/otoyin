"""Small-model harness — session memory, context pressure, adaptive steering.

Provides execution plan preview, budget tracking, audit trail, result quality
scoring, file handling (compaction + type filtering + transcription), and
session-level intelligence for small on-device models (2B--4B).

Key capabilities for tiny models:
- Session memory: track what worked/failed, prevent repetition
- Context pressure: monitor token usage, trigger compaction
- Adaptive steering: inject "avoid this" hints after failures
- Loop detection: break same-tool-same-args repetition
- Response compaction: extract essentials from tool responses
"""

from __future__ import annotations

import hashlib
import json
import logging
import mimetypes
import re
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SUPPORTED_EXTENSIONS = {".md", ".txt", ".pdf", ".epub"}
SUPPORTED_MIME_TYPES = {
    "text/markdown",
    "text/plain",
    "application/pdf",
    "application/epub+zip",
    "application/octet-stream",
}
MAX_FILE_SIZE = 10 * 1024 * 1024

# Absolute ceiling for compacted tokens (used when n_ctx is unknown)
_ABSOLUTE_MAX_TOKENS = 8000

# Small-model thresholds
_FAILURE_STEER_THRESHOLD = 2  # failures before marking tool as "avoid"
_LOOP_DETECTION_WINDOW = 3  # consecutive same-tool calls to trigger loop break

# Confidence decay
_CONFIDENCE_INITIAL = 1.0  # starting confidence for every tool
_CONFIDENCE_FAIL_PENALTY = 0.25  # penalty per failure (minimum confidence = 0.05)
_CONFIDENCE_SUCCESS_BOOST = 0.10  # boost per success (capped at 1.0)
_CONFIDENCE_MIN = 0.05  # floor so tool is never fully invisible
_CONFIDENCE_RECOVERY_RATE = 0.02  # per-call recovery toward baseline when no failures
_NEAR_LOOP_THRESHOLD = 0.9  # args similarity threshold for near-loop detection
_OSCILLATION_WINDOW = 4  # window size for A-B-A-B oscillation detection
_CONTEXT_PRESSURE_WARN = 0.75  # warn when context is 75% full
_CONTEXT_PRESSURE_CRITICAL = 0.9  # trigger aggressive compaction at 90%
_RECENT_HISTORY_SIZE = 10  # last N tool calls for loop detection
_MAX_STEERING_HINTS = 5  # cap hints to avoid prompt bloat


# ---------------------------------------------------------------------------
# Enums and data classes
# ---------------------------------------------------------------------------


class ExecutionStatus(Enum):
    PLANNED = "planned"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass
class FileInput:
    """Represents a file input to the assistant."""

    path: str
    filename: str
    extension: str
    mime_type: str
    size_bytes: int
    content: str = ""
    compacted: bool = False
    truncated: bool = False
    error: str | None = None

    @property
    def is_supported(self) -> bool:
        return self.extension.lower() in SUPPORTED_EXTENSIONS

    @property
    def is_text_based(self) -> bool:
        return self.extension.lower() in {".md", ".txt"}

    @property
    def needs_transcription(self) -> bool:
        return self.extension.lower() in {".pdf", ".epub"}


@dataclass
class ExecutionRecord:
    """Audit trail entry for a single tool execution."""

    timestamp: str
    tool_name: str
    arguments: dict
    status: ExecutionStatus
    result: str | None = None
    error: str | None = None
    duration_ms: float = 0.0
    confidence: float | None = None
    retry_count: int = 0


@dataclass
class HarnessState:
    """Complete harness state for a conversation session.

    Tracks session-level intelligence for small models: tool success/failure
    stats, recent call history for loop detection, context pressure, and
    dynamic steering hints injected into the system prompt.
    """

    session_id: str
    started_at: str
    total_tool_calls: int = 0
    successful_calls: int = 0
    failed_calls: int = 0
    total_duration_ms: float = 0.0
    budget_remaining: int = 100
    execution_history: list[ExecutionRecord] = field(default_factory=list)
    file_inputs: list[FileInput] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    # --- Small-model session memory ---
    tool_failure_counts: dict[str, int] = field(default_factory=dict)
    tool_success_counts: dict[str, int] = field(default_factory=dict)
    tool_confidence: dict[str, float] = field(default_factory=dict)  # per-tool confidence (0.05-1.0)
    recent_tool_calls: list[tuple[str, str]] = field(default_factory=list)  # (tool_name, args_hash)
    avoided_tools: set[str] = field(default_factory=set)
    steering_hints: list[str] = field(default_factory=list)
    context_pressure: float = 0.0
    n_ctx: int = 0

    def record_execution(self, record: ExecutionRecord) -> None:
        """Record a tool execution and update session intelligence."""
        self.execution_history.append(record)
        self.total_tool_calls += 1
        self.total_duration_ms += record.duration_ms
        self.budget_remaining -= 1

        tool = record.tool_name
        if record.status == ExecutionStatus.COMPLETED:
            self.successful_calls += 1
            self.tool_success_counts[tool] = self.tool_success_counts.get(tool, 0) + 1
            # Boost confidence on success
            current = self.tool_confidence.get(tool, _CONFIDENCE_INITIAL)
            self.tool_confidence[tool] = min(1.0, current + _CONFIDENCE_SUCCESS_BOOST)
        elif record.status == ExecutionStatus.FAILED:
            self.failed_calls += 1
            self.tool_failure_counts[tool] = self.tool_failure_counts.get(tool, 0) + 1
            # Decay confidence on failure
            current = self.tool_confidence.get(tool, _CONFIDENCE_INITIAL)
            self.tool_confidence[tool] = max(_CONFIDENCE_MIN, current - _CONFIDENCE_FAIL_PENALTY)

        # Track recent calls for loop detection (tool name + args fingerprint)
        args_hash = _fingerprint_args(record.arguments)
        self.recent_tool_calls.append((tool, args_hash))
        if len(self.recent_tool_calls) > _RECENT_HISTORY_SIZE:
            self.recent_tool_calls = self.recent_tool_calls[-_RECENT_HISTORY_SIZE:]

        # Update steering hints
        self._update_steering_hints()

    def _update_steering_hints(self) -> None:
        """Regenerate steering hints from current session state."""
        hints: list[str] = []

        # Tools that failed too many times
        for tool, count in sorted(self.tool_failure_counts.items(), key=lambda x: -x[1]):
            if count >= _FAILURE_STEER_THRESHOLD:
                self.avoided_tools.add(tool)
                success = self.tool_success_counts.get(tool, 0)
                hints.append(
                    f"Do NOT use {tool} — it failed {count} time(s) ({success} success, {count} failures this session)."
                )

        # Confidence-based demotion hints (tools below 50% confidence)
        low_confidence = [
            (tool, conf)
            for tool, conf in sorted(self.tool_confidence.items(), key=lambda x: x[1])
            if conf < 0.5 and tool not in self.avoided_tools
        ]
        if low_confidence:
            names = ", ".join(f"{t} ({c:.0%})" for t, c in low_confidence[:3])
            hints.append(f"Low-confidence tools: {names}. Prefer other tools or change your approach.")

        # Loop detection (argument-aware)
        loop_info = detect_failure_loop(self.recent_tool_calls)
        if loop_info:
            loop_type = loop_info["type"]
            tool = loop_info["tool"]
            if loop_type == "exact":
                hints.append(
                    f"Loop detected: {tool} called {loop_info['count']}x with identical arguments. "
                    f"Change the parameters or use a different tool."
                )
            elif loop_type == "near":
                hints.append(
                    f"Near-loop detected: {tool} called {loop_info['count']}x with nearly identical "
                    f"arguments (args similarity ≥{_NEAR_LOOP_THRESHOLD:.0%}). Try a larger parameter "
                    f"change or a different approach."
                )
            elif loop_type == "oscillation":
                hints.append(
                    f"Oscillation detected: alternating between {loop_info['tools'][0]} and "
                    f"{loop_info['tools'][1]}. Pick one approach and stick with it, or try "
                    f"something entirely new."
                )
            elif loop_type == "degenerate":
                hints.append(
                    f"Degenerate loop: {tool} called {loop_info['count']}x with empty or trivially "
                    f"different arguments. Add meaningful parameters or use a different tool."
                )

        # Context pressure
        if self.context_pressure >= _CONTEXT_PRESSURE_CRITICAL:
            hints.append("Context is nearly full. Give a concise final answer now — do not call more tools.")
        elif self.context_pressure >= _CONTEXT_PRESSURE_WARN:
            hints.append("Context is getting full. Minimize tool calls and wrap up soon.")

        self.steering_hints = hints[:_MAX_STEERING_HINTS]

    def update_context_pressure(self, estimated_tokens: int, n_ctx: int) -> None:
        """Update context pressure estimate (0.0 to 1.0)."""
        self.n_ctx = n_ctx
        if n_ctx > 0:
            self.context_pressure = min(1.0, estimated_tokens / n_ctx)
        self._update_steering_hints()

    def get_steering_prompt(self) -> str:
        """Get steering hints to inject into the system prompt.

        Returns empty string when no hints are active.
        """
        if not self.steering_hints:
            return ""
        return "\n\n# Session Guidance\n" + "\n".join(f"- {h}" for h in self.steering_hints)

    def get_avoided_tools_prompt(self) -> str:
        """List tools the model should avoid in this session."""
        if not self.avoided_tools:
            return ""
        names = ", ".join(sorted(self.avoided_tools))
        return f"\n\nAvoid these tools (they failed this session): {names}"

    def get_tool_confidence(self, tool_name: str) -> float:
        """Return the confidence score (0.05--1.0) for a specific tool."""
        return self.tool_confidence.get(tool_name, _CONFIDENCE_INITIAL)

    def get_all_confidence(self) -> dict[str, float]:
        """Return confidence scores for all tools that have been called."""
        return dict(self.tool_confidence)

    @property
    def success_rate(self) -> float:
        if self.total_tool_calls == 0:
            return 1.0
        return self.successful_calls / self.total_tool_calls

    @property
    def is_budget_exhausted(self) -> bool:
        return self.budget_remaining <= 0

    @property
    def is_context_critical(self) -> bool:
        return self.context_pressure >= _CONTEXT_PRESSURE_CRITICAL

    @property
    def is_context_warned(self) -> bool:
        return self.context_pressure >= _CONTEXT_PRESSURE_WARN

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "started_at": self.started_at,
            "total_tool_calls": self.total_tool_calls,
            "successful_calls": self.successful_calls,
            "failed_calls": self.failed_calls,
            "success_rate": round(self.success_rate, 3),
            "total_duration_ms": self.total_duration_ms,
            "budget_remaining": self.budget_remaining,
            "context_pressure": round(self.context_pressure, 3),
            "avoided_tools": sorted(self.avoided_tools),
            "tool_confidence": {k: round(v, 3) for k, v in self.tool_confidence.items()},
            "steering_hints": self.steering_hints,
            "execution_history": [
                {
                    "timestamp": r.timestamp,
                    "tool_name": r.tool_name,
                    "arguments": r.arguments,
                    "status": r.status.value,
                    "result_preview": r.result[:200] if r.result else None,
                    "error": r.error,
                    "duration_ms": r.duration_ms,
                    "confidence": r.confidence,
                    "retry_count": r.retry_count,
                }
                for r in self.execution_history
            ],
            "file_inputs": [
                {
                    "filename": f.filename,
                    "extension": f.extension,
                    "size_bytes": f.size_bytes,
                    "compacted": f.compacted,
                    "truncated": f.truncated,
                    "error": f.error,
                }
                for f in self.file_inputs
            ],
            "warnings": self.warnings,
        }


# ---------------------------------------------------------------------------
# Session factory
# ---------------------------------------------------------------------------


def create_harness_session(
    session_id: str | None = None,
    budget: int | None = None,
    n_ctx: int | None = None,
) -> HarnessState:
    """Create a new harness session with a fresh budget.

    ``budget`` caps tool calls per session.  When omitted, defaults to 100.
    The caller should derive a tighter budget from n_ctx for small models:
    ``min(100, max(5, n_ctx // 500))``.

    ``n_ctx`` sets the context window size for pressure monitoring.
    """
    if session_id is None:
        session_id = hashlib.md5(str(time.time()).encode()).hexdigest()[:12]

    if budget is None:
        if n_ctx is not None:
            budget = min(100, max(5, n_ctx // 500))
        else:
            budget = 100

    return HarnessState(
        session_id=session_id,
        # Zulu UTC: matches the E2E report format and sorts lexicographically.
        started_at=datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        budget_remaining=budget,
        n_ctx=n_ctx or 0,
    )


# ---------------------------------------------------------------------------
# Loop detection
# ---------------------------------------------------------------------------


def _fingerprint_args(arguments: dict) -> str:
    """Create a compact fingerprint of tool arguments for loop detection.

    Normalizes numeric values (rounds to 4 decimals) and sorts keys so that
    trivially different args produce the same fingerprint.
    """
    if not arguments:
        return "{}"
    normalized = {}
    for k, v in sorted(arguments.items()):
        if isinstance(v, (int, float)):
            normalized[k] = round(float(v), 4)
        elif isinstance(v, str):
            normalized[k] = v.strip().lower()
        elif isinstance(v, bool):
            normalized[k] = v
        elif isinstance(v, (list, tuple)):
            normalized[k] = [round(x, 4) if isinstance(x, (int, float)) else x for x in v]
        else:
            normalized[k] = v
    return json.dumps(normalized, sort_keys=True, default=str)


def _args_similarity(a1: str, a2: str) -> float:
    """Compute similarity between two argument fingerprints.

    Compares key sets (structural match) and numeric value closeness.
    Returns 1.0 if identical, 0.0 if completely disjoint.
    """
    if a1 == a2:
        return 1.0
    # Parse the JSON fingerprints
    try:
        d1 = json.loads(a1) if a1 and a1 != "{}" else {}
        d2 = json.loads(a2) if a2 and a2 != "{}" else {}
    except (json.JSONDecodeError, TypeError):
        return 0.0

    if not d1 and not d2:
        return 1.0
    if not d1 or not d2:
        return 0.0

    # Key overlap (structural similarity)
    keys1 = set(d1.keys())
    keys2 = set(d2.keys())
    if not keys1 or not keys2:
        return 0.0
    key_overlap = len(keys1 & keys2) / len(keys1 | keys2)

    # Numeric value closeness for shared keys
    shared_keys = keys1 & keys2
    if not shared_keys:
        return key_overlap * 0.5  # penalize: keys exist but none overlap

    closeness_scores = []
    for k in shared_keys:
        v1, v2 = d1[k], d2[k]
        if type(v1) is not type(v2):
            closeness_scores.append(0.0)
        elif isinstance(v1, (int, float)) and isinstance(v2, (int, float)):
            # Normalized difference: 0 = identical, 1 = very different
            max_val = max(abs(v1), abs(v2), 1.0)
            closeness_scores.append(1.0 - min(abs(v1 - v2) / max_val, 1.0))
        else:
            closeness_scores.append(1.0 if v1 == v2 else 0.0)

    value_sim = sum(closeness_scores) / len(closeness_scores) if closeness_scores else 0.0

    # Weighted combination: 40% structural + 60% value closeness
    return key_overlap * 0.4 + value_sim * 0.6


def detect_failure_loop(
    recent_calls: list[tuple[str, str]],
    window: int = _LOOP_DETECTION_WINDOW,
) -> dict | None:
    """Detect multiple types of tool-calling loops.

    Args:
        recent_calls: List of (tool_name, args_fingerprint) tuples.
        window: Consecutive-call window for strict loop detection.

    Returns a dict with loop info if detected, None otherwise:
        {"type": "exact"|"near"|"oscillation"|"degenerate",
         "tool": str, "count": int, "tools": [str, str]}
    """
    if len(recent_calls) < window:
        return None

    names = [c[0] for c in recent_calls]
    hashes = [c[1] for c in recent_calls]
    last_n_names = names[-window:]
    last_n_hashes = hashes[-window:]

    # 1. Exact loop: same tool + same args N times
    if len(set(last_n_names)) == 1:
        tool = last_n_names[0]
        if len(set(last_n_hashes)) == 1:
            # All args identical — strictest loop
            return {"type": "exact", "tool": tool, "count": window}

        # Same tool, varying args — check for degenerate (all empty/same)
        all_empty = all(h in ("{}", '{""}') for h in last_n_hashes)
        if all_empty:
            return {"type": "degenerate", "tool": tool, "count": window}

        # Check for near-loop: average pairwise args similarity ≥ threshold
        unique_hashes = list(dict.fromkeys(last_n_hashes))  # dedupe preserving order
        if len(unique_hashes) >= 2:
            # Compare each unique hash against the first one
            avg_sim = sum(_args_similarity(unique_hashes[0], h) for h in unique_hashes[1:]) / max(
                len(unique_hashes) - 1, 1
            )
            if avg_sim >= _NEAR_LOOP_THRESHOLD:
                return {"type": "near", "tool": tool, "count": window}

    # 2. Oscillation: A-B-A-B pattern (check last 4 calls)
    osc_window = min(_OSCILLATION_WINDOW, len(recent_calls))
    if osc_window >= 4:
        last_4 = recent_calls[-osc_window:]
        names_4 = [c[0] for c in last_4]
        # Check for alternating pattern
        unique_names = list(dict.fromkeys(names_4))
        if len(unique_names) == 2:
            pattern = [names_4[i] for i in range(0, len(names_4), 2)]
            alt_pattern = [names_4[i] for i in range(1, len(names_4), 2)]
            if len(set(pattern)) == 1 and len(set(alt_pattern)) == 1 and pattern[0] != alt_pattern[0]:
                return {
                    "type": "oscillation",
                    "tool": names_4[0],
                    "count": osc_window,
                    "tools": [unique_names[0], unique_names[1]],
                }

    return None


# ---------------------------------------------------------------------------
# Context pressure estimation
# ---------------------------------------------------------------------------


def estimate_tokens(text: str) -> int:
    """Rough token estimate (~4 chars per token for English)."""
    return max(1, len(text) // 4)


def estimate_messages_tokens(messages: list[dict]) -> int:
    """Estimate total token count for a message list."""
    total = 0
    for msg in messages:
        content = msg.get("content", "")
        if content:
            total += estimate_tokens(content)
        # Tool calls add overhead
        if "tool_calls" in msg:
            total += estimate_tokens(json.dumps(msg["tool_calls"]))
    return total


# ---------------------------------------------------------------------------
# Smart response compaction
# ---------------------------------------------------------------------------


def compact_tool_response(
    tool_name: str,
    response: str,
    max_tokens: int = 500,
) -> tuple[str, bool]:
    """Compact a tool response to essential information.

    Different strategies per tool type:
    - JSON responses: extract key fields, drop verbose metadata
    - List responses: summarize count + first few items
    - Error responses: preserve the error message
    - Audio file responses: keep path + metadata only

    Returns (compacted_response, was_compacted).
    """
    if not response:
        return response, False

    estimated = estimate_tokens(response)
    if estimated <= max_tokens:
        return response, False

    # Error responses — always keep full
    if response.startswith(("Error", "Tool execution failed")):
        return response, False

    # Try JSON extraction
    try:
        data = json.loads(response)
        compacted = _compact_json_response(tool_name, data, max_tokens)
        if compacted != response:
            return compacted, True
    except (json.JSONDecodeError, TypeError):
        pass

    # List-like responses — summarize
    if response.startswith(("[", "List of", "Available")):
        lines = response.split("\n")
        if len(lines) > 20:
            summary = "\n".join(lines[:10]) + f"\n\n[... {len(lines) - 10} more items ...]"
            return summary, True

    # Generic truncation as fallback
    max_chars = max_tokens * 4
    if len(response) > max_chars:
        return response[:max_chars] + "\n[... truncated ...]", True

    return response, False


def _compact_json_response(tool_name: str, data: Any, max_tokens: int) -> str:
    """Extract essential info from a JSON tool response."""
    if isinstance(data, dict):
        # Audio file responses — keep path + key metadata
        if "audio_file" in data or "file_path" in data:
            essential = {}
            for key in ("audio_file", "file_path", "duration", "sample_rate", "format", "size_bytes"):
                if key in data:
                    essential[key] = data[key]
            if "effects_applied" in data:
                essential["effects_applied"] = data["effects_applied"]
            compacted = json.dumps(essential, indent=None)
            if estimate_tokens(compacted) <= max_tokens:
                return compacted

        # Profile/voice responses — keep names and IDs
        if "profiles" in data or "voices" in data or "items" in data:
            list_key = next((k for k in ("profiles", "voices", "items") if k in data), None)
            if list_key and isinstance(data[list_key], list):
                items = data[list_key]
                compacted_items = []
                for item in items[:10]:
                    if isinstance(item, dict):
                        compacted_items.append(
                            {k: item[k] for k in ("id", "name", "type", "language", "status") if k in item}
                        )
                    else:
                        compacted_items.append(str(item)[:100])
                data[list_key] = compacted_items
                if len(items) > 10:
                    data[f"{list_key}_count"] = len(items)
                compacted = json.dumps(data, indent=None)
                if estimate_tokens(compacted) <= max_tokens:
                    return compacted

        # Loudness/analysis responses — keep numbers
        if any(k in data for k in ("lufs", "loudness", "peak", "rms", "pitch")):
            essential = {k: v for k, v in data.items() if isinstance(v, (int, float, str))}
            compacted = json.dumps(essential, indent=None)
            if estimate_tokens(compacted) <= max_tokens:
                return compacted

    # List responses
    if isinstance(data, list) and len(data) > 10:
        compacted = json.dumps(data[:10]) + f" [+{len(data) - 10} more]"
        if estimate_tokens(compacted) <= max_tokens:
            return compacted

    # Fallback: full JSON
    return json.dumps(data, indent=None)


# ---------------------------------------------------------------------------
# File handling: compaction, type filtering, transcription
# ---------------------------------------------------------------------------


def validate_file_input(file_path: str | Path) -> FileInput:
    """Validate a file input, check type and size limits."""
    path = Path(file_path)
    stat = path.stat()
    extension = path.suffix.lower()
    mime_type, _ = mimetypes.guess_type(str(path))

    file_input = FileInput(
        path=str(path),
        filename=path.name,
        extension=extension,
        mime_type=mime_type or "application/octet-stream",
        size_bytes=stat.st_size,
    )

    if not file_input.is_supported:
        file_input.error = f"Unsupported file type: {extension}. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}"
        logger.warning("Rejected file: %s (%s)", path.name, file_input.error)
        return file_input

    if stat.st_size > MAX_FILE_SIZE:
        file_input.error = f"File too large: {stat.st_size} bytes (max {MAX_FILE_SIZE})"
        logger.warning("Rejected file: %s (%s)", path.name, file_input.error)
        return file_input

    return file_input


def read_text_file(path: Path) -> str:
    """Read a text file with encoding fallback."""
    for encoding in ("utf-8", "latin-1", "cp1252"):
        try:
            return path.read_text(encoding=encoding)
        except UnicodeDecodeError:
            continue
    return path.read_bytes().decode("utf-8", errors="replace")


def compact_text(
    content: str,
    max_tokens: int | None = None,
    n_ctx: int | None = None,
) -> tuple[str, bool]:
    """Compact text content by removing excessive whitespace and truncating.

    When ``n_ctx`` is provided, the token budget is derived as
    ``min(_ABSOLUTE_MAX_TOKENS, n_ctx // 4)`` — file content should never
    exceed a quarter of the context window.  ``max_tokens`` overrides this
    when given.

    Returns (compacted_content, was_truncated).
    """
    if max_tokens is None:
        if n_ctx is not None:
            max_tokens = min(_ABSOLUTE_MAX_TOKENS, max(512, n_ctx // 4))
        else:
            max_tokens = _ABSOLUTE_MAX_TOKENS

    content = re.sub(r"\n{3,}", "\n\n", content)
    content = re.sub(r"[ \t]+\n", "\n", content)

    estimated_tokens = len(content) // 4
    if estimated_tokens <= max_tokens:
        return content, False

    max_chars = max_tokens * 4
    keep_start = int(max_chars * 0.7)
    keep_end = max_chars - keep_start

    start_part = content[:keep_start]
    end_part = content[-keep_end:] if keep_end > 0 else ""
    return start_part + "\n\n[... content truncated ...]\n\n" + end_part, True


def transcribe_pdf(path: Path) -> str:
    """Extract text from a PDF file."""
    text_parts: list[str] = []

    try:
        import fitz  # type: ignore

        doc = fitz.open(str(path))
        for page_num in range(len(doc)):
            page = doc[page_num]
            text_parts.append(page.get_text())
        doc.close()
        return "\n\n".join(text_parts)
    except ImportError:
        pass
    except Exception as e:
        logger.warning("PyMuPDF failed for %s: %s", path, e)

    try:
        import pdfplumber  # type: ignore

        with pdfplumber.open(str(path)) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    text_parts.append(text)
        return "\n\n".join(text_parts)
    except ImportError:
        pass
    except Exception as e:
        logger.warning("pdfplumber failed for %s: %s", path, e)

    raise RuntimeError("PDF transcription requires PyMuPDF or pdfplumber. Install with: pip install pymupdf")


def transcribe_epub(path: Path) -> str:
    """Extract text from an EPUB file."""
    try:
        import ebooklib  # type: ignore
        from bs4 import BeautifulSoup  # type: ignore
        from ebooklib import epub  # type: ignore
    except ImportError as err:
        raise RuntimeError(
            "EPUB transcription requires ebooklib and beautifulsoup4. Install with: pip install ebooklib beautifulsoup4"
        ) from err

    book = epub.read_epub(str(path))
    text_parts: list[str] = []

    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        soup = BeautifulSoup(item.get_content(), "html.parser")
        text = soup.get_text(separator="\n", strip=True)
        if text:
            text_parts.append(text)

    return "\n\n".join(text_parts)


def process_file_input(file_path: str | Path, n_ctx: int | None = None) -> FileInput:
    """Process a file input: validate, read, compact, transcribe if needed."""
    file_input = validate_file_input(file_path)
    if file_input.error:
        return file_input

    path = Path(file_path)

    try:
        if file_input.is_text_based:
            content = read_text_file(path)
        elif file_input.extension.lower() == ".pdf":
            content = transcribe_pdf(path)
        elif file_input.extension.lower() == ".epub":
            content = transcribe_epub(path)
        else:
            file_input.error = f"Unhandled file type: {file_input.extension}"
            return file_input

        compacted_content, was_truncated = compact_text(content, n_ctx=n_ctx)
        file_input.content = compacted_content
        file_input.compacted = True
        file_input.truncated = was_truncated

        logger.info(
            "Processed file: %s (%d chars, compacted=%s, truncated=%s)",
            path.name,
            len(content),
            file_input.compacted,
            file_input.truncated,
        )

    except Exception as e:
        file_input.error = f"Failed to process file: {e}"
        logger.exception("File processing failed for %s", path)

    return file_input


def process_multiple_files(
    file_paths: list[str | Path],
    n_ctx: int | None = None,
) -> list[FileInput]:
    """Process multiple file inputs, returning only successfully processed ones."""
    results: list[FileInput] = []
    for fp in file_paths:
        file_input = process_file_input(fp, n_ctx=n_ctx)
        if file_input.error:
            logger.warning("Skipping file %s: %s", fp, file_input.error)
        else:
            results.append(file_input)
    return results


# ---------------------------------------------------------------------------
# Harness execution helpers
# ---------------------------------------------------------------------------


def build_execution_plan_preview(
    query: str,
    task_orchestrator_result: Any,
) -> str:
    """Build a human-readable execution plan preview for the model/user."""
    from .task_orchestrator import format_execution_plan

    return format_execution_plan(task_orchestrator_result)


def validate_result_quality(
    tool_name: str,
    result: str,
    expected_type: str | None = None,
) -> tuple[bool, list[str]]:
    """Validate result quality after tool execution.

    Returns (is_valid, issues). Issues is a list of quality concerns.
    """
    issues: list[str] = []

    if not result or result.strip() == "":
        issues.append("Empty result returned")
        return False, issues

    if result.startswith(("Error ", "Tool execution")):
        issues.append("Result indicates execution error")
        return False, issues

    if expected_type == "json":
        try:
            json.loads(result)
        except json.JSONDecodeError:
            issues.append("Expected JSON result but got invalid JSON")
            return False, issues

    if expected_type == "audio" and "audio_file" not in result and "bytes" not in result:
        issues.append("Expected audio file metadata but got unexpected format")
        return False, issues

    return len(issues) == 0, issues


def format_audit_trail(harness: HarnessState) -> str:
    """Format the execution audit trail as a readable summary."""
    lines = [
        "=== Harness Audit Trail ===",
        f"Session: {harness.session_id}",
        f"Started: {harness.started_at}",
        f"Tool calls: {harness.total_tool_calls} ({harness.successful_calls} ok, {harness.failed_calls} failed)",
        f"Success rate: {harness.success_rate:.1%}",
        f"Total time: {harness.total_duration_ms:.0f}ms",
        f"Budget remaining: {harness.budget_remaining}",
        f"Context pressure: {harness.context_pressure:.0%}",
        "",
    ]

    if harness.file_inputs:
        lines.append("File inputs:")
        for f in harness.file_inputs:
            status = "OK" if not f.error else f"ERROR: {f.error}"
            lines.append(f"  - {f.filename} ({f.extension}, {f.size_bytes} bytes) [{status}]")
        lines.append("")

    if harness.execution_history:
        lines.append("Execution history:")
        for i, record in enumerate(harness.execution_history, 1):
            status_marker = "✓" if record.status == ExecutionStatus.COMPLETED else "✗"
            conf = f" (conf={record.confidence:.2f})" if record.confidence else ""
            lines.append(f"  {i}. {status_marker} {record.tool_name} ({record.duration_ms:.0f}ms{conf})")
            if record.error:
                lines.append(f"     ERROR: {record.error}")

    if harness.avoided_tools:
        lines.append("")
        lines.append(f"Avoided tools: {', '.join(sorted(harness.avoided_tools))}")

    if harness.steering_hints:
        lines.append("")
        lines.append("Steering hints:")
        for h in harness.steering_hints:
            lines.append(f"  → {h}")

    if harness.warnings:
        lines.append("")
        lines.append("Warnings:")
        for w in harness.warnings:
            lines.append(f"  ⚠ {w}")

    return "\n".join(lines)


def generate_session_summary(harness: HarnessState) -> str:
    """Generate a concise session summary for the model/user."""
    avoid = f", avoiding: {', '.join(sorted(harness.avoided_tools))}" if harness.avoided_tools else ""
    return (
        f"Session {harness.session_id}: "
        f"{harness.total_tool_calls} calls, "
        f"{harness.success_rate:.0%} success, "
        f"{harness.total_duration_ms:.0f}ms total, "
        f"budget: {harness.budget_remaining} remaining, "
        f"pressure: {harness.context_pressure:.0%}{avoid}"
    )
