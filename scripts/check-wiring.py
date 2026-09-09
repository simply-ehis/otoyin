"""Wiring guard (prompt 20): stranded backend endpoints + orphaned pages.

Usage: python scripts/check-wiring.py [--strict | --strict-all | --self-test]
- (a) diffs FastAPI OpenAPI paths against endpoint literals in
      app/src/lib/api/*.ts; prints backend routes no client calls.
- (b) diffs page components (features/**/xidPage.tsx, layouts/*.tsx)
      against imports in app/src/router.tsx; prints pages the router
      never references.

Exit 1 in --strict mode when orphaned pages or hand-rolled callers exist
(CI gate — stranded endpoints are advisory mid-rebuild).
Exit 1 in --strict-all mode when ANY violations exist (including stranded).
--self-test runs internal verification checks.
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


def segments_match(
    open_segs: list[str], lit_segs: list[str], full: bool = False
) -> bool:
    # Literal matches when every literal segment equals the OpenAPI segment
    # or is a wildcard, for all literal segments (clients often compose
    # `${base}/subpath` across statements — prefix match is the signal).
    # full=True requires equal length (for hand-rolled detection, so a
    # frontend ROUTE like "/voice-changer" can't match "/voice-changer/x").
    if len(lit_segs) > len(open_segs):
        return False
    if full and len(lit_segs) != len(open_segs):
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
        if any(segments_match(open_segs, lit, full=True) for lit in hand):
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
            # Normalize to forward slashes for cross-platform matching
            rel = str(tsx.relative_to(ROOT)).replace("\\", "/")
            sources[rel] = tsx.read_text(encoding="utf-8", errors="replace")
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


def self_test() -> int:
    """Deliberate catch-test for both failure modes (prompt 20, unit 3).

    Test 1 writes a temporary page component that nothing imports and
    asserts orphan/UNWIRED classification catches it. Tests 2-4 inject a
    CONTROLLED OpenAPI surface (via monkeypatching ``openapi_paths``) with
    one uncalled route, one route a client calls, and one allowlisted
    route — asserting each lands in the right bucket. Deterministic by
    construction: no dependence on the mid-flight tree's stranded count.
    """

    print("=== Self-test: verifying wiring detection ===")
    passed = 0
    failed = 0

    # Test 1: orphaned component detection (deliberate file on disk)
    selftest_dir = ROOT / "app" / "src" / "features" / "_selftest"
    selftest_file = selftest_dir / "OrphanTest.tsx"
    try:
        selftest_dir.mkdir(parents=True, exist_ok=True)
        selftest_file.write_text(
            "export function OrphanTest() { return <div>self-test</div>; }\n",
            encoding="utf-8",
        )
        nowhere, not_in_router = find_orphaned_pages()
        # A never-imported page must land in tier 1 (ORPHANED/dead file) or,
        # if something references it, at least tier 2 (UNWIRED).
        caught = any("OrphanTest" in p for p in nowhere) or any(
            "OrphanTest" in p for p in not_in_router
        )
        if caught:
            print("  PASS  orphan detection — temporary file caught")
            passed += 1
        else:
            print("  FAIL  orphan detection — temporary file NOT caught")
            failed += 1
    finally:
        # Clean up
        if selftest_file.exists():
            selftest_file.unlink()
        if selftest_dir.exists():
            try:
                selftest_dir.rmdir()
            except OSError:
                pass

    # Tests 2-4: deliberate stranded classification against a controlled
    # route list (real detection machinery, synthetic inputs — deterministic,
    # independent of the mid-flight tree's stranded count).
    orig_openapi = globals()["openapi_paths"]
    orig_client = globals()["client_literals"]
    try:
        globals()["openapi_paths"] = lambda: [
            "/deliberate/strapped/route",  # no caller anywhere -> STRANDED
            "/deliberate/covered/route",  # client layer calls it -> clean
            "/mcp/deliberate/route",  # allowlisted -> never flagged
        ]
        globals()["client_literals"] = lambda: {"/deliberate/covered"}
        stranded, handrolled_only = find_stranded()

        if "/deliberate/strapped/route" in stranded:
            print("  PASS  stranded detection — deliberate uncalled route caught")
            passed += 1
        else:
            print("  FAIL  stranded detection — deliberate uncalled route missed")
            failed += 1

        if (
            "/deliberate/covered/route" not in stranded
            and "/deliberate/covered/route" not in handrolled_only
        ):
            print("  PASS  client-covered route — deliberate caller recognized")
            passed += 1
        else:
            print("  FAIL  client-covered route — flagged despite a client caller")
            failed += 1

        if "/mcp/deliberate/route" not in stranded:
            print("  PASS  allowlist — deliberately allowlisted route excluded")
            passed += 1
        else:
            print("  FAIL  allowlist — allowlisted route incorrectly flagged")
            failed += 1
    finally:
        globals()["openapi_paths"] = orig_openapi
        globals()["client_literals"] = orig_client

    print(f"=== Self-test: {passed} passed, {failed} failed ===")
    return 0 if failed == 0 else 1


def main() -> int:
    if "--self-test" in sys.argv:
        return self_test()
    stranded, handrolled_only = find_stranded()
    nowhere, not_in_router = find_orphaned_pages()
    print(f"OpenAPI paths: {len(openapi_paths())}")
    print("HOW TO READ THIS: the frontend rebuild (03) is mid-flight — new")
    print("screens exist but router.tsx still points at the old tree. STRANDED")
    print("mostly means 'UI not rebuilt yet', NOT 'dead backend'. Re-run as")
    print("screens land; the stranded count should fall toward the allowlisted")
    print("remainder (webhooks/MCP/schema). HANDROLLED = works today but")
    print("bypasses lib/api — move into the client layer per prompt 20.")
    print("ORPHANED = imported nowhere (real). UNWIRED = not in router yet")
    print("(expected until REBUILD_LOG step 2 lands).")
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
    if "--strict" in sys.argv and (nowhere or handrolled_only):
        return 1
    if "--strict-all" in sys.argv and (stranded or nowhere or handrolled_only):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
