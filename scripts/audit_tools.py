"""Audit: every tool-registry endpoint must exist in the FastAPI app."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app import app  # noqa: E402 — builds full route table
from backend.tool_registry import TR  # noqa: E402
from backend.tool_registry_populate import populate  # noqa: E402

populate()

# Collect real routes as {(path, method)}, unwrapping _IncludedRouter wrappers
real_routes: set[tuple[str, str]] = set()

def collect(routes) -> None:
    for route in routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", None)
        if type(route).__name__ == "_IncludedRouter":
            collect(route.original_router.routes)  # unwrap lazy router wrapper
            continue
        if path:
            for m in methods or {"GET"}:
                real_routes.add((path, m.upper()))

collect(app.routes)

missing = []
for name, tool in sorted(TR._tools.items()):
    if not tool.endpoint:
        continue
    ep = tool.endpoint.rstrip("/") or "/"
    method = (tool.method or "POST").upper()
    # exact match, then trailing-slash variants
    if (ep, method) in real_routes:
        continue
    if (ep + "/", method) in real_routes:
        continue
    if ("/" + ep.lstrip("/"), method) in real_routes and ep.startswith("/"):
        continue
    missing.append(f"{name}: {method} {tool.endpoint} NOT FOUND in routes")

print(f"Registry tools: {len(TR._tools)}")
print(f"With endpoints: {len([t for t in TR._tools.values() if t.endpoint])}")
print(f"\n=== TOOLS POINTING TO MISSING ENDPOINTS ({len(missing)}) ===")
for m in missing[:50]:
    print(" ", m)

reg_errors = TR.validate()
print(f"\n=== REGISTRY VALIDATE ERRORS ({len(reg_errors)}) ===")
for e in reg_errors[:20]:
    print(" ", e)

if not missing and not reg_errors:
    print("\nAll tool endpoints resolve.")
