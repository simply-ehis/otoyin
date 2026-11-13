"""Locate optional sidecar binaries bundled next to the frozen app install.

A packaged Otoyin ships ffmpeg, llama-server and llama-tts as bundle
resources (see tauri/src-tauri/tauri.conf.json). The Python backend cannot
assume an install layout, so every sidecar resolver mirrors the same
shape as ``ffmpeg_path()``: explicit env override -> frozen exe dir and
its parent (where bundle resources unpack) -> PATH.
"""

from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

_EXE = ".exe" if sys.platform == "win32" else ""


def sidecar_dirs(name: str) -> list[Path]:
    """Candidate directories for ``<name><ext>``, most specific first."""
    dirs: list[Path] = []
    if getattr(sys, "frozen", False):
        exe_dir = Path(sys.executable).resolve().parent
        dirs += [exe_dir, exe_dir.parent]
    else:
        repo_root = Path(__file__).resolve().parent.parent
        dirs += [repo_root, repo_root / "tauri" / "src-tauri" / "binaries"]

    expanded: list[Path] = []
    for base in dirs:
        expanded += [base / name, base / name / "bin", base]
    return expanded


def find_bundled_sidecar(name: str, env_var: str) -> Path | None:
    """Resolve ``<name>`` via env override, bundled location, then PATH.

    Never raises: a missing sidecar is reported to the caller, which surfaces
    a user-facing error.
    """
    override = os.environ.get(env_var)
    if override:
        p = Path(override)
        if p.is_file():
            return p
        return None

    for d in sidecar_dirs(name):
        cand = d / f"{name}{_EXE}"
        if cand.is_file():
            return cand

    found = shutil.which(f"{name}{_EXE}")
    return Path(found) if found else None


def legacy_models_dir(name: str) -> Path | None:
    """Dev fallback: models dir (e.g. data/models/) — checked only after the
    bundled locations are exhausted."""
    from ..config import get_models_dir

    exe = f"{name}.exe" if sys.platform == "win32" else name
    candidate = get_models_dir() / exe
    return candidate if candidate.exists() else None
