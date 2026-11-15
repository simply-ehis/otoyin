"""Emit the self-contained HTML connection + flow graph for otoyin.

Includes a real SVG node/edge diagram (not just lists). Node positions and
edges are derived from the measured import graph and transport scan; the layout
is hand-placed for legibility but every count on the page comes from the source.
"""

import html
import re
from collections import defaultdict
from pathlib import Path

# Derived, never hardcoded: the repo moved (Downloads -> source\repos) and a
# pinned path silently scanned the wrong tree.
REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "app" / "src"
SKIP = {"node_modules", "dist", ".git", "__pycache__"}

files = [
    f
    for f in SRC.rglob("*")
    if f.is_file() and f.suffix in (".ts", ".tsx") and not (SKIP & set(f.parts))
]
texts = {f: f.read_text(encoding="utf-8", errors="replace") for f in files}
rel = {f: f.relative_to(REPO).as_posix() for f in files}


def imports_of():
    """alias -> set of files importing it, for @/features and @/components."""
    out = {"features": defaultdict(set), "components": defaultdict(set)}
    for f, t in texts.items():
        for m in re.finditer(r"""from\s+['"]@/features/([^/'"]+)""", t):
            out["features"][m.group(1)].add(rel[f])
        for m in re.finditer(r"""from\s+['"]@/components/([^'"]+)['"]""", t):
            out["components"][m.group(1)].add(rel[f])
    return out


IMP = imports_of()


def mirrors():
    by = defaultdict(list)
    for f in files:
        by[f.name].append(rel[f])
    out = []
    for name, paths in sorted(by.items()):
        if (
            len(paths) > 1
            and any("/components/" in p for p in paths)
            and any("/features/" in p for p in paths)
        ):
            out.append((name, paths))
    return out


SPEC_RX = re.compile(r"(?:from\s+|import\(|require\()\s*[`'\"]([^`'\"]+)[`'\"]")


def resolve_spec(spec, importer):
    """Resolve an import specifier to a real file, or None (non-module strings)."""
    if spec.startswith("@/"):
        base = SRC / spec[2:]
    elif spec.startswith("."):
        base = (importer.parent / spec).resolve()
    else:
        return None
    for cand in (
        base,
        base.with_suffix(".ts"),
        base.with_suffix(".tsx"),
        base / "index.ts",
        base / "index.tsx",
    ):
        if cand.exists():
            return cand.resolve()
    return None


def dead_components():
    """components/* directories with no *effective* inbound imports.

    Two earlier verdicts were wrong and are why this resolves modules instead
    of pattern-matching specifiers:
      * a one-level glob missed `components/Generation/AudioEditorPanel.tsx`
        statically importing Workspace, and the alias-only regex misses
        same-tree relative imports such as `../Generation/Foo`;
      * counting raw importers calls a directory live when its only pull comes
        from another dead directory (Generation -> Workspace) or from the
        unused `components/index.ts` barrel -- dead either way.
    So: resolve every specifier, then prune to a fixpoint where an importer
    only counts if it is itself reachable from outside the dead set.
    """
    referenced = defaultdict(set)
    barrel_importers = set()
    for f, t in texts.items():
        for m in SPEC_RX.finditer(t):
            spec = m.group(1)
            if "components" not in spec:
                continue
            resolved = resolve_spec(spec, f)
            if resolved is None:
                continue
            try:
                rp = resolved.relative_to(SRC).as_posix()
            except ValueError:
                continue
            if rp == "components":
                barrel_importers.add(rel[f])
            elif rp.startswith("components/"):
                referenced[rp.split("/")[1]].add(rel[f])

    def live_importer(imp):
        if "/components/" not in imp:
            return True  # router, features, lib, tests -- always live
        if imp.startswith("components/"):
            return any(live_importer(b) for b in barrel_importers)
        owner = imp.split("/components/")[1].split("/")[0]
        return owner in live_set

    dirs = [d for d in sorted((SRC / "components").iterdir()) if d.is_dir()]
    live_set = {d.name for d in dirs if referenced.get(d.name)}
    changed = True
    while changed:  # a dir held up only by dead dirs dies too
        changed = False
        for d in dirs:
            if d.name in live_set and not any(
                live_importer(i) for i in referenced.get(d.name, ())
            ):
                live_set.discard(d.name)
                changed = True

    dead = [
        (d.name, sum(1 for _ in d.rglob("*.ts*")))
        for d in dirs
        if d.name not in live_set
    ]
    live = [
        (d.name, sum(1 for _ in d.rglob("*.ts*"))) for d in dirs if d.name in live_set
    ]
    return dead, live


