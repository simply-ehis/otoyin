"""Generate an HTML report of all MCP tools with their metadata status.

Run: python -m backend.scripts.generate_tool_report
Output: writes to /tmp/tool-report-<timestamp>.html (or %TEMP% on Windows)
"""

from __future__ import annotations

import sys
import tempfile
import webbrowser
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


def generate() -> str:
    from backend.tool_registry import TR
    from backend.tool_registry_populate import populate

    TR._tools.clear()
    populate()

    from backend.routes.assistant_tools.mappings import ENDPOINT_MAP, NAME_MAP

    tools = []
    for t in sorted(TR.for_surface("mcp"), key=lambda x: x.name):
        base = t.name.split(".", 1)[1] if "." in t.name else t.name
        is_dual = "assistant" in t.surfaces
        mapped = t.name in NAME_MAP
        desc_quality = (
            "good"
            if t.description and not t.description.startswith("Tool: ") and not t.description.startswith("MCP tool: ")
            else "generic"
        )
        tools.append(
            {
                "name": t.name,
                "base": base,
                "dual": is_dual,
                "endpoint": t.endpoint or "",
                "method": t.method,
                "desc_quality": desc_quality,
                "desc": t.description[:120] + ("..." if len(t.description) > 120 else ""),
                "mapped": mapped,
            }
        )

    total = len(tools)
    dual = sum(1 for t in tools if t["dual"])
    mcp_only = total - dual
    with_endpoint = sum(1 for t in tools if t["endpoint"])
    mapped = sum(1 for t in tools if t["mapped"])
    good_desc = sum(1 for t in tools if t["desc_quality"] == "good")
    generic_desc = total - good_desc

    now = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")

    # Build table rows
    rows = ""
    for i, t in enumerate(tools):
        dual_badge = (
            '<span class="badge badge-green">Dual</span>'
            if t["dual"]
            else '<span class="badge badge-yellow">MCP-only</span>'
        )
        mapped_badge = (
            '<span class="badge badge-green">Yes</span>' if t["mapped"] else '<span class="badge badge-red">No</span>'
        )
        endpoint_cell = f"<code>{t['endpoint']}</code>" if t["endpoint"] else '<span class="text-muted">—</span>'
        method_class = "method-get" if t["method"] == "GET" else "method-post"
        desc_class = "desc-good" if t["desc_quality"] == "good" else "desc-generic"

        rows += f"""        <tr>
          <td class="rank">{i + 1}</td>
          <td><code>{t["name"]}</code></td>
          <td>{dual_badge}</td>
          <td>{endpoint_cell}</td>
          <td><span class="{method_class}">{t["method"]}</span></td>
          <td>{mapped_badge}</td>
          <td class="{desc_class}" title="{t["desc"]}">{t["desc"]}</td>
        </tr>
"""

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MCP Tool Coverage Report — 21-labs</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }}
  h1 {{ font-size: 1.8rem; margin-bottom: 0.5rem; color: #f8fafc; }}
  .subtitle {{ color: #94a3b8; margin-bottom: 2rem; }}
  .stats {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem; }}
  .stat-card {{ background: #1e293b; border-radius: 12px; padding: 1.2rem; border: 1px solid #334155; }}
  .stat-card .label {{ font-size: 0.8rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; }}
  .stat-card .value {{ font-size: 2rem; font-weight: 700; margin-top: 0.3rem; }}
  .stat-card .value.green {{ color: #34d399; }}
  .stat-card .value.yellow {{ color: #fbbf24; }}
  .stat-card .value.red {{ color: #f87171; }}
  .stat-card .value.blue {{ color: #60a5fa; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 0.85rem; }}
  th {{ background: #1e293b; color: #94a3b8; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.05em; padding: 0.8rem 1rem; text-align: left; position: sticky; top: 0; border-bottom: 2px solid #334155; }}
  td {{ padding: 0.6rem 1rem; border-bottom: 1px solid #1e293b; }}
  tr:hover {{ background: #1e293b; }}
  .rank {{ color: #475569; width: 3rem; }}
  code {{ background: #1e293b; padding: 0.15rem 0.4rem; border-radius: 4px; font-size: 0.8rem; color: #93c5fd; }}
  .badge {{ display: inline-block; padding: 0.15rem 0.5rem; border-radius: 999px; font-size: 0.7rem; font-weight: 600; }}
  .badge-green {{ background: #064e3b; color: #34d399; }}
  .badge-yellow {{ background: #713f12; color: #fbbf24; }}
  .badge-red {{ background: #7f1d1d; color: #f87171; }}
  .method-get {{ color: #34d399; font-weight: 600; }}
  .method-post {{ color: #60a5fa; font-weight: 600; }}
  .desc-good {{ color: #cbd5e1; max-width: 400px; }}
  .desc-generic {{ color: #fbbf24; font-style: italic; }}
  .text-muted {{ color: #475569; }}
  .filter-bar {{ margin-bottom: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap; }}
  .filter-bar input {{ background: #1e293b; border: 1px solid #334155; color: #e2e8f0; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.85rem; width: 300px; }}
  .filter-bar input:focus {{ outline: none; border-color: #60a5fa; }}
  .filter-bar button {{ background: #334155; color: #e2e8f0; border: none; padding: 0.5rem 1rem; border-radius: 8px; cursor: pointer; font-size: 0.8rem; }}
  .filter-bar button.active {{ background: #3b82f6; }}
  .footer {{ margin-top: 2rem; color: #475569; font-size: 0.75rem; }}
</style>
</head>
<body>
  <h1>MCP Tool Coverage Report</h1>
  <p class="subtitle">Generated {now} — Unified Tool Registry audit</p>

  <div class="stats">
    <div class="stat-card">
      <div class="label">Total MCP Tools</div>
      <div class="value blue">{total}</div>
    </div>
    <div class="stat-card">
      <div class="label">Dual-Surface</div>
      <div class="value green">{dual}</div>
    </div>
    <div class="stat-card">
      <div class="label">MCP-Only</div>
      <div class="value yellow">{mcp_only}</div>
    </div>
    <div class="stat-card">
      <div class="label">With Endpoint</div>
      <div class="value green">{with_endpoint}</div>
    </div>
    <div class="stat-card">
      <div class="label">NAME_MAP Mapped</div>
      <div class="value green">{mapped}</div>
    </div>
    <div class="stat-card">
      <div class="label">Good Descriptions</div>
      <div class="value green">{good_desc}</div>
    </div>
    <div class="stat-card">
      <div class="label">Generic Descriptions</div>
      <div class="value {"red" if generic_desc else "green"}">{generic_desc}</div>
    </div>
  </div>

  <div class="filter-bar">
    <input type="text" id="search" placeholder="Search tools..." oninput="filterTable()">
    <button onclick="filterBy('all')" class="active" id="btn-all">All ({total})</button>
    <button onclick="filterBy('dual')" id="btn-dual">Dual ({dual})</button>
    <button onclick="filterBy('mcp-only')" id="btn-mcp-only">MCP-Only ({mcp_only})</button>
    <button onclick="filterBy('get')" id="btn-get">GET</button>
    <button onclick="filterBy('post')" id="btn-post">POST</button>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>MCP Tool Name</th>
        <th>Surface</th>
        <th>Endpoint</th>
        <th>Method</th>
        <th>NAME_MAP</th>
        <th>Description</th>
      </tr>
    </thead>
    <tbody id="tool-table">
{rows}    </tbody>
  </table>

  <p class="footer">
    Tool Registry: {len(TR.all_names())} total tools | NAME_MAP: {len(NAME_MAP)} entries |
    ENDPOINT_MAP: {len(ENDPOINT_MAP)} endpoints
  </p>

  <script>
    function filterTable() {{
      const q = document.getElementById('search').value.toLowerCase();
      const rows = document.querySelectorAll('#tool-table tr');
      rows.forEach(r => {{
        r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none';
      }});
    }}
    function filterBy(type) {{
      document.querySelectorAll('.filter-bar button').forEach(b => b.classList.remove('active'));
      document.getElementById('btn-' + type.replace(' ', '-')).classList.add('active');
      const rows = document.querySelectorAll('#tool-table tr');
      rows.forEach(r => {{
        const text = r.textContent;
        if (type === 'all') r.style.display = '';
        else if (type === 'dual') r.style.display = text.includes('Dual') ? '' : 'none';
        else if (type === 'mcp-only') r.style.display = text.includes('MCP-only') ? '' : 'none';
        else if (type === 'get') r.style.display = text.includes('GET') ? '' : 'none';
        else if (type === 'post') r.style.display = text.includes('POST') ? '' : 'none';
      }});
    }}
  </script>
</body>
</html>"""
    return html


def main() -> None:
    html = generate()
    ts = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")

    # Write to temp directory
    temp_dir = Path(tempfile.gettempdir())
    out_path = temp_dir / f"tool-report-{ts}.html"
    out_path.write_text(html, encoding="utf-8")

    print(f"Report written to: {out_path}")
    webbrowser.open(str(out_path))


if __name__ == "__main__":
    main()
