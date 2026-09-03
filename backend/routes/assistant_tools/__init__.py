"""Tool definitions and execution for the AI assistant.

This package is the split replacement for the former single-file
``routes/assistant_tools.py``. It re-exports the same public symbols so that
existing imports (``from routes.assistant_tools import router`` / ``TOOLS`` /
``execute_tool`` / etc.) keep working unchanged.
"""

from .constants import MAX_TOOL_ITERATIONS, build_local_tool_prompt
from .execution import execute_tool, execute_tools_parallel, format_tool_error, sse_event
from .formatter import build_structured_result, suggest_fallback
from .harness import (
    HarnessState,
    compact_text,
    compact_tool_response,
    create_harness_session,
    detect_failure_loop,
    estimate_messages_tokens,
    estimate_tokens,
    format_audit_trail,
    generate_session_summary,
    process_file_input,
    process_multiple_files,
    validate_result_quality,
)
from .mappings import (
    CLIENT_COMMAND_TOOLS,
    ENDPOINT_MAP,
    QUERY_POST_TOOLS,
    TOOL_METHODS,
)
from .schemas import TOOLS
from .task_orchestrator import build_execution_plan, decompose_tasks, format_execution_plan, validate_plan
from .tool_call_middleware import (
    build_no_tool_response,
    build_retry_prompt,
    enforce_tool_call_budget,
    filter_low_confidence_calls,
    parse_tool_calls,
    validate_tool_call,
)
from .tool_router import DEFAULT_TOP_K, rank_tools, score_tool, select_tools_for_prompt

__all__ = [
    "CLIENT_COMMAND_TOOLS",
    "DEFAULT_TOP_K",
    "ENDPOINT_MAP",
    "MAX_TOOL_ITERATIONS",
    "QUERY_POST_TOOLS",
    "TOOLS",
    "TOOL_METHODS",
    "HarnessState",
    "build_execution_plan",
    "build_local_tool_prompt",
    "build_no_tool_response",
    "build_retry_prompt",
    "build_structured_result",
    "compact_text",
    "compact_tool_response",
    "create_harness_session",
    "decompose_tasks",
    "detect_failure_loop",
    "enforce_tool_call_budget",
    "estimate_messages_tokens",
    "estimate_tokens",
    "execute_tool",
    "execute_tools_parallel",
    "filter_low_confidence_calls",
    "format_audit_trail",
    "format_execution_plan",
    "format_tool_error",
    "generate_session_summary",
    "parse_tool_calls",
    "process_file_input",
    "process_multiple_files",
    "rank_tools",
    "score_tool",
    "select_tools_for_prompt",
    "sse_event",
    "suggest_fallback",
    "validate_plan",
    "validate_result_quality",
    "validate_tool_call",
]