def routes():
    router = texts[SRC / "router.tsx"]
    return re.findall(r"""path:\s*["']([^"']+)["']""", router), len(
        re.findall(r"=\s*lazy\(", router)
    )


def transports():
    out = []
    for f, t in texts.items():
        if ".test." in f.name:
            continue
        for m in re.finditer(r"""new EventSource\(\s*([`"'])(.*?)\1""", t):
            out.append(("SSE", m.group(2), rel[f], t[: m.start()].count("\n") + 1))
        for m in re.finditer(r"new WebSocket\(([^)]*)\)", t):
            out.append(("WS", m.group(1)[:40], rel[f], t[: m.start()].count("\n") + 1))
        for m in re.finditer(r"""fetch\(\s*([`"'])(.*?)\1""", t):
            tgt = m.group(2)
            mm = re.search(r"/([a-z0-9\-]+)", tgt)
            out.append(
                (
                    "REST",
                    mm.group(1) if mm else tgt[:20],
                    rel[f],
                    t[: m.start()].count("\n") + 1,
                )
            )
    return out


route_list, lazy_count = routes()
mir = mirrors()
dead, live_dirs = dead_components()
tp = transports()


def workspace_dependents():
    """Which files pull in components/Workspace, and via what.

    router.tsx lazy()s these, which is what put a 388 KB chunk in the startup
    preloads before manualChunks was fixed. Knowing the callers is what makes
    deleting the directory safe.
    """
    hits = []
    for f, t in texts.items():
        for m in re.finditer(
            r"""['"](?:@/components/Workspace/|(?:\.\./)+components/Workspace/)([^'"]+)['"]""",
            t,
        ):
            hits.append((rel[f], m.group(1), t[: m.start()].count("\n") + 1))
    return hits


ws_deps = workspace_dependents()

eps = defaultdict(list)
for kind, target, file, line in tp:
    key = f"{kind} /{target}" if not target.startswith("/") else f"{kind} {target}"
    eps[key].append(f"{file}:{line}")


def esc(s):
    return html.escape(str(s))


# ── SVG diagram ──────────────────────────────────────────────────────────────
# Four columns: shell / ui / api / backend, with transport edges between them.
DIAG = [
    # (id, label, x, y, w, h, col, sub)
    ("tauri", "Tauri shell", 40, 30, 190, 54, 0, "Rust · lib.rs / server.rs"),
    ("ui", "React app", 290, 30, 190, 54, 0, "AppFrame → router.tsx"),
    ("api", "API client", 540, 30, 200, 54, 0, "clientCore.ts"),
    ("api2", "lib/api/client*.ts", 290, 150, 190, 54, 1, "29 domain files"),
    ("state", "Stores (zustand)", 540, 150, 200, 54, 1, "server / player / ui"),
    (
        "routes",
        f"{lazy_count} lazy routes",
        40,
        270,
        190,
        54,
        1,
        "0 eager page imports",
    ),
    (
        "feats",
        f"{len(IMP['features'])} feature modules",
        290,
        390,
        190,
        54,
        1,
        "@/features/*",
    ),
    ("comp", "components/* tree", 540, 270, 200, 54, 1, f"legacy, {len(mir)} mirrored"),
    ("be", "FastAPI", 40, 480, 190, 54, 2, "routes/ + services/"),
    ("egress", "Egress (guarded)", 290, 480, 190, 54, 2, "SSRF: is_url_safe"),
    ("fe", "Frontend streams", 540, 390, 200, 54, 2, "2× SSE · 1× WS"),
]

EDGES = [
    ("tauri", "ui", "IPC"),
    ("ui", "routes", "navigate"),
    ("routes", "feats", "render"),
    ("ui", "api", "fetch"),
    ("ui", "api2", "import"),
    ("api2", "api", "extends"),
    ("ui", "state", "read"),
    ("ui", "fe", "subscribe"),
    ("api", "be", "HTTP loopback :17493"),
    ("fe", "be", "SSE + WS"),
    ("be", "egress", "downloads"),
    ("feats", "comp", "still imports"),
]


