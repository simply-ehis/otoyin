"""i18n parity guard: every locale mirrors the en key structure.

Usage: python scripts/check-i18n-parity.py [--strict]
- Flattens each locales/<code>/translation.json to dotted key paths.
- Reports per locale: keys missing vs en (fall back to English at
  runtime — the translation backlog) and keys absent from en (orphans).
- Checks the sidebar trap: more than one `sidebar` object at any depth.
Exit 1 in --strict mode when any locale is missing keys or has orphans.
New locales ship as en-valued structural mirrors (marked
__needs_review) so parity holds while human review is pending.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

LOCALES_DIR = (
    Path(__file__).resolve().parent.parent / "app" / "src" / "i18n" / "locales"
)
SOURCE = "en"
# Structural metadata, not a UI string — excluded from parity.
IGNORED = {"_meta"}


def flatten(obj: dict, prefix: str = "") -> set[str]:
    keys: set[str] = set()
    for key, value in obj.items():
        if key in IGNORED:
            continue
        path = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            keys.update(flatten(value, path))
        else:
            keys.add(path)
    return keys


def sidebar_objects(obj: dict, prefix: str = "") -> list[str]:
    found = []
    for key, value in obj.items():
        path = f"{prefix}.{key}" if prefix else key
        if key == "sidebar" and isinstance(value, dict):
            found.append(path or "sidebar")
        if isinstance(value, dict):
            found.extend(sidebar_objects(value, path))
    return found


def load(code: str) -> dict:
    path = LOCALES_DIR / code / "translation.json"
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    codes = sorted(
        p.name
        for p in LOCALES_DIR.iterdir()
        if p.is_dir() and (p / "translation.json").exists()
    )
    if SOURCE not in codes:
        print("FATAL: en/translation.json missing")
        return 1
    source_keys = flatten(load(SOURCE))
    print(f"en keys: {len(source_keys)} | locales: {', '.join(codes)}")
    problems = 0
    for code in codes:
        if code == SOURCE:
            continue
        keys = flatten(load(code))
        missing = sorted(source_keys - keys)
        orphaned = sorted(keys - source_keys)
        sidebars = sidebar_objects(load(code))
        top = [s for s in sidebars if s == "sidebar"]
        namespaced = sorted(s for s in sidebars if s != "sidebar")
        print(
            f"[{code}] keys={len(keys)} missing={len(missing)} orphaned={len(orphaned)} top_sidebar={len(top)}"
        )
        if namespaced:
            print(f"  namespaced sidebars (ok): {', '.join(namespaced)}")
        for key in missing:
            print(f"  MISSING   {code}.{key}")
        for key in orphaned:
            print(f"  ORPHANED  {code}.{key}")
        if len(top) != 1:
            print(
                f"  SIDEBAR-TRAP  {code}: top-level sidebar count is {len(top)}, want 1"
            )
            problems += 1
        problems += len(missing) + len(orphaned)
    if "--strict" in sys.argv and problems:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
