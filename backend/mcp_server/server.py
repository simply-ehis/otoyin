"""Construct the FastMCP server and mount it on the FastAPI app.

The MCP endpoint lives at ``/mcp`` (Streamable HTTP transport). Modern MCP
clients (Claude Code, Cursor, Windsurf, VS Code MCP extensions) connect
directly via URL; older stdio-only clients use the ``otoyin-mcp`` shim
binary bundled with the desktop app.
"""

from __future__ import annotations

import logging
from contextlib import AsyncExitStack, asynccontextmanager

from fastmcp import FastMCP

from ..agents.manifest import get_mcp_instructions
from .tools import register_tools

logger = logging.getLogger(__name__)


def build_mcp_server() -> FastMCP:
    """Create the FastMCP instance with otoyin tools registered."""
    mcp = FastMCP(
        name="otoyin",
        instructions=get_mcp_instructions(),
    )
    register_tools(mcp)
    return mcp


def compose_lifespan(*lifespans):
    """Combine multiple async context managers into a single FastAPI lifespan.

    Used by ``create_app`` to run the existing otoyin startup/shutdown
    together with FastMCP's session manager (which MUST run in the
    ASGI lifespan for Streamable HTTP to work).
    """

    @asynccontextmanager
    async def _combined(app):
        async with AsyncExitStack() as stack:
            for cm_factory in lifespans:
                cm = cm_factory(app) if callable(cm_factory) else cm_factory
                await stack.enter_async_context(cm)
            yield

    return _combined
