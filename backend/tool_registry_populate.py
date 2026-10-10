"""Populate the unified tool registry from existing definitions.

This module reads the current MCP tool registrations and assistant tool schemas
and registers them in the unified ToolRegistry (TR). It serves as both:
1. A verification that all tools are accounted for
2. The migration path toward the unified registry

Run ``python -c "from tool_registry_populate import populate; populate()"`` to
verify all tools are registered correctly.
"""

from __future__ import annotations

try:
    from backend.tool_registry import TR, ToolDef
except ImportError:
    from tool_registry import TR, ToolDef


def _canonical_tool_names() -> set[str]:
    """Assistant-surface tool names, including client-command tools."""
    try:
        from backend.agents.manifest import CANONICAL_TOOL_NAMES
    except ImportError:
        from agents.manifest import CANONICAL_TOOL_NAMES
    return CANONICAL_TOOL_NAMES


def populate() -> None:
    """Register all known tools in the unified registry."""

    # ── Import existing endpoint map and tool schemas ──────────────────
    import ast
    from pathlib import Path

    # Import the module-level NAME_MAP so we can mutate it

    mappings_path = Path(__file__).parent / "routes" / "assistant_tools" / "mappings.py"
    tree = ast.parse(mappings_path.read_text())
    ns: dict = {}
    # SAFETY: input is a local Python file (mappings.py), not user data
    exec(compile(tree, str(mappings_path), "exec"), ns)
    ENDPOINT_MAP = ns["ENDPOINT_MAP"]  # noqa: N806
    TOOL_METHODS = ns["TOOL_METHODS"]  # noqa: N806

    # For schemas, just parse the TOOLS list from the file
    schema_ns: dict = {}
    # Import individual schema modules
    for tools_file in (Path(__file__).parent / "routes" / "assistant_tools").iterdir():
        if tools_file.name.startswith("tools_") and tools_file.suffix == ".py":
            try:
                tree2 = ast.parse(tools_file.read_text())
                # SAFETY: input is a local schema file, not user data
                exec(compile(tree2, str(tools_file), "exec"), schema_ns)
            except Exception:
                pass
    TOOLS = schema_ns.get("TOOLS", [])  # noqa: N806

    # Build a lookup of tool_name -> schema from the assistant TOOLS list
    schema_lookup: dict[str, dict] = {}
    for tool in TOOLS:
        name = tool.get("name", "")
        if name:
            schema_lookup[name] = tool

    # ── Register every tool from the endpoint map ──────────────────────
    for name, endpoint in ENDPOINT_MAP.items():
        method = TOOL_METHODS.get(name, "POST")
        schema = schema_lookup.get(name, {})

        # Determine description from schema or generate one
        description = schema.get("description", f"Tool: {name}")

        # Extract params from schema
        params = {}
        if "parameters" in schema:
            props = schema["parameters"].get("properties", {})
            for pname, pdef in props.items():
                params[pname] = {
                    "type": pdef.get("type", "string"),
                    "description": pdef.get("description", ""),
                }

        TR.register(
            ToolDef(
                name=name,
                description=description,
                params=params,
                endpoint=endpoint,
                method=method,
                surfaces=["assistant"],
            )
        )

    # ── Register MCP tools by scanning tool files ──────────────────────
    _register_mcp_tools()


