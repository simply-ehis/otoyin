"""Tool-dispatch core: one interface in front of the transport adapters."""

from __future__ import annotations

import logging

from .adapters import InProcessAdapter

logger = logging.getLogger(__name__)


async def invoke(tool_def, params: dict, adapter=None):
    """Run a tool through the given (or default in-process) adapter.

    This is the single call surface for both the generated HTTP route and the
    generated MCP tool -- the transport is the only thing that differs.
    """
    if adapter is None:
        adapter = InProcessAdapter()
    return await adapter.invoke(tool_def, params or {})
