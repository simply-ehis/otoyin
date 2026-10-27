"""Zero-placeholder gate — bans TODO/FIXME/HACK/XXX in committed code.

This enforces AGENTS.md: "Zero placeholders — no TODOs, no stubs, no pass,
no // TODO, no NotImplementedError".  The only allowed XXX is the literal
``custom_token_XXX`` in ``orpheus_backend.py`` (an Orpheus TTS token pattern,
not a placeholder).

Run from the project root:
    python -m backend.scripts.check_placeholders
    pwsh bin/check.ps1   (step 8/10)
    just check-placeholders
    .githooks/pre-commit (step 6/8)

Exits 0 when clean, 1 when banned markers are found.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# Roots to scan with their subdirectories (project-relative, without venv/node_modules)
SCAN_ROOTS: dict[Path, set[str]] = {
    ROOT / "backend": {
        "agents",
        "backends",
        "mcp_server",
        "plugins",
        "routes",
        "scripts",
        "services",
        "tests",
        "utils",
    },
    ROOT / "app" / "src": {"components", "lib", "stores", "hooks", "test", "types", "utils"},
    ROOT / "landing": {"src", "scripts"},
    ROOT / "web": {"src", "scripts"},
}
SCAN_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".py"}
SKIP_DIRS = {
    "__pycache__",
    "venv",
    "node_modules",
    ".git",
    ".mypy_cache",
    ".ruff_cache",
    "build",
    "data",
    ".pytest_cache",
    "dist",
    "out",
    ".next",
}
BANNED_MARKERS = ("TODO", "FIXME", "PLACEHOLDER", "HACK")
ALLOWED_XXX_SUBSTR = "custom_token"  # orpheus_backend.py: <custom_token_XXX>


def scan() -> list[str]:
    bad: list[str] = []
    # This file itself documents the banned markers and must not self-flag
    _self = Path(__file__).resolve()
    for root, scan_dirs in SCAN_ROOTS.items():
        if not root.exists():
            continue
        for dir_name in scan_dirs:
            scan_dir = root / dir_name
            if not scan_dir.exists():
                continue
            for p in scan_dir.rglob("*"):
                if p.resolve() == _self:
                    continue
                if any(d in p.parts for d in SKIP_DIRS):
                    continue
                if p.suffix not in SCAN_SUFFIXES:
                    continue
                try:
                    text = p.read_text(encoding="utf-8", errors="ignore")
                except Exception:
                    continue
                rel = p.relative_to(ROOT)
                for i, line in enumerate(text.splitlines(), 1):
                    stripped = line.strip()
                    # Custom token pattern is allowed, everything else is banned
                    if "XXX" in line:
                        if ALLOWED_XXX_SUBSTR in line:
                            continue
                        bad.append(f"{rel}:{i}: {stripped[:120]} (banned XXX marker)")
                        continue
                    for marker in BANNED_MARKERS:
                        if marker in line:
                            # Allow doc examples inside STYLE_GUIDE / knowledge docs that literally show TODO syntax
                            if "STYLE_GUIDE" in str(p):
                                continue
                            bad.append(f"{rel}:{i}: {stripped[:120]}")
                            break
    return bad


def main() -> int:
    bad = scan()
    if bad:
        print(f"FAIL: {len(bad)} banned placeholder marker(s) found:")
        for b in bad[:30]:
            print(f"  {b}")
        if len(bad) > 30:
            print(f"  ... and {len(bad) - 30} more")
        print()
        print("Fix: remove TODO/FIXME/HACK/XXX comments or implement the missing code.")
        print("  Allowed: custom_token_XXX in backend/backends/orpheus_backend.py (token pattern)")
        return 1
    print("OK: no placeholder markers (TODO/FIXME/HACK/XXX)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
