"""Fill missing i18n keys in non-English locales with English values.

Reads en/translation.json, finds every missing dotted key path in each
locale, unflattens the English values back into the locale's nested dict,
and writes the updated file preserving existing content and tab formatting.
"""

from __future__ import annotations

import json
from pathlib import Path

LOCALES_DIR = (
    Path(__file__).resolve().parent.parent / "app" / "src" / "i18n" / "locales"
)
SOURCE = "en"
IGNORED = {"_meta"}
LOCALES = ["de", "es", "fr", "ja", "ko", "pt-BR", "zh-CN", "zh-TW"]


def flatten(obj: dict, prefix: str = "") -> dict[str, object]:
    """Flatten nested dict to {dotted.path: value}."""
    result: dict[str, object] = {}
    for key, value in obj.items():
        if key in IGNORED:
            continue
        path = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            result.update(flatten(value, path))
        else:
            result[path] = value
    return result


def unflatten(dotted: dict[str, object]) -> dict:
    """Unflatten {dotted.path: value} back to nested dict."""
    root: dict = {}
    for path, value in dotted.items():
        parts = path.split(".")
        current = root
        for part in parts[:-1]:
            current = current.setdefault(part, {})
        current[parts[-1]] = value
    return root


def deep_merge(base: dict, overlay: dict) -> dict:
    """Merge overlay into base, returning a new dict. Overlay wins on conflicts."""
    result = dict(base)
    for key, value in overlay.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def main() -> None:
    en_data = json.loads(
        (LOCALES_DIR / SOURCE / "translation.json").read_text(encoding="utf-8")
    )
    en_flat = flatten(en_data)

    summary: dict[str, int] = {}

    for code in LOCALES:
        locale_path = LOCALES_DIR / code / "translation.json"
        if not locale_path.exists():
            print(f"[{code}] file not found, skipping")
            continue

        locale_data = json.loads(locale_path.read_text(encoding="utf-8"))
        locale_flat = flatten(locale_data)

        missing_keys = sorted(set(en_flat) - set(locale_flat))
        if not missing_keys:
            print(f"[{code}] fully in parity — 0 missing keys")
            summary[code] = 0
            continue

        # Build the English values for the missing keys, unflatten them
        missing_en = {k: en_flat[k] for k in missing_keys}
        missing_nested = unflatten(missing_en)

        # Deep-merge into existing locale data (locale wins for existing keys)
        merged = deep_merge(locale_data, missing_nested)

        # Write back with same formatting (tab-indented, trailing newline)
        locale_path.write_text(
            json.dumps(merged, indent="\t", ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"[{code}] added {len(missing_keys)} missing keys")
        summary[code] = len(missing_keys)

    print("\n--- Summary ---")
    total = 0
    for code in LOCALES:
        n = summary.get(code, 0)
        total += n
        print(f"  {code}: +{n}")
    print(f"  total keys added: {total}")


if __name__ == "__main__":
    main()
