"""TR-driven MCP tool dispatcher — reads from the unified tool registry.

Instead of manually defining ``@mcp.tool()`` wrappers for every REST endpoint,
this module reads ``TR.for_surface("mcp")`` and auto-registers tools that have
an ``endpoint`` + ``method``.  Tools that call services directly (speak,
transcribe, diarize, clone_voice, etc.) are kept as manual decorators in their
respective modules — they have no endpoint in TR.

Usage (in ``register_tools``)::

    from .tr_dispatch import register_tr_tools

    register_tr_tools(mcp)  # auto-register REST-proxy tools from TR
    register_speech_tools(mcp)  # manual decorators for custom tools
    ...
"""

from __future__ import annotations

import logging
import re
from typing import Any

from fastmcp import FastMCP

from ._common import _encode_path_param, _rest

logger = logging.getLogger(__name__)

# Path parameters that need _encode_path_param() treatment.
# Matches {param_name} in endpoint templates like "/batch/jobs/{job_id}".
_PATH_PARAM_RE = re.compile(r"\{(\w+)\}")


def register_tr_tools(mcp: FastMCP) -> int:
    """Auto-register REST-proxy tools from TR.

    For every tool in ``TR.for_surface("mcp")`` that has an endpoint and
    method, create a ``@mcp.tool()`` function that delegates to ``_rest()``.

    Returns the number of tools registered.
    """
    try:
        from backend.tool_registry import TR
    except ImportError:
        from tool_registry import TR

    registered = 0
    skipped = 0

    # Check which tools are already registered (by manual decorators)
    tool_manager = getattr(mcp, "_tool_manager", None)
    existing_tools = set()
    if tool_manager:
        existing_tools = set(getattr(tool_manager, "_tools", {}).keys())

    for tool_def in TR.for_surface("mcp"):
        name = tool_def.name
        endpoint = tool_def.endpoint
        method = tool_def.method.upper()

        if not endpoint:
            # No REST endpoint — custom tool (speak, transcribe, etc.)
            # Skip; the manual decorator handles it.
            continue

        # Skip if already registered by a manual decorator
        if name in existing_tools:
            skipped += 1
            continue

        # Detect path parameters in the endpoint template
        path_params = _PATH_PARAM_RE.findall(endpoint)

        # Build the function name — must be a valid Python identifier
        fn_name = "tr_" + re.sub(r"[^a-zA-Z0-9_]", "_", name)

        # Create the auto-dispatched tool function
        _make_tr_tool(mcp, name, fn_name, tool_def.description, endpoint, method, path_params, tool_def.params)
        registered += 1

    if skipped:
        logger.debug(
            "TR dispatcher: skipped %d tools already registered by manual decorators",
            skipped,
        )

    if registered:
        logger.info(
            "TR dispatcher: auto-registered %d REST-proxy tools from unified registry",
            registered,
        )

    return registered


def _make_tr_tool(
    mcp: FastMCP,
    tool_name: str,
    fn_name: str,
    description: str,
    endpoint: str,
    method: str,
    path_params: list[str],
    params: dict[str, dict],
) -> None:
    """Create and register a single TR-driven MCP tool.

    Uses ``exec`` to generate a function with explicit named parameters
    (FastMCP does not support ``**kwargs``).  Each generated function
    resolves path params, then delegates to ``_rest()``.
    """
    # Determine which params are path params vs body/query params
    body_params = {k: v for k, v in params.items() if k not in path_params}

    # Build parameter list for the function signature.
    # Every parameter is optional (str | None = None) so MCP can call
    # with any subset.  We validate required params at call time.
    all_param_names = list(path_params) + list(body_params.keys())
    sig_parts = []
    type_map = {
        "integer": "int",
        "number": "float",
        "boolean": "bool",
        "array": "list",
        "object": "dict",
    }
    for pname in all_param_names:
        pdef = body_params.get(pname, {})
        ptype = pdef.get("type", "string") if isinstance(pdef, dict) else "string"
        py_type = type_map.get(ptype, "str")
        sig_parts.append(f"{pname}: {py_type} | None = None")
    sig = ", ".join(sig_parts)

    # Build a docstring — set __doc__ after exec to avoid quoting issues
    param_lines = []
    for pname, pdef in body_params.items():
        ptype = pdef.get("type", "string")
        pdesc = pdef.get("description", "")
        param_lines.append(f"    {pname} ({ptype}): {pdesc}" if pdesc else f"    {pname} ({ptype})")
    doc = f"{description}\n\nParameters:\n" + "\n".join(param_lines) if param_lines else description
    if path_params:
        doc += f"\n\nPath params: {', '.join(path_params)}"

    # Escape the endpoint for use in generated code
    escaped_endpoint = endpoint.replace("\\", "\\\\").replace('"', '\\"')
    escaped_method = method.replace('"', '\\"')

    # Build the function body
    body_lines = [
        f'    resolved = "{escaped_endpoint}"',
        "    kwargs: dict[str, Any] = {}",
    ]
    for pp in path_params:
        body_lines.append(f"    if {pp} is None:")
        body_lines.append(f'        raise ValueError("Missing required path parameter: {pp}")')
        body_lines.append(f'    resolved = resolved.replace("{{{pp}}}", _encode_path_param(str({pp})))')
    for pname in body_params:
        body_lines.append(f"    if {pname} is not None:")
        body_lines.append(f'        kwargs["{pname}"] = {pname}')
    body_lines.append(f'    if "{escaped_method}" in ("POST", "PUT", "PATCH"):')
    body_lines.append("        return await _rest(resolved_method, resolved, json=kwargs or None)")
    body_lines.append("    else:")
    body_lines.append("        return await _rest(resolved_method, resolved, params=kwargs or None)")

    # Assemble the function code — no docstring in generated code;
    # we set __doc__ on the function object after exec to avoid quoting issues.
    code = (
        f"async def {fn_name}({sig}) -> dict[str, Any]:\n"
        f'    resolved_method = "{escaped_method}"\n' + "\n".join(body_lines) + "\n"
    )

    # Compile and execute to get the function object
    ns: dict = {
        "Any": Any,
        "_rest": _rest,
        "_encode_path_param": _encode_path_param,
    }
    # SAFETY: input is entirely from the tool registry (hardcoded maps),
    # not user data.  Tool names, endpoints, and methods are all controlled.
    exec(compile(code, f"<tr_dispatch:{tool_name}>", "exec"), ns)
    fn = ns[fn_name]
    fn.__doc__ = doc  # Set docstring on the function object directly

    # Register with FastMCP
    mcp.tool(name=tool_name, description=description)(fn)
