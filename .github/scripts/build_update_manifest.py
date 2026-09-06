#!/usr/bin/env python3
"""Build the Tauri updater ``latest.json`` static manifest for a GitHub release.

Tauri's updater plugin is configured with a single static endpoint
(``https://github.com/<repo>/releases/latest/download/latest.json``). This
script inspects the artifacts produced by ``tauri build`` (with
``createUpdaterArtifacts: true`` and updater signing enabled) and writes a
static manifest pointing each platform at its installer + signature.

The build workflow uploads one artifact per matrix leg under a directory named
after the Rust target triple (``tauri-<triple>``). Installers are renamed with
a ``<triple>-`` prefix during the release job so two macOS legs (arm64 + Intel)
never collide on the same ``.app.tar.gz`` basename. Matching here is therefore
triple-scoped: each platform key maps to the triple its artifacts were built
under, and the basename prefix identifies which leg a file came from.

Usage (run by .github/workflows/build.yml release job):
    python .github/scripts/build_update_manifest.py ARTIFACTS_DIR

Env:
    GITHUB_REPOSITORY   e.g. 21-labs/21-labs
    GITHUB_REF_NAME     the tag, e.g. v0.2.0
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

BASE = "https://github.com/{repo}/releases/download/{tag}/{filename}"

# Tauri updater platform key -> (Rust target triple, installer suffix patterns).
# ``createUpdaterArtifacts: true`` makes Tauri emit NSIS ``-setup.exe`` on
# Windows, ``.app.tar.gz`` on macOS, and ``.AppImage`` on Linux, each with a
# matching ``.sig`` sidecar. The darwin-* / aarch64 keys exist so the matrix
# rows they belong to only need uncommenting in build.yml to go live.
INSTALLERS: dict[str, tuple[str, tuple[str, ...]]] = {
    "windows-x86_64": ("x86_64-pc-windows-msvc", ("setup.exe",)),
    "windows-aarch64": ("aarch64-pc-windows-msvc", ("setup.exe",)),
    "darwin-aarch64": ("aarch64-apple-darwin", (".app.tar.gz",)),
    "darwin-x86_64": ("x86_64-apple-darwin", (".app.tar.gz",)),
    "linux-x86_64": ("x86_64-unknown-linux-gnu", (".AppImage",)),
    "linux-aarch64": ("aarch64-unknown-linux-gnu", (".AppImage",)),
}


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: build_update_manifest.py ARTIFACTS_DIR", file=sys.stderr)
        return 2

    repo = _env("GITHUB_REPOSITORY")
    tag = _env("GITHUB_REF_NAME")

    artifacts = Path(sys.argv[1])
    files = [p for p in artifacts.rglob("*") if p.is_file()]

    platforms: dict[str, dict] = {}
    for platform_key, (triple, suffixes) in INSTALLERS.items():
        # Files were renamed to "<triple>-<original-name>" in the release job.
        leg_files = [f for f in files if f.name.startswith(f"{triple}-")]
        installer = _pick(leg_files, suffixes)
        if installer is None:
            # Leg not part of this build (e.g. ARM rows still commented out).
            print(
                f"skipping {platform_key}: no {triple} artifacts present",
                file=sys.stderr,
            )
            continue

        sig = installer.with_name(installer.name + ".sig")
        if not sig.exists():
            print(f"error: missing signature {sig.name} — is TAURI_SIGNING_PRIVATE_KEY set?", file=sys.stderr)
            return 1

        platforms[platform_key] = {
            "url": BASE.format(repo=repo, tag=quote(tag), filename=quote(installer.name)),
            "signature": sig.read_text().strip(),
        }

    if not platforms:
        print("error: no updatable artifacts found", file=sys.stderr)
        return 1

    manifest = {
        "version": _conf_version().lstrip("v"),
        "notes": "See the GitHub release for details.",
        "pub_date": datetime.now(timezone.utc).isoformat(),
        "platforms": platforms,
    }

    out = artifacts / "latest.json"
    out.write_text(json.dumps(manifest, indent=2))
    print(f"wrote {out} with platforms: {', '.join(sorted(platforms))}")
    return 0


def _pick(leg_files: list[Path], suffixes: tuple[str, ...]) -> Path | None:
    """Return the installer for this leg: prefer NSIS over MSI, exact over loose."""
    candidates = sorted(leg_files)
    for suffix in suffixes:
        matches = [f for f in candidates if f.name.endswith(suffix) and not f.name.endswith(suffix + ".sig")]
        if matches:
            return matches[0]
    return None


def _env(name: str) -> str:
    import os

    value = os.environ.get(name)
    if not value:
        print(f"error: {name} is not set", file=sys.stderr)
        sys.exit(2)
    return value


def _conf_version() -> str:
    import json as _json

    conf = Path("tauri/src-tauri/tauri.conf.json")
    return _json.loads(conf.read_text(encoding="utf-8")).get("version", "0.0.0")


if __name__ == "__main__":
    sys.exit(main())
