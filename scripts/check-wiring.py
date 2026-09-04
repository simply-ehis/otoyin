"""Wiring guard (prompt 20): stranded backend endpoints + orphaned pages.

Usage: python scripts/check-wiring.py [--strict]
- (a) diffs FastAPI OpenAPI paths against endpoint literals in
      app/src/lib/api/*.ts; prints backend routes no client calls.
- (b) diffs page components (features/**/xidPage.tsx, layouts/*.tsx)
      against imports in app/src/router.tsx; prints pages the router
      never references.

Exit 1 in --strict mode when either list is non-empty (CI gate).
Heuristic on purpose: string-literal matching, not a TS parser.
Whitelist genuinely client-less routes (webhooks, MCP, SSE internals)
in STRANDED_ALLOWLIST with a one-line reason.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

STRANDED_ALLOWLIST = {
    "/mcp": "MCP transport, not a UI call",
    "/webhook": "provider webhook, not a UI call",
    "/openapi.json": "schema doc, not a UI call",
    "/docs": "swagger UI, not a UI call",
}

LITERAL_RE = re.compile(r"""['"`](\/[^'"`\n]*)['"`]""")
TEMPLATE_EXPR_RE = re.compile(r"\$\{[^}]*\}")


def normalize_pattern(text: str) -> list[str]:
    """Split a URL/path into segments; {x} and ${x} both become '*'."""
    text = TEMPLATE_EXPR_RE.sub("{p}", text).split("?")[0]
    segs = []
    for raw in text.strip("/").split("/"):
        # Truncate nested-template fragments: 'events${qs ? `' -> 'events'
        clean = re.split(r"[$\s]", raw, maxsplit=1)[0]
        segs.append("*" if clean.startswith("{") and clean.endswith("}") else clean)
    return [s for s in segs if s]


def segments_match(open_segs: list[str], lit_segs: list[str]) -> bool:
    # Literal matches when every literal segment equals the OpenAPI segment
    # or is a wildcard, for all literal segments (clients often compose
    # `${base}/subpath` across statements — prefix match is the signal).
    if len(lit_segs) > len(open_segs):
        return False
    return all(l == "*" or l == o for l, o in zip(lit_segs, open_segs))


def openapi_paths() -> list[str]:
    from backend.main import app

    schema = app.openapi()
    return sorted(schema.get("paths", {}).keys())


API_DIR = ROOT / "app" / "src" / "lib" / "api"
# Any .ts/.tsx outside lib/api that references a backend path is a
# hand-rolled caller: works today, but bypasses the typed client layer.
HANDROLLED_DIRS = ["components", "hooks", "stores", "features", "layouts", "platform"]


def collect_literals(base: Path, glob: str) -> set[str]:
    lits: set[str] = set()
    for ts in base.glob(glob):
        try:
            lits.update(
                LITERAL_RE.findall(ts.read_text(encoding="utf-8", errors="replace"))
            )
        except OSError:
            continue
    return lits


def client_literals() -> set[str]:
    return collect_literals(API_DIR, "*.ts")


def handrolled_literals() -> set[str]:
    lits: set[str] = set()
    src = ROOT / "app" / "src"
    for folder in HANDROLLED_DIRS:
        base = src / folder
        if base.exists():
            lits.update(collect_literals(base, "**/*.ts"))
            lits.update(collect_literals(base, "**/*.tsx"))
    return lits


def find_stranded() -> tuple[list[str], list[str]]:
    """Returns (stranded-nowhere, called-only-outside-client-layer)."""
    canonical = [normalize_pattern(l) for l in client_literals()]
    hand = [normalize_pattern(l) for l in handrolled_literals()]
    canonical = [p for p in canonical if p]
    hand = [p for p in hand if p]
    stranded, handrolled_only = [], []
    for path in openapi_paths():
        if any(k in path for k in STRANDED_ALLOWLIST):
            continue
        open_segs = normalize_pattern(path)
        if any(segments_match(open_segs, lit) for lit in canonical):
            continue
        if any(segments_match(open_segs, lit) for lit in hand):
            handrolled_only.append(path)
        else:
            stranded.append(path)
    return stranded, handrolled_only


def find_orphaned_pages() -> tuple[list[str], list[str]]:
    """Returns (imported-nowhere, pages-not-in-router).

    Tier 1 is a strong signal (dead file). Tier 2 is advisory: page-like
    files the router doesn't reference yet — expected mid-rebuild (03).
    """
    sources = {}
    for tsx in (ROOT / "app" / "src").rglob("*.tsx"):
        if tsx.name.endswith((".test.tsx", ".spec.tsx")):
            continue
        try:
            sources[str(tsx.relative_to(ROOT))] = tsx.read_text(
                encoding="utf-8", errors="replace"
            )
        except OSError:
            continue
    router = sources.get("app/src/router.tsx", "")
    nowhere, not_in_router = [], []
    for folder in ("features", "layouts"):
        base = ROOT / "app" / "src" / folder
        if not base.exists():
            continue
        for tsx in base.rglob("*.tsx"):
            if tsx.name.endswith((".test.tsx", ".spec.tsx")):
                continue
            rel = str(tsx.relative_to(ROOT))
            stem = tsx.stem
            referenced = any(
                stem in text or tsx.name in text
                for path, text in sources.items()
                if path != rel.replace("\\", "/") and path != rel
            )
            if not referenced:
                nowhere.append(rel)
            elif stem not in router and tsx.name not in router:
                not_in_router.append(rel)
    return nowhere, not_in_router


def main() -> int:
    stranded, handrolled_only = find_stranded()
    nowhere, not_in_router = find_orphaned_pages()
    print(f"OpenAPI paths: {len(openapi_paths())}")
    print("NOTE: route modules that fail to import in this env (see backend")
    print("stderr, e.g. missing sse_starlette/jsonschema) are absent above;")
    print("install backend/requirements.txt fully before treating this as final.")
    print(f"Stranded endpoints — no UI caller anywhere ({len(stranded)}):")
    for p in stranded:
        print(f"  STRANDED  {p}")
    print(
        f"Hand-rolled callers outside lib/api — move into client layer ({len(handrolled_only)}):"
    )
    for p in handrolled_only:
        print(f"  HANDROLLED  {p}")
    print(f"Imported nowhere ({len(nowhere)}):")
    for p in nowhere:
        print(f"  ORPHANED  {p}")
    print(f"Not referenced by router ({len(not_in_router)}, advisory mid-rebuild):")
    for p in not_in_router:
        print(f"  UNWIRED   {p}")
    if "--strict" in sys.argv and (stranded or nowhere or handrolled_only):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