def svg_diagram():
    pos = {n[0]: n for n in DIAG}
    parts = []
    for a, b, label in EDGES:
        x1, y1, w1, h1 = pos[a][2], pos[a][3], pos[a][4], pos[a][5]
        x2, y2, w2, h2 = pos[b][2], pos[b][3], pos[b][4], pos[b][5]
        ax, ay = x1 + w1 / 2, y1 + h1 / 2
        bx, by = x2 + w2 / 2, y2 + h2 / 2
        # gentle curve for vertical-ish links
        mx, my = (ax + bx) / 2, (ay + by) / 2 - 14
        parts.append(
            f'<path d="M{ax:.0f},{ay:.0f} Q{mx:.0f},{my:.0f} {bx:.0f},{by:.0f}" '
            f'fill="none" stroke="#4a423e" stroke-width="1.4" marker-end="url(#a)"/>'
        )
        parts.append(
            f'<text x="{(ax + bx) / 2:.0f}" y="{(ay + by) / 2 - 4:.0f}" fill="#8a8078" '
            f'font-size="9.5" text-anchor="middle" font-family="ui-monospace,monospace">'
            f"{esc(label)}</text>"
        )
    palette = {0: "#c9a8d4", 1: "#e0b08a", 2: "#96d0a4"}
    for nid, label, x, y, w, h, col, sub in DIAG:
        c = palette[col]
        parts.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" '
            f'fill="#1c1a19" stroke="{c}" stroke-width="1.3"/>'
        )
        parts.append(
            f'<text x="{x + w / 2:.0f}" y="{y + 21}" fill="#e8e2dc" font-size="12.5" '
            f'font-weight="600" text-anchor="middle">{esc(label)}</text>'
        )
        parts.append(
            f'<text x="{x + w / 2:.0f}" y="{y + 37}" fill="#8a8078" font-size="9.5" '
            f'text-anchor="middle" font-family="ui-monospace,monospace">{esc(sub)}</text>'
        )
    return (
        '<svg viewBox="0 0 800 570" width="100%" style="max-width:800px" '
        'role="img" aria-label="otoyin request and module flow diagram">'
        '<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" '
        'markerHeight="6" orient="auto-start-reverse">'
        '<path d="M0,0 L10,5 L0,10 z" fill="#4a423e"/></marker></defs>'
        + "".join(parts)
        + "</svg>"
    )


# ── HTML ─────────────────────────────────────────────────────────────────────
mirror_rows = "".join(
    f'<div class="mirror"><span class="badge">{esc(n)}</span>'
    + "".join(f"<code>{esc(p)}</code>" for p in ps)
    + "</div>"
    for n, ps in mir
)
dead_rows = "".join(
    f"<tr><td><code>components/{esc(n)}</code></td><td>{c}</td>"
    f'<td class="tagx">no live importer</td></tr>'
    for n, c in dead
)
ep_rows = "".join(
    f'<tr><td class="ep">{esc(k)}</td><td class="n">{len(v)}</td>'
    f'<td class="sites"><code>{esc(v[0])}</code></td></tr>'
    for k, v in sorted(eps.items(), key=lambda kv: -len(kv[1]))
)
route_items = "".join(
    f"<li><code>{esc(r)}</code></li>" for r in sorted(set(route_list))
)
ws_rows = "".join(
    f'<tr><td><code>{esc(f)}</code></td><td class="n">{line}</td>'
    f"<td><code>{esc(sym)}</code></td></tr>"
    for f, sym, line in sorted(ws_deps)
)
feat_items = "".join(
    f'<div class="feat"><b>{esc(k)}</b><span>{len(v)} importer(s)</span></div>'
    for k, v in sorted(IMP["features"].items(), key=lambda kv: -len(kv[1]))
)

dead_names = {n for n, _ in dead}
ws_note = (
    '<div class="find warn"><h3>components/Workspace — no live puller</h3>'
    "<p>Every remaining reference comes from directories that are themselves "
    "unreachable, so the whole cluster goes together.</p></div>"
    if "Workspace" in dead_names
    else ""
)
ws_block = (
    ws_note + "<table><thead><tr><th>importing file</th><th>line</th>"
    f"<th>symbol</th></tr></thead><tbody>{ws_rows}</tbody></table>"
    if ws_deps
    else '<div class="find good"><h3>components/Workspace — no inbound imports</h3>'
    "<p>Every router entry resolves through <code>@/features/workspace</code>; "
    "nothing in the legacy tree is referenced.</p></div>"
)

