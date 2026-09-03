"""Tool-dispatch: the deepened module behind the route <-> MCP seam.

Public surface used by callers:

* ``invoke(tool_def, params, adapter)`` -- one call interface for both surfaces
* ``make_route(tool_def)`` -- generate the FastAPI endpoint
* ``make_mcp_tool(mcp, tool_def, adapter)`` -- register the MCP tool
* ``get_adapter()`` -- pick the transport (in-process default, REST via flag)
* ``PROFILE_TOOLS`` -- the Voice Profile capability catalog (slice source)
"""

from __future__ import annotations

from .adapters import InProcessAdapter, RestAdapter, get_adapter
from .catalog import PROFILE_TOOLS
from .core import invoke
from .generate import make_mcp_tool, make_route
from .presenter import map_error, to_audio_envelope, to_envelope

__all__ = [
    "PROFILE_TOOLS",
    "InProcessAdapter",
    "RestAdapter",
    "get_adapter",
    "invoke",
    "make_mcp_tool",
    "make_route",
    "map_error",
    "to_audio_envelope",
    "to_envelope",
]
