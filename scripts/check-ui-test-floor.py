"""CI floor for prompt 14: every canonical primitive ships with a test.

Fails (exit 1) when any app/src/ui/*.tsx component is covered by no test:
either a colocated <name>.test.tsx(x), or any ui/*.test.* that references
the component name. Run: python scripts/check-ui-test-floor.py
"""

from __future__ import annotations

from pathlib import Path

UI_DIR = Path(__file__).resolve().parent.parent / "app" / "src" / "ui"


def test_corpus() -> str:
    corpus = []
    for pattern in ("*.test.tsx", "*.test.ts", "*.spec.tsx"):
        for test in UI_DIR.glob(pattern):
            try:
                corpus.append(test.read_text(encoding="utf-8", errors="replace"))
            except OSError:
                continue
    return "\n".join(corpus)


def main() -> int:
    corpus = test_corpus()
    missing = []
    count = 0
    for component in sorted(UI_DIR.glob("*.tsx")):
        if component.name.endswith((".test.tsx", ".spec.tsx")):
            continue
        count += 1
        colocated = (component.with_name(component.stem + ".test.tsx")).exists() or (
            component.with_name(component.stem + ".test.ts")
        ).exists()
        if not colocated and component.stem not in corpus:
            missing.append(component.name)
    if missing:
        print("ui/ components with no test coverage:")
        for name in missing:
            print(f"  NO_TEST  {name}")
        return 1
    print(f"ui/ test floor OK ({count} components)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