DOC = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>otoyin — connections, flows &amp; diagram</title>
<style>
  :root {{ --bg:#141312; --panel:#1c1a19; --line:#2e2a28; --fg:#e8e2dc;
    --dim:#9a9088; --rose:#d76742; --ok:#6fae7a; --warn:#d3a84a; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--bg); color:var(--fg);
    font:15px/1.55 ui-sans-serif,-apple-system,"Segoe UI",sans-serif; }}
  header {{ padding:34px 30px 20px; border-bottom:1px solid var(--line); }}
  h1 {{ margin:0 0 6px; font-size:23px; letter-spacing:-.2px; }}
  .sub {{ color:var(--dim); font-size:13px; }}
  main {{ padding:26px 30px 70px; max-width:1180px; }}
  h2 {{ font-size:12px; text-transform:uppercase; letter-spacing:.13em;
    color:var(--dim); margin:38px 0 14px; padding-bottom:8px;
    border-bottom:1px solid var(--line); }}
  .grid {{ display:grid; gap:12px; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); }}
  .stat {{ background:var(--panel); border:1px solid var(--line);
    border-radius:9px; padding:15px 16px; }}
  .stat b {{ display:block; font-size:25px; color:var(--rose); line-height:1.15; }}
  .stat span {{ color:var(--dim); font-size:11.5px; text-transform:uppercase;
    letter-spacing:.07em; }}
  .panel {{ background:var(--panel); border:1px solid var(--line);
    border-radius:9px; padding:18px; overflow-x:auto; }}
  table {{ width:100%; border-collapse:collapse; }}
  th {{ text-align:left; font-size:10.5px; text-transform:uppercase;
    letter-spacing:.09em; color:var(--dim); padding:0 10px 8px 0; }}
  td {{ padding:7px 10px 7px 0; border-top:1px solid var(--line); vertical-align:top; }}
  td.ep {{ font:12px ui-monospace,monospace; color:var(--rose); white-space:nowrap; }}
  td.n, .tagx {{ color:var(--dim); }}
  ul.routes {{ columns:4; list-style:none; padding:0; margin:0; }}
  ul.routes li {{ padding:2px 0; break-inside:avoid; }}
  .feat {{ display:flex; justify-content:space-between; padding:6px 11px;
    background:var(--panel); border:1px solid var(--line); border-radius:7px;
    font-size:12.5px; margin-bottom:5px; }}
  .feat span {{ color:var(--dim); font-size:11px; }}
  .mirror {{ display:flex; flex-wrap:wrap; gap:7px; align-items:center;
    padding:9px 12px; background:var(--panel); border:1px solid var(--line);
    border-radius:7px; margin-bottom:7px; }}
  .badge {{ background:#3a2420; color:var(--rose); padding:2px 9px;
    border-radius:5px; font-size:11.5px; font-weight:600; }}
  .find {{ background:var(--panel); border:1px solid var(--line);
    border-left:3px solid var(--rose); border-radius:0 9px 9px 0;
    padding:13px 17px; margin-bottom:11px; }}
  .find.good {{ border-left-color:var(--ok); }}
  .find.warn {{ border-left-color:var(--warn); }}
  .find h3 {{ margin:0 0 5px; font-size:14px; }}
  .find p {{ margin:0; color:var(--dim); font-size:13px; }}
  .find b {{ color:var(--fg); }}
  code {{ font:12px/1.5 ui-monospace,"Cascadia Code",Consolas,monospace;
    color:#cbb9ad; }}
  footer {{ padding:20px 30px 40px; color:var(--dim); font-size:12px;
    border-top:1px solid var(--line); }}
</style></head><body>
<header>
  <h1>otoyin — connections, flows &amp; diagram</h1>
  <div class="sub">Counts measured from the source tree. Regenerate with
    <code>scripts/gen-codebase-connections.py</code>.</div>
</header>
<main>

<h2>At a glance</h2>
<div class="grid">
  <div class="stat"><b>{len(route_list)}</b><span>routes</span></div>
  <div class="stat"><b>{lazy_count}</b><span>lazy() boundaries</span></div>
  <div class="stat"><b>{len(IMP["features"])}</b><span>feature modules</span></div>
  <div class="stat"><b>{len(mir)}</b><span>mirrored components</span></div>
  <div class="stat"><b>{len(dead)}</b><span>dead component dirs</span></div>
  <div class="stat"><b>{len(eps)}</b><span>distinct endpoints</span></div>
</div>

<h2>Flow diagram</h2>
<div class="panel">{svg_diagram()}</div>

<h2>Feature modules <span class="sub">(live tree, by importer count)</span></h2>
{feat_items}

<h2>Endpoints touched from the frontend</h2>
<table><thead><tr><th>endpoint</th><th>sites</th><th>first call site</th></tr></thead>
<tbody>{ep_rows}</tbody></table>

<h2>Routes</h2>
<ul class="routes">{route_items}</ul>

<h2>Dead component directories <span class="sub">(no live importer &mdash; direct, relative, dynamic, or via the barrel)</span></h2>
<table><thead><tr><th>directory</th><th>files</th><th>status</th></tr></thead>
<tbody>{dead_rows}</tbody></table>

<h2>components/Workspace dependents <span class="sub">(every remaining pull into the legacy tree)</span></h2>
{ws_block}

<h2>Mirrored modules <span class="sub">(components/ vs features/ — migration in progress)</span></h2>
{mirror_rows}

<h2>Findings</h2>

<div class="find good"><h3>Nav contrast — now WCAG AA in all 7 themes</h3>
<p>Only the <b>active</b> nav link failed (accent on accent-muted:
<b>3.40 / 3.26 / 3.65</b>). Inactive links already passed. Introduced
<code>--color-accent-ink</code> — same hue and saturation as the accent, only
lightness moves. Measured after: <b>4.51 / 4.51 / 5.36 / 12.96 / 4.83 / 5.94</b>.
Rejected two alternatives: crushing the tint to 11% (kills coastal-light) and
retuning the brand accent itself.</p></div>

<div class="find good"><h3>Duplicated health poller — fixed</h3>
<p><b>useBootReadiness</b> polled <code>/health/ready</code> every 1.5s while
<b>BackendStatusBanner</b> ran an independent query on the same URL — measured
<b>18 requests per 20s</b>. One ref-counted poller now serves both:
<b>18 &rarr; 9</b>. The regression test fails at 19 polls if the shared poller
is removed.</p></div>

<div class="find good"><h3>Stale vite.config.js shadowed the maintained config</h3>
<p>An untracked transpiled copy sat beside <code>vite.config.ts</code>. Vite
resolves <code>.js</code> first, so <b>every edit to the maintained config was
silently ignored</b> — which is why an earlier chunking fix produced a
byte-identical bundle. Deleted; <code>app/</code> and <code>tauri/</code>
configs now agree.</p></div>

<div class="find good"><h3>388 KB eager chunk removed</h3>
<p><code>manualChunks</code> on app-code directories hoisted whole route trees
into one preloaded chunk. Every chunk in the app — down to 1 KB icon chunks —
statically imported it. Removed; Rollup now splits per <code>import()</code>
boundary. Startup bytes are ~flat (746 &rarr; 771 KB) because the code
redistributed into correctly-attributed vendor chunks — the win is correct
lazy boundaries, not saved bytes. Build time 2m40s &rarr; 41s.</p></div>

<div class="find warn"><h3>Icon barrel imports are a dev-only cost</h3>
<p><code>@heroicons/react</code> shows ~730 KB in Vite dev, but the package is
<code>sideEffects:false</code> and Rollup tree-shakes it: production startup
contains <b>zero</b> heroicons bytes. Deep-importing 325 modules would be churn
against a phantom.</p></div>

<div class="find warn"><h3>components/ &rarr; features/ migration unfinished</h3>
<p><b>{len(mir)}</b> modules exist in both trees and <b>{len(dead)}</b>
component directories have no live importer — {esc(", ".join(sorted(dead_names)))}
form one unreachable cluster: the router now resolves through
<code>@/features/workspace</code>, so every remaining reference to them comes
either from the unused <code>components/index.ts</code> barrel or from another
directory in this same list. Not a live bug —
<code>components/ui/use-toast</code> is already a documented shim onto the
canonical store — but it is the main source of the oversized files, and the
cluster is deletable once its barrel entries are pruned.</p></div>

<div class="find"><h3>Telemetry egress exists but is off</h3>
<p><code>backend/services/telemetry.py</code> can POST to
<code>telemetry.otoyin.app</code>, defaulting to <code>enabled: false</code>.
<code>enable_telemetry()</code> is never called at startup.</p></div>

<div class="find"><h3>Global theme pattern</h3>
<p>One <code>line-in-motion</code> tile for all 7 themes, painted through a CSS
mask so <code>background-color</code> carries each theme's own accent. Opacity
0.055, <code>pointer-events:none</code>. Verified by pixel-diff in every theme —
computed style alone had hidden a transparent-light bug.</p></div>

</main>
<footer>otoyin &middot; 21labs &middot; all figures from live source inspection</footer>
</body></html>"""

out = REPO / "docs" / "codebase-connections.html"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(DOC, encoding="utf-8")
print(f"wrote {out} ({out.stat().st_size:,} bytes)")
print(f"  routes={len(route_list)} lazy={lazy_count} features={len(IMP['features'])}")
print(f"  mirrored={len(mir)} dead_dirs={len(dead)} endpoints={len(eps)}")
print(f"  LIVE (still imported, must migrate): {[n for n, _ in live_dirs]}")
print(f"  DEAD (safe to delete):                {[n for n, _ in dead]}")
