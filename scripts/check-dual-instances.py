#!/usr/bin/env python3
"""Dual-instance hazard gate: prevents the toast-bug class from recurring.

The bug class: a module holding module-scope mutable state (listeners, caches,
counters) that exists as two importable files with the same stem in different
directories (e.g. `@/ui/use-toast` vs `@/components/ui/use-toast`). Each copy
gets its own state, so writes through one path are invisible to readers of the
other — the updater toast rendered into a viewport nobody mounted.

This gate fails when:
  1. a file carrying module-scope mutable state has a same-stem twin anywhere
     under app/src (the exact shape of the toast bug), or
  2. a single source file imports the same logical module through two
     different specifiers that resolve to different files (a latent mixed
     wiring), or
  3. two files in ui/ vs components/ui/ both define a store-like module
     (create / createStore / useSyncExternalStore) with the same stem, or
  4. a components/ui file sharing a stem with a ui/ module is neither a pure
     re-export shim nor on the FROZEN_TWINS allowlist (a forked primitive that
     silently diverges from the canonical design system), or
  5. a file OUTSIDE app/src/components/ imports a legacy `@/components/ui/*`
     path (new-tree code must import the canonical `@/ui/*` primitive).

Shims are recognized: a same-stem twin whose entire content is re-exports of
its canonical sibling (`export * from "@/ui/..."`) is the *remedy*, not a
hazard, and is allowed.

Exit 0 = clean, 1 = hazard found. Whole-tree scan (fast, ~1s); run in the
pre-commit gate and CI.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP_SRC = ROOT / "app" / "src"

STATEFUL_RE = re.compile(r"^let\s+[A-Za-z_$][\w$]*", re.MULTILINE)
LISTENERS_RE = re.compile(r"^(const|let)\s+(listeners|subscribers)\s*=", re.MULTILINE)
STORE_LIKE_RE = re.compile(r"\bcreate(?:Store)?\s*[<(]|\buseSyncExternalStore\b")
IMPORT_RE = re.compile(
    r"""(?:import|export)\s+(?:type\s+)?[\w*{},\s$]*?from\s*["']([^"']+)["']"""
    r"""|^\s*import\s+["']([^"']+)["']""",
    re.MULTILINE,
)
SHIM_RE = re.compile(r'^export\s+\*\s+from\s+["\']@/[\w/.-]+["\'];?\s*$', re.MULTILINE)

# Resolution roots for import specifiers (vite-tsconfig-paths style aliases).
ALIASES = {"@/": "src/", "~/": "src/"}
EXTS = ("", ".ts", ".tsx", "/index.ts", "/index.tsx")


def strip_comments(text: str) -> str:
    """Remove // line comments and /* */ block comments (crude but sound for
    these regexes: no string-literal awareness needed for `let x` patterns)."""
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
    return re.sub(r"//[^\n]*", "", text)


def is_shim(text: str) -> bool:
    """True when the file is only comments + bare re-exports of the canonical tree."""
    body = strip_comments(text).strip()
    if not body:
        return False
    exports = SHIM_RE.findall(body)
    if not exports:
        return False
    remainder = SHIM_RE.sub("", body).strip()
    return remainder == ""


def resolve(spec: str, importer: Path) -> Path | None:
    """Resolve an import specifier to a file under app/, or None (bare pkg)."""
    if spec.startswith(("@/", "~/")):
        base = APP_SRC.parent / "src" / spec[2:]
    elif spec.startswith("."):
        base = importer.parent / spec
    else:
        return None
    for ext in EXTS:
        cand = Path(str(base) + ext)
        if cand.is_file():
            return cand
    return None


def norm(p: Path, root: Path = ROOT) -> str:
    """Repo-relative posix path (stable across OSes and matchable in allowlists)."""
    try:
        return p.relative_to(root).as_posix().replace("\\", "/")
    except ValueError:
        return p.as_posix().replace("\\", "/")


def scan(root: Path = ROOT) -> list[str]:
    src = root / "app" / "src"
    if not src.is_dir():
        return [f"error: {src} not found"]
    files = sorted(p for p in src.rglob("*") if p.suffix in (".ts", ".tsx"))

    # Pass 1: classify files.
    stateful: set[Path] = set()
    store_like: set[Path] = set()
    texts: dict[Path, str] = {}
    for p in files:
        t = p.read_text(encoding="utf-8", errors="replace")
        texts[p] = t
        body = strip_comments(t)
        if STATEFUL_RE.search(body) or LISTENERS_RE.search(body):
            stateful.add(p)
        if STORE_LIKE_RE.search(body):
            store_like.add(p)

    hazards: list[str] = []

    # Hazard 1: stateful file with a same-stem twin (the toast-bug shape),
    # unless the twin (or the file itself) is a shim of the other.
    by_stem: dict[str, list[Path]] = {}
    for p in files:
        by_stem.setdefault(p.stem, []).append(p)
    for p in sorted(stateful):
        twins = [t for t in by_stem.get(p.stem, []) if t != p]
        real_twins = [t for t in twins if not (is_shim(texts[t]) or is_shim(texts[p]))]
        for t in real_twins:
            hazards.append(
                f"stateful module {norm(p)} has a non-shim same-stem twin {norm(t)} "
                "(dual-instance hazard — unify on one module; shims are allowed)"
            )

    # Hazard 1b: store-like files with same-stem twins (same rule, broader net).
    for p in sorted(store_like):
        for t in by_stem.get(p.stem, []):
            if t == p or is_shim(texts[t]) or is_shim(texts[p]):
                continue
            hazards.append(
                f"store-like module {norm(p)} has a non-shim same-stem twin {norm(t)} "
                "(two live store definitions)"
            )

    # Hazard 2: one file importing the same logical module via two specifiers
    # that resolve to DIFFERENT files (mixed wiring).
    for p in files:
        resolved: dict[Path, str] = {}
        for m in IMPORT_RE.finditer(texts[p]):
            spec = m.group(1) or m.group(2) or ""
            target = resolve(spec, p)
            if target is not None:
                prev = resolved.setdefault(target, spec)
                if prev != spec:
                    hazards.append(
                        f"{norm(p)} imports the same module via two specifiers "
                        f"({prev!r}, {spec!r}) resolving to different files"
                    )

    # Hazard 3: cross-tree import of a logical twin pair inside one file
    # (e.g. both `@/ui/x` and `@/components/ui/x` in the same importer).
    # ALLOWLIST: tests that deliberately import both specifiers to pin store
    # identity (proving the shim resolves to the canonical store). Keep this
    # list short and justified — every entry is a place the hazard exists
    # on purpose.
    ALLOWED_SPLIT_BRAIN = {
        "app/src/hooks/useAutoUpdater.test.tsx": "pins legacy shim → canonical store identity",
    }
    for p in files:
        specs = {m.group(1) or m.group(2) or "" for m in IMPORT_RE.finditer(texts[p])}
        stems: dict[str, set[str]] = {}
        for s in specs:
            if s.startswith("@/"):
                m = re.match(r"@/(?:components/)?ui/([\w-]+)$", s)
                if m:
                    stems.setdefault(m.group(1), set()).add(s)
        rel_p = norm(p, root)
        for stem, group in stems.items():
            if len(group) > 1 and rel_p not in ALLOWED_SPLIT_BRAIN:
                hazards.append(
                    f"{rel_p} imports both ui-trees for {stem!r} ({sorted(group)}) "
                    "— split-brain import"
                )

    # Hazard 4: twin freeze — a components/ui file sharing a stem with a ui/
    # module must be a pure re-export shim or on the frozen allowlist. Frozen
    # = live legacy implementation still imported by old-tree screens; it gets
    # deleted when the last screen ports to the canonical primitive (03).
    FROZEN_TWINS = {
        "button",
        "card",
        "code-console",
        "dialog",
        "dropdown-menu",
        "form",
        "input",
        "popover",
        "select",
        "slider",
        "tabs",
        "toggle",
        "tooltip",
    }
    ui_dir = src / "ui"
    legacy_ui = src / "components" / "ui"
    if ui_dir.is_dir() and legacy_ui.is_dir():
        canonical_stems = {p.stem for p in ui_dir.glob("*.ts*")}
        for p in sorted(legacy_ui.glob("*.ts*")):
            if p.suffix == ".test.tsx" or ".test." in p.name:
                continue
            if (
                p.stem in canonical_stems
                and p.stem not in FROZEN_TWINS
                and not is_shim(texts[p])
            ):
                hazards.append(
                    f"legacy twin {norm(p)} forks canonical @/ui/{p.stem} — "
                    "make it a pure re-export shim, list it in FROZEN_TWINS "
                    "(old-tree screens still porting), or delete it"
                )

    # Hazard 5: new-tree import pin — files outside app/src/components/ must
    # import canonical primitives, never the legacy tree. ALLOWLIST: tests
    # that pin shim→canonical identity on purpose.
    ALLOWED_NEW_TREE_LEGACY = {
        "app/src/hooks/useAutoUpdater.test.tsx": "pins legacy shim → canonical store identity",
    }
    for p in files:
        rel_p = norm(p, root)
        if rel_p.startswith("app/src/components/"):
            continue
        if rel_p in ALLOWED_NEW_TREE_LEGACY:
            continue
        for m in IMPORT_RE.finditer(texts[p]):
            spec = m.group(1) or m.group(2) or ""
            lm = re.match(r"@/components/ui/([\w-]+)$", spec)
            if lm:
                hazards.append(
                    f"{rel_p} imports legacy @/components/ui/{lm.group(1)} — "
                    "new-tree code imports the canonical @/ui/ primitive"
                )

    return hazards


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", type=Path, default=ROOT, help="repo root (for tests)")
    args = parser.parse_args(argv)
    hazards = scan(args.root)
    if hazards:
        for h in hazards:
            print(f"  HAZARD  {h}", file=sys.stderr)
        print(
            f"{len(hazards)} dual-instance hazard(s) — see docs/knowledge/79-encoding-repairs.md sibling: the toast-store unification",
            file=sys.stderr,
        )
        return 1
    print("  OK     no dual-instance hazards (stateful twins / split imports)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
