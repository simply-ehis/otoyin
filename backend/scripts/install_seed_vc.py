"""
Install Seed-VC into an isolated side-venv.

Seed-VC (Plachtaa/seed-vc) pulls a specific torch / numpy / diffusers stack
that conflicts with the base app's ML deps. To keep the main app stable, this
script builds a dedicated virtualenv and installs Seed-VC there. The backend
(backends/seed_vc_backend.py) injects that venv's site-packages onto sys.path
before importing ``seed_vc_wrapper``.

Usage:
    python scripts/install_seed_vc.py
    SEED_VC_VENV=/path/to/venv python scripts/install_seed_vc.py

Env overrides:
    SEED_VC_VENV   - target venv directory (default: data/models/seed_vc_venv)
    PYTHON_EXE     - python interpreter to use for the venv (default: sys.executable)
    SEED_VC_REF    - git ref/branch/tag for Plachtaa/seed-vc (default: main)
"""

from __future__ import annotations

import glob
import os
import subprocess
import sys
from pathlib import Path

REPO_URL = "https://github.com/Plachtaa/seed-vc.git"
DEFAULT_REF = "main"


def _resolve_venv() -> Path:
    env = os.environ.get("SEED_VC_VENV")
    if env:
        return Path(env).expanduser().resolve()
    # Default to a models-dir subfolder so the backend finds it automatically.
    try:
        from backends import config as cfg  # type: ignore

        base = cfg.get_models_dir()
    except Exception as e:
        print(f"[install_seed_vc] config import failed, using fallback: {e}")
        base = Path(os.getcwd()) / "data" / "models"
    return (base / "seed_vc_venv").resolve()


def _run(cmd: list[str], cwd: Path | None = None) -> None:
    print("+", " ".join(str(c) for c in cmd))
    subprocess.check_call(cmd, cwd=str(cwd) if cwd else None)


def main() -> int:
    venv = _resolve_venv()
    python_exe = os.environ.get("PYTHON_EXE", sys.executable)
    ref = os.environ.get("SEED_VC_REF", DEFAULT_REF)

    print(f"[install_seed_vc] target venv: {venv}")

    if not venv.exists():
        _run([python_exe, "-m", "venv", str(venv)])

    if os.name == "nt":
        pip = venv / "Scripts" / "pip.exe"
        venv / "Scripts" / "python.exe"
    else:
        pip = venv / "bin" / "pip"
        venv / "bin" / "python"

    # Upgrade pip in the venv first.
    _run([str(pip), "install", "--upgrade", "pip"])

    # Install Seed-VC from git (pulls torch / numpy / diffusers into this venv
    # only — never touches the base app's environment).
    _run([str(pip), "install", "git+" + REPO_URL + "@" + ref])

    # The repo ships a requirements.txt that pins exact compatible versions;
    # install it on top so the wrapper's runtime imports resolve.
    # Clone to a temp dir just to read requirements.txt without leaving artifacts.
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        repo_dir = Path(tmp) / "seed-vc"
        _run(["git", "clone", "--depth", "1", "--branch", ref, REPO_URL, str(repo_dir)])
        req = repo_dir / "requirements.txt"
        if req.exists():
            _run([str(pip), "install", "-r", str(req)])

    print("[install_seed_vc] done.")
    print("[install_seed_vc] venv site-packages:")
    hits = sorted(glob.glob(str(venv / ("Lib/site-packages" if os.name == "nt" else "lib/python*/site-packages"))))
    for h in hits:
        print("    ", h)
    print("[install_seed_vc] Backend will auto-discover this venv.")
    print("[install_seed_vc] To use a different venv, set SEED_VC_VENV=<path>.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
