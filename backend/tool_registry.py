"""Unified tool registry — single source of truth for MCP and assistant tools.

Instead of defining tool schemas in three independent places (MCP decorators,
assistant TOOLS lists, ENDPOINT_MAP), every tool is registered once here. The
MCP server and assistant layer both read from this registry.

Usage::

    from tool_registry import TR, ToolDef

    # Register a tool
    TR.register(
        ToolDef(
            name="generate_speech",
            description="Generate speech from text",
            params={"text": {"type": "string"}, "profile_id": {"type": "string"}},
            endpoint="/generate",
            method="POST",
            surfaces=["mcp", "assistant"],
        )
    )

    # Query
    TR.get("generate_speech")  # -> ToolDef
    TR.for_surface("mcp")  # -> list[ToolDef]
    TR.endpoints()  # -> dict[str, tuple[str, str]]  (name -> (endpoint, method))
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True, slots=True)
class ToolDef:
    """Definition of a single tool exposed to MCP or the assistant."""

    name: str
    description: str
    params: dict[str, dict] = field(default_factory=dict)
    endpoint: str = ""
    method: str = "POST"
    surfaces: list[str] = field(default_factory=lambda: ["mcp", "assistant"])
    # Client-command tools are executed by the app UI via SSE ``command``
    # events — they intentionally have no REST endpoint.
    client_command: bool = False
    # Deepened-seam fields (tool_dispatch). Optional so legacy
    # metadata-only registrations keep working.
    handler: Any = None
    request_model: Any = None
    response_model: Any = None
    generated: bool = False


class ToolRegistry:
    """Central registry for all tools. Prevents MCP/assistant mismatches."""

    def __init__(self) -> None:
        self._tools: dict[str, ToolDef] = {}

    def register(self, tool: ToolDef) -> None:
        """Register a tool. Overwrites if the name already exists."""
        self._tools[tool.name] = tool

    def get(self, name: str) -> ToolDef | None:
        return self._tools.get(name)

    def for_surface(self, surface: str) -> list[ToolDef]:
        """Return all tools exposed on the given surface (mcp, assistant)."""
        return [t for t in self._tools.values() if surface in t.surfaces]

    def endpoints(self) -> dict[str, tuple[str, str]]:
        """Return {tool_name: (endpoint, method)} for all tools with endpoints."""
        return {name: (t.endpoint, t.method) for name, t in self._tools.items() if t.endpoint}

    def all_names(self) -> list[str]:
        return list(self._tools.keys())

    def validate(self) -> list[str]:
        """Check for common issues. Returns list of error messages."""
        errors = []
        for name, tool in self._tools.items():
            if not tool.endpoint and "assistant" in tool.surfaces and not tool.client_command:
                errors.append(f"{name}: assistant tool without endpoint")
            if not tool.description:
                errors.append(f"{name}: missing description")
        return errors


# Global singleton
TR = ToolRegistry()
