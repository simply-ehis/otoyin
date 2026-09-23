"""otoyin MCP tool implementations.

Thin wrappers over existing services/routes. Tools are registered with dotted
names (``21labs.speak`` etc.) so they look natural in agent logs —
the Python function name stays snake_case.

This package is the split of the former single ``tools.py`` (1441 lines) into
cohesive per-domain modules, each exposing a ``register_*_tools(mcp)``
function. :func:`register_tools` re-exports the original public symbol so
existing imports (``from mcp_server.tools import register_tools``) keep working.

ARCHITECTURE (read before editing a domain file): the ``@mcp.tool``
decorators in the domain modules are METADATA, not live registrations. Only
``generation``, ``skills``, ``speech``, and ``workflow`` registrars are ever
called below. Everything else reaches clients through the TR dispatcher:

1. ``tool_registry_populate.populate()`` regex-scans the decorators for
   ``name=``/``description=`` and builds the unified registry (TR).
2. ``tr_dispatch.register_tr_tools`` generates the live FastMCP wrappers
   from TR (explicit params, loopback REST delegation).

Consequence: in every domain module EXCEPT generation/skills/speech/workflow
(which are called below and live), editing an inner function BODY changes
nothing at runtime — only its ``name=``/``description=`` decorator text
matters (TR metadata). Those inner bodies are reference implementations kept
for readability. ``backend/tests/test_mcp_registration_invariant.py`` locks
this: decorated names must equal TR names exactly, or the build fails.
"""

from __future__ import annotations

import logging

from fastmcp import FastMCP

from .generation import register_generation_tools
from .skills import register_skill_tools
from .speech import register_speech_tools
from .workflow import register_workflow_tools

logger = logging.getLogger(__name__)


def register_tools(mcp: FastMCP) -> None:
    """Attach all otoyin tools to the given FastMCP instance.

    Tools are registered in two layers:

    1. **TR dispatcher** — auto-registers REST-proxy tools from the unified
       tool registry (``TR.for_surface('mcp')``).  This is the single source
       of truth for tool metadata (name, description, params, endpoint).

    2. **Manual decorators** — for tools that call services directly
       (speak, transcribe, diarize, clone_voice, generate, etc.) and need
       custom Python logic beyond a simple REST proxy.
    """
    from backend.tool_registry import TR
    from backend.tool_registry_populate import populate

    from .tr_dispatch import register_tr_tools

    # Layer 1: Auto-register all REST-proxy tools from TR.
    # The registry must be populated first — on a cold process (fresh app
    # start) it is empty, and registering before populate() would silently
    # skip every REST-proxy tool.
    if not TR.all_names():
        populate()
    tr_count = register_tr_tools(mcp)

    # Layer 2: Register custom tools that call services directly
    # (these override any TR-registered tools with the same name)
    register_speech_tools(mcp)
    register_generation_tools(mcp)
    register_workflow_tools(mcp)
    register_skill_tools(mcp)

    # Deepened-seam wiring: register the generated profile tools
    # directly (in-process) alongside the TR dispatcher. Guarded so a
    # missing tool_dispatch package never breaks server startup.
    try:
        from backend.tool_dispatch import (
            PROFILE_TOOLS,
            InProcessAdapter,
            make_mcp_tool,
        )

        _profile_adapter = InProcessAdapter()
        for _td in PROFILE_TOOLS:
            try:
                make_mcp_tool(mcp, _td, _profile_adapter)
            except Exception:
                logger.debug("Skipping profile tool %s", _td.name, exc_info=True)
    except Exception:
        logger.debug("tool_dispatch profile wiring unavailable", exc_info=True)
    logger.info(
        "MCP tools: %d from TR dispatcher + custom tools from speech/generation/workflow",
        tr_count,
    )


__all__ = ["register_tools"]
