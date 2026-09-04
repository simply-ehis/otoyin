"""Build new-locale mirrors from the en source file.

Usage: python scripts/build-locale-mirrors.py [code ...]
Rebuilds app/src/i18n/locales/<code>/translation.json for locales that
have no human translation yet: full en key structure with en values plus
a top-level _meta marker (ignored by check-i18n-parity.py). i18next shows
English until a reviewer replaces values — never unreviewed machine
translation. Re-run after en gains keys; existing human-translated values
in OTHER locales (ja/zh-*) are never touched by this script.

Review workflow: pick a file, replace en values with real translations,
delete nothing, then remove the _meta block and record the reviewer in
docs/reports/2026-09-04-i18n-review-log.md.
"""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

LOCALES_DIR = (
    Path(__file__).resolve().parent.parent / "app" / "src" / "i18n" / "locales"
)

NEW_LOCALES = ("es", "fr", "de", "pt-BR", "ko")


def build(code: str) -> Path:
    source = json.loads(
        (LOCALES_DIR / "en" / "translation.json").read_text(encoding="utf-8")
    )
    mirror = copy.deepcopy(source)
    mirror["_meta"] = {
        "source": "en",
        "status": "needs-human-review",
        "note": "Structural mirror of en with English values. Replace values with reviewed translations; do not machine-translate and call it done.",
    }
    # _meta first for visibility.
    ordered = {"_meta": mirror.pop("_meta"), **mirror}
    out = LOCALES_DIR / code / "translation.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(ordered, ensure_ascii=False, indent="\t") + "\n", encoding="utf-8"
    )
    return out


def main() -> int:
    codes = sys.argv[1:] or list(NEW_LOCALES)
    for code in codes:
        print(f"wrote {build(code)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
