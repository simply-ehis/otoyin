"""Collect the MCP SDK for the frozen build, excluding its developer CLI.

PyInstaller's ``collect_all("mcp")`` imports every subpackage in an isolated
subprocess. ``mcp.cli`` (the ``mcp dev`` developer CLI) imports ``typer`` at
module scope, which is not declared anywhere (it belongs to the optional
``mcp[cli]`` extra the app never uses - the server exposes /mcp over
Streamable HTTP via FastMCP). Worse, mcp's CLI error handler calls
``sys.exit(1)`` on import failure, so the isolated child dies without an
Exception and the whole build aborts.

Filtering ``mcp.cli`` out keeps the frozen bundle complete for everything the
app actually imports, without adding a dependency the app never runs.
"""

from PyInstaller.utils.hooks import collect_all

datas, binaries, hiddenimports = collect_all(
    "mcp",
    filter_submodules=lambda name: not name.startswith("mcp.cli"),
)
