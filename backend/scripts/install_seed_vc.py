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
    # backend/config.py is the source of truth; resolve it relative to this
    # file so the result never depends on the caller's cwd (the old
    # `from backends import config` never resolved — backends/ has no config
    # submodule — and always silently fell back).
    try:
        _backend_dir = Path(__file__).resolve().parents[1]
        if str(_backend_dir) not in sys.path:
            sys.path.insert(0, str(_backend_dir))
        from config import get_models_dir

        base = get_models_dir()
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
        py = venv / "Scripts" / "python.exe"
    else:
        py = venv / "bin" / "python"

    # Upgrade pip in the venv first (via python -m pip: the pip.exe shim
    # refuses self-upgrade on Windows with "To modify pip, please run
    # python.exe -m pip install --upgrade pip").
    _run([str(py), "-m", "pip", "install", "--upgrade", "pip"])

    # Upstream is an app-style repo (no setup.py/pyproject.toml), so it is not
    # pip-installable from git. Clone it, install its requirements, then stage
    # its runtime sources (seed_vc_wrapper.py + hf_utils.py + modules/) into
    # the venv's site-packages — the backend injects exactly that directory
    # onto sys.path before `from seed_vc_wrapper import SeedVCWrapper`.
    import shutil
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        repo_dir = Path(tmp) / "seed-vc"
        _run(["git", "clone", "--depth", "1", "--branch", ref, REPO_URL, str(repo_dir)])
        req = repo_dir / "requirements.txt"
        if req.exists():
            _run([str(py), "-m", "pip", "install", "-r", str(req)])
        hits = sorted(glob.glob(str(venv / ("Lib/site-packages" if os.name == "nt" else "lib/python*/site-packages"))))
        if not hits:
            raise RuntimeError(f"No site-packages found in {venv}")
        site = Path(hits[-1])
        for name in ("seed_vc_wrapper.py", "hf_utils.py"):
            src = repo_dir / name
            if src.is_file():
                shutil.copy2(src, site / name)
                print(f"[install_seed_vc] staged {name}")
        for dirname in ("modules",):
            src = repo_dir / dirname
            if src.is_dir():
                shutil.copytree(src, site / dirname, dirs_exist_ok=True)
                print(f"[install_seed_vc] staged {dirname}/")

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
