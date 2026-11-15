"""On-demand download of the C++ sidecar binaries GGUF TTS/STT backends need.

The release installer ships ffmpeg and llama.cpp; everything else is fetched
exactly when the user downloads the model that needs it, so the base install
stays lean. Windows sidecars (crispasr, parakeet) are Windows-only; the
audio.cpp sidecar auto-download resolves per platform (Windows x64, Linux
x64/arm64, macOS arm64/x64) against the published v0.9.4 release assets.
Linux/macOS builds ship CPU-portable/Metal targets; GPU builds are opt-in via
TWENTYLABS_AUDIOCPP_VARIANT={cpu|vulkan|cuda}. On unknown platforms the
lookup returns None and callers surface an install-needed error instead of
crashing.

Binaries live under ``<data>/bin/<name>/``:

- crispasr: ``data/bin/crispasr/crispasr.exe`` (+ openblas.dll runtime, license)
- parakeet: ``data/bin/parakeet/parakeet.exe``
- audio.cpp: ``data/bin/audiocpp/audiocpp_cli[.exe]`` (+ runtimes, model_specs/, license)
"""

from __future__ import annotations

import logging
import os
import platform
import shutil
import sys
import tarfile
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
    """Resolve audiocpp_cli: env -> models dir -> binary tree -> PATH -> auto-download."""
    env_path = os.environ.get("TWENTYLABS_AUDIOCPP")
    if env_path and Path(env_path).exists():
        return Path(env_path)

    from ..config import get_models_dir

    exe = "audiocpp_cli.exe" if os.name == "nt" else "audiocpp_cli"
    bundled = get_models_dir() / exe
    if bundled.exists():
        return bundled

    # Auto-downloaded binaries may unpack into a versioned subdir — locate anywhere under data/bin/audiocpp.
    data_root = _bin_dir("audiocpp")
    candidates = sorted(data_root.rglob(exe))
    if candidates:
        return candidates[0]

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


def _extract_tar(url: str, target_dir: Path) -> bool:
    """Download ``url`` and unpack the tarball into ``target_dir``."""
    tmp = tempfile.mkdtemp(prefix=f"sidecar_{target_dir.name}_")
    try:
        tar_path = Path(tmp) / "asset.tar.gz"
        _download_zip(url, tar_path)
        with tarfile.open(tar_path) as tf:
            # Skip entries that would escape the target dir (tar-slip).
            root = target_dir.resolve()
            for member in tf.getmembers():
                dest = (target_dir / member.name).resolve()
                if not str(dest).startswith(str(root)):
                    logger.warning("skipping unsafe tar member %r", member.name)
                    continue
                tf.extract(member, target_dir)
        return True
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _extract(url: str, target_dir: Path, flatten_to: str | None = None) -> bool:
    """Extract a remote zip into ``target_dir`` (flattening one level if requested)."""
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


def _audiocpp_asset() -> tuple[str, bool] | None:
    """Pick (url, is_tarball) for the published v0.9.4 asset for this platform.

    Default is the portable CPU build everywhere (what this code has always
    shipped; the GPU bundles are several times larger and need matching
    drivers/runtimes we cannot assert offline). GPU builds are opt-in via
    TWENTYLABS_AUDIOCPP_VARIANT={cpu|vulkan|cuda}: cuda = cuda12.8-colab on
    Linux, cuda12.4 on Windows; vulkan = Vulkan-portable bundle. macOS binds
    the Metal build; arm64 Macs get the arm64 asset. Returns None on platforms
    with no published binary (callers surface an install-needed error).
    """
    base = "https://github.com/0xShug0/audio.cpp/releases/download/v0.9.4"
    variant = (os.environ.get("TWENTYLABS_AUDIOCPP_VARIANT") or "cpu").strip().lower()
    if sys.platform == "win32":
        if variant == "cuda":
            return (f"{base}/audio-v0.9.4-bin-windows-x64-cuda12.4.zip", False)
        if variant == "vulkan":
            return (f"{base}/audio-v0.9.4-bin-windows-x64-vulkan-portable.zip", False)
        return (f"{base}/audio-v0.9.4-bin-windows-x64-cpu-portable.zip", False)
    if sys.platform == "darwin":
        mac_arch = "arm64" if platform.machine().lower() in ("arm64", "aarch64") else "x64"
        return (f"{base}/audio-v0.9.4-bin-macos-{mac_arch}-metal.tar.gz", True)
    if sys.platform.startswith("linux"):
        if variant == "cuda":
            return (f"{base}/audio-v0.9.4-bin-ubuntu-x64-cuda12.8-colab.tar.gz", True)
        if variant == "vulkan":
            return (f"{base}/audio-v0.9.4-bin-ubuntu-x64-vulkan-portable.tar.gz", True)
        return (f"{base}/audio-v0.9.4-bin-ubuntu-x64-cpu-portable.tar.gz", True)
    logger.warning("audio.cpp sidecar has no published v0.9.4 binary for platform %s", sys.platform)
    return None


def ensure_audiocpp() -> Path | None:
    """Download audio.cpp v0.9.4 for this platform and resolve the CLI binary."""
    exe_name = "audiocpp_cli.exe" if os.name == "nt" else "audiocpp_cli"
    data_root = _bin_dir("audiocpp")
    existing = sorted(data_root.rglob(exe_name))
    if existing:
        return _make_executable(existing[0])
    asset = _audiocpp_asset()
    if asset is None:
        return None
    url, is_tar = asset
    ok = _extract_tar(url, data_root) if is_tar else _extract(url, data_root)
    if not ok:
        return None
    found = sorted(data_root.rglob(exe_name))
    return _make_executable(found[0]) if found else None


def _make_executable(path: Path) -> Path:
    """Mark a resolved sidecar binary executable (no-op on Windows)."""
    try:
        if os.name != "nt":
            path.chmod(path.stat().st_mode | 0o755)
    except OSError:
        logger.debug("could not chmod +x %s", path)
    return path


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
