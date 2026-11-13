"""On-demand download of the C++ sidecar binaries GGUF TTS/STT backends need.

The release installer ships ffmpeg and llama.cpp; everything else is fetched
exactly when the user downloads the model that needs it, so the base install
stays lean. Windows x64 CPU bundles only - Linux/macOS sidecars are not
asserted here and fall back to the env/models-dir/PATH lookups the backends
would already have done.

Binaries live under ``<data>/bin/<name>/``:

- crispasr: ``data/bin/crispasr/crispasr.exe`` (+ openblas.dll runtime, license)
- parakeet: ``data/bin/parakeet/parakeet.exe``
- audio.cpp: ``data/bin/audiocpp/audiocpp_cli.exe`` (+ MSVC runtime DLLs, model_specs/, license)
"""

from __future__ import annotations

import logging
import os
import shutil
import sys
import tempfile
import urllib.request
from pathlib import Path
from zipfile import ZipFile

logger = logging.getLogger(__name__)

_WIN_X64 = sys.platform == "win32"


def _bin_dir(name: str) -> Path:
    from .. import config

    path = config.get_data_dir() / "bin" / name
    path.mkdir(parents=True, exist_ok=True)
    return path


def find_crispasr() -> Path | None:
    """Resolve the CrispASR binary: env override -> bundled sidecar -> PATH -> auto-download."""
    env_path = os.environ.get("TWENTYLABS_CRISPASR")
    if env_path and Path(env_path).exists():
        return Path(env_path)

    from ..config import get_models_dir

    bundled = get_models_dir() / ("crispasr.exe" if os.name == "nt" else "crispasr")
    if bundled.exists():
        return bundled

    data_bin = _bin_dir("crispasr") / ("crispasr.exe" if os.name == "nt" else "crispasr")
    if data_bin.exists():
        return data_bin

    exe = "crispasr.exe" if os.name == "nt" else "crispasr"
    found = shutil.which(exe)
    if found:
        return Path(found)

    return ensure_crispasr()


def find_audiocpp() -> Path | None:
    """Resolve audio.cpp: env -> models dir -> PATH -> auto-download."""
    env_path = os.environ.get("TWENTYLABS_AUDIOCPP")
    if env_path and Path(env_path).exists():
        return Path(env_path)

    from ..config import get_models_dir

    bundled = get_models_dir() / ("audiocpp_cli.exe" if os.name == "nt" else "audiocpp_cli")
    if bundled.exists():
        return bundled

    data_bin = _bin_dir("audiocpp") / ("audiocpp_cli.exe" if os.name == "nt" else "audiocpp_cli")
    if data_bin.exists():
        return data_bin

    exe = "audiocpp_cli.exe" if os.name == "nt" else "audiocpp_cli"
    found = shutil.which(exe)
    if found:
        return Path(found)

    return ensure_audiocpp()


def find_parakeet() -> Path | None:
    """Resolve parakeet.cpp: env -> data/bin -> PATH -> auto-download."""
    env_path = os.environ.get("TWENTYLABS_PARAKEET")
    if env_path and Path(env_path).exists():
        return Path(env_path)

    from .. import config

    data_bin = config.get_data_dir() / "bin" / "parakeet" / ("parakeet.exe" if os.name == "nt" else "parakeet")
    if data_bin.exists():
        return data_bin

    exe = "parakeet.exe" if os.name == "nt" else "parakeet"
    found = shutil.which(exe)
    if found:
        return Path(found)

    return ensure_parakeet()


def _download_zip(url: str, dest: Path) -> None:
    logger.info("Downloading sidecar from %s", url)
    with urllib.request.urlopen(url, timeout=60) as resp, open(dest, "wb") as fh:
        shutil.copyfileobj(resp, fh, length=8 * 1024 * 1024)


def _extract(url: str, target_dir: Path, flatten_to: str | None = None) -> bool:
    """Extract a remote zip into ``target_dir`` (flattening one level if requested)."""
    if not _WIN_X64:
        logger.debug("sidecar auto-download is Windows-only; refusing on %s", sys.platform)
        return False
    tmp = tempfile.mkdtemp(prefix=f"sidecar_{target_dir.name}_")
    try:
        zip_path = Path(tmp) / "asset.zip"
        _download_zip(url, zip_path)
        with ZipFile(zip_path) as zf:
            names = zf.namelist()
            # Find the folder that contains the payload
            root = ""
            if flatten_to and any(n.startswith(f"{flatten_to}/") for n in names):
                root = f"{flatten_to}/"
            elif not flatten_to and sum(1 for n in names if n.endswith("/")) == 1:
                root = next(n for n in names if n.endswith("/"))
            for member in zf.infolist():
                if flatten_to and member.filename.startswith(flatten_to):
                    member.filename = member.filename[len(flatten_to) :].lstrip("/")
                elif root and member.filename.startswith(root):
                    member.filename = member.filename[len(root) :].lstrip("/")
                if not member.filename:
                    continue
                zf.extract(member, target_dir)
        return True
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def ensure_crispasr() -> Path | None:
    """Download crispasr v0.8.53 (CPU build) and drop it next to its DLLs."""
    from .. import config

    if not _WIN_X64:
        return None
    exe = config.get_data_dir() / "bin" / "crispasr" / "crispasr.exe"
    if exe.is_file():
        return exe
    target = _bin_dir("crispasr")
    ok = _extract(
        "https://github.com/CrispStrobe/CrispASR/releases/download/v0.8.53/crispasr-windows-x86_64-cpu.zip",
        target,
        flatten_to="crispasr-windows-x86_64-cpu",
    )
    return exe if ok and exe.is_file() else None


def ensure_audiocpp() -> Path | None:
    """Download audio.cpp v0.9.4 (CPU build)."""
    from .. import config

    if not _WIN_X64:
        return None
    exe = config.get_data_dir() / "bin" / "audiocpp" / "audiocpp_cli.exe"
    if exe.is_file():
        return exe
    target = _bin_dir("audiocpp")
    ok = _extract(
        "https://github.com/0xShug0/audio.cpp/releases/download/v0.9.4/audio-v0.9.4-bin-windows-x64-cpu.zip",
        target,
    )
    return exe if ok and exe.is_file() else None


def ensure_parakeet() -> Path | None:
    """Download parakeet.cpp v0.6.1 (CPU build) and expose it as data/bin/parakeet/parakeet.exe."""
    from .. import config

    if not _WIN_X64:
        return None
    exe = config.get_data_dir() / "bin" / "parakeet" / "parakeet.exe"
    if exe.is_file():
        return exe
    target = _bin_dir("parakeet")
    _extract(
        "https://github.com/mudler/parakeet.cpp/releases/download/v0.6.1/parakeet-v0.6.1-bin-win-cpu-x64.zip",
        target,
        flatten_to="parakeet-v0.6.1-bin-win-cpu-x64",
    )
    # The release ships parakeet-cli.exe and parakeet-server.exe; the STT backend
    # invokes parakeet-cli.py ("parakeet") - rename if present.
    cli = target / "parakeet-cli.exe"
    if cli.is_file():
        cli.replace(exe)
    return exe if exe.is_file() else None