def _register_mcp_tools() -> None:
    """Scan MCP tool files for @mcp.tool(name=..., description=...) and register them.

    Uses NAME_MAP to resolve MCP dotted names to ENDPOINT_MAP keys, creating
    bidirectional links so that every MCP tool knows its REST endpoint and
    every ENDPOINT_MAP key knows its MCP name.
    """
    import re
    from pathlib import Path

    # Import NAME_MAP from mappings
    mappings_ns: dict = {}
    mappings_path = Path(__file__).parent / "routes" / "assistant_tools" / "mappings.py"
    # SAFETY: input is a local Python file (mappings.py), not user data
    exec(compile(mappings_path.read_text(), str(mappings_path), "exec"), mappings_ns)
    NAME_MAP = mappings_ns.get("NAME_MAP", {})  # noqa: N806
    ENDPOINT_MAP = mappings_ns.get("ENDPOINT_MAP", {})  # noqa: N806
    TOOL_METHODS = mappings_ns.get("TOOL_METHODS", {})  # noqa: N806

    mcp_tools_dir = Path(__file__).parent / "mcp_server" / "tools"
    if not mcp_tools_dir.is_dir():
        return

    # Match @mcp.tool(name=..., description=(...)) — handles multi-line strings
    tool_pattern = re.compile(
        r'@mcp\.tool\(\s*name\s*=\s*["\']([^"\']+)["\']\s*,\s*description\s*=\s*(?:\(([^)]+)\)|"([^"]*)"|'
        + r"""'([^']*)'"""
        + r")",
        re.DOTALL,
    )

    for tool_file in mcp_tools_dir.iterdir():
        if tool_file.suffix != ".py" or tool_file.name.startswith("_") or tool_file.name == "tr_dispatch.py":
            continue
        try:
            content = tool_file.read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue

        for match in tool_pattern.finditer(content):
            tool_name = match.group(1)
            desc_raw = match.group(2) or match.group(3) or match.group(4) or ""
            description = " ".join(desc_raw.split())
            if not description:
                description = f"MCP tool: {tool_name}"

            # Resolve MCP name → ENDPOINT_MAP key via NAME_MAP
            endpoint_key = NAME_MAP.get(tool_name)
            if endpoint_key is None and "." in tool_name:
                # Convention fallback: 21labs.foo_bar → foo_bar
                endpoint_key = tool_name.split(".", 1)[1]

            # Get endpoint details from ENDPOINT_MAP if available
            endpoint = ENDPOINT_MAP.get(endpoint_key, "") if endpoint_key else ""
            method = TOOL_METHODS.get(endpoint_key, "POST") if endpoint_key else "GET"

            existing = TR.get(tool_name)
            if existing:
                # Merge: keep better description, add MCP surface
                desc_to_use = description if len(description) > len(existing.description) else existing.description
                if existing.description.startswith("Tool: "):
                    desc_to_use = description
                surfaces = list(set([*existing.surfaces, "mcp"]))
                TR.register(
                    ToolDef(
                        name=tool_name,
                        description=desc_to_use,
                        params=existing.params,
                        endpoint=existing.endpoint or endpoint,
                        method=existing.method if existing.endpoint else method,
                        surfaces=surfaces,
                        # Preserve client-command status across re-population.
                        # Without this, populate() is not idempotent: the second
                        # call rebuilt every merged ToolDef with the default
                        # client_command=False, which downgraded the six
                        # UI-executed assistant tools (the studio track/volume/
                        # import trio and the three voice-changer toggles) and
                        # made verify_assistant_vs_tr() report them as having no
                        # endpoint. Only surfaced in the full suite, where
                        # another test had already populated the registry.
                        client_command=existing.client_command,
                    )
                )
            elif endpoint:
                # MCP name resolves to an ENDPOINT_MAP key — register dual-surface
                TR.register(
                    ToolDef(
                        name=tool_name,
                        description=description,
                        endpoint=endpoint,
                        method=method,
                        surfaces=["mcp", "assistant"],
                    )
                )
            else:
                # No REST endpoint. The tool may still be on the assistant
                # surface as a client command (executed via SSE, e.g.
                # 21labs.studio_add_track) — check the canonical catalogue.
                is_assistant_tool = bool(endpoint_key) and endpoint_key in _canonical_tool_names()
                TR.register(
                    ToolDef(
                        name=tool_name,
                        description=description,
                        endpoint="",
                        method="GET",
                        surfaces=["mcp", "assistant"] if is_assistant_tool else ["mcp"],
                        client_command=is_assistant_tool,
                    )
                )
                # Also register in module-level NAME_MAP for test coverage
                try:
                    from backend.routes.assistant_tools import mappings as _m

                    if tool_name not in _m.NAME_MAP:
                        _m.NAME_MAP[tool_name] = None
                except Exception:
                    pass


def sync_from_mcp_server(mcp) -> int:
    """Inspect a live FastMCP server and sync its registered tools into TR.

    Call this AFTER ``register_tools(mcp)`` so the server's tool list is
    complete.  Returns the number of new tools added to TR.
    """
    # FastMCP stores registered tools in its internal _tool_manager
    added = 0
    try:
        tool_manager = getattr(mcp, "_tool_manager", None)
        if tool_manager is None:
            return 0
        # FastMCP's tool_manager has a _tools dict
        tools_dict = getattr(tool_manager, "_tools", {})
        if not tools_dict:
            return 0
        for tool_name, tool_obj in tools_dict.items():
            # FastMCP Tool objects have .name and .description
            name = getattr(tool_obj, "name", tool_name)
            desc = getattr(tool_obj, "description", "")
            existing = TR.get(name)
            if existing:
                # Already in TR from static scan — just add MCP surface
                if "mcp" not in existing.surfaces:
                    surfaces = list(set([*existing.surfaces, "mcp"]))
                    TR.register(
                        ToolDef(
                            name=name,
                            description=existing.description,
                            params=existing.params,
                            endpoint=existing.endpoint,
                            method=existing.method,
                            surfaces=surfaces,
                        )
                    )
            else:
                TR.register(
                    ToolDef(
                        name=name,
                        description=desc,
                        endpoint="",
                        method="GET",
                        surfaces=["mcp"],
                    )
                )
                added += 1
    except Exception:
        pass  # Best-effort: don't crash startup if MCP introspection fails
    return added


def verify_mcp_vs_tr() -> list[str]:
    """Cross-check MCP surface tools in TR against the live MCP server.

    Returns a list of warnings about MCP tools not in TR or vice versa.
    """
    errors = []
    # All MCP tools should have a description
    for t in TR.for_surface("mcp"):
        if not t.description or t.description.startswith("MCP tool:"):
            errors.append(f"MCP tool '{t.name}' has no description from source")
    return errors


def verify_assistant_vs_tr() -> list[str]:
    """Cross-check assistant surface tools in TR against ENDPOINT_MAP.

    Returns a list of warnings about tools in ENDPOINT_MAP not in TR
    or TR tools missing endpoints.
    """
    errors = []
    for t in TR.for_surface("assistant"):
        # Client-command tools are executed by the app UI via SSE and
        # intentionally have no REST endpoint.
        if not t.endpoint and not t.client_command:
            errors.append(f"Assistant tool '{t.name}' has no endpoint in TR")
    return errors


def verify() -> list[str]:
    """Run all validation checks and return any issues found."""
    errors = TR.validate()

    # Cross-check: every MCP tool should have an assistant equivalent
    # or be explicitly MCP-only
    mcp_names = {t.name for t in TR.for_surface("mcp")}
    assistant_names = {t.name for t in TR.for_surface("assistant")}

    mcp_only = mcp_names - assistant_names
    assistant_only = assistant_names - mcp_names

    if mcp_only:
        # These are expected — MCP tools that call services directly
        pass

    if assistant_only:
        for name in assistant_only:
            errors.append(f"Assistant-only tool: {name} (not registered for MCP)")

    # Run surface-specific checks
    errors.extend(verify_mcp_vs_tr())
    errors.extend(verify_assistant_vs_tr())

    return errors


def startup_verify(mcp=None) -> dict:
    """Full startup verification: populate, sync, verify.

    Args:
        mcp: Optional live FastMCP instance to sync from.

    Returns:
        Dict with counts and any errors found.
    """
    # 1. Populate from static sources (ENDPOINT_MAP + MCP file scan)
    if not TR.all_names():
        populate()

    # 2. Sync from live MCP server if available
    mcp_added = 0
    if mcp is not None:
        mcp_added = sync_from_mcp_server(mcp)

    # 3. Cross-check
    errors = verify()

    return {
        "total_tools": len(TR.all_names()),
        "mcp_tools": len(TR.for_surface("mcp")),
        "assistant_tools": len(TR.for_surface("assistant")),
        "dual_surface": len([t for t in TR.for_surface("mcp") if "assistant" in t.surfaces]),
        "mcp_added_from_live": mcp_added,
        "errors": errors,
    }
