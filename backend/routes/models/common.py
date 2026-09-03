"""Shared state and helpers for model management endpoints."""

import hashlib
import logging
import os
import shutil
import ssl
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import urlopen

from fastapi import APIRouter

logger = logging.getLogger(__name__)

router = APIRouter()

# Dedicated executor for downloads so a (potentially long) snapshot_download
# never competes for threads with the TTS generation pool (asyncio.to_thread
# uses the default pool). Sharing the pool caused downloads to starve/block
# live generations.
_download_executor = ThreadPoolExecutor(max_workers=1)

# Steam Audio SDK version and GitHub release URL
STEAMAUDIO_VERSION = "4.8.1"
STEAMAUDIO_URL = f"https://github.com/ValveSoftware/steam-audio/releases/download/v{STEAMAUDIO_VERSION}/steamaudio_{STEAMAUDIO_VERSION}.zip"
STEAMAUDIO_PLATFORMS = {
    "Windows": ("bin/Windows64/phonon.dll", "phonon.dll"),
    "Linux": ("bin/linux64/libphonon.so", "libphonon.so"),
    "Darwin": ("bin/macos/libphonon.dylib", "libphonon.dylib"),
}


def _download_steam_audio_sdk(progress_manager, model_name: str) -> None:
    """Download Steam Audio SDK from GitHub releases."""
    import platform as _platform

    system = _platform.system()
    if system not in STEAMAUDIO_PLATFORMS:
        raise RuntimeError(f"Steam Audio SDK not available for {system}")

    from ...config import get_data_dir

    dest_dir = get_data_dir() / "steam-audio"
    src_path, dst_name = STEAMAUDIO_PLATFORMS[system]
    dest_file = dest_dir / dst_name

    if dest_file.exists():
        logger.info("Steam Audio SDK already installed at %s", dest_file)
        return

    progress_manager.update_progress(
        model_name=model_name,
        current=0,
        total=0,
        filename="Downloading Steam Audio SDK...",
        status="downloading",
    )

    logger.info("Downloading Steam Audio SDK v%s from GitHub...", STEAMAUDIO_VERSION)
    zip_path = dest_dir / "steam_audio.zip"
    dest_dir.mkdir(parents=True, exist_ok=True)

    _ssl_ctx = ssl.create_default_context()
    with urlopen(STEAMAUDIO_URL, context=_ssl_ctx) as resp:
        total = int(resp.headers.get("Content-Length", 0))
        downloaded = 0
        chunk_size = 1024 * 1024  # 1MB chunks
        with open(zip_path, "wb") as f:
            while True:
                chunk = resp.read(chunk_size)
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)
                if total:
                    progress_manager.update_progress(
                        model_name=model_name,
                        current=downloaded,
                        total=total,
                        filename="Downloading...",
                        status="downloading",
                    )

    # Integrity verification: refuse to extract an unverified native binary.
    # Pin the expected SHA-256 via STEAMAUDIO_SHA256 (or fetch a companion
    # .sha256 with STEAMAUDIO_SHA256_URL). The binary is loaded/executed by the
    # app, so a tampered archive would be remote code execution.
    expected_sha = os.environ.get("STEAMAUDIO_SHA256", "").strip()
    sha_url = os.environ.get("STEAMAUDIO_SHA256_URL", "").strip()
    if sha_url and not expected_sha:
        try:
            with urlopen(sha_url, context=_ssl_ctx) as sha_resp:
                expected_sha = sha_resp.read().decode().strip().split()[0]
        except Exception as e:
            raise RuntimeError(f"Failed to fetch Steam Audio SDK checksum: {e}") from e

    if expected_sha:
        hasher = hashlib.sha256()
        with open(zip_path, "rb") as f:
            for block in iter(lambda: f.read(1024 * 1024), b""):
                hasher.update(block)
        actual = hasher.hexdigest()
        if actual.lower() != expected_sha.lower():
            zip_path.unlink(missing_ok=True)
            raise RuntimeError("Steam Audio SDK checksum mismatch — refusing to extract (possible tampering)")
        logger.info("Steam Audio SDK checksum verified")
    else:
        logger.warning(
            "Steam Audio SDK downloaded without checksum verification; set "
            "STEAMAUDIO_SHA256 to pin the expected SHA-256"
        )

    progress_manager.update_progress(
        model_name=model_name,
        current=100,
        total=100,
        filename="Extracting...",
        status="downloading",
    )

    with zipfile.ZipFile(zip_path) as zf:
        for name in zf.namelist():
            if name.endswith(src_path.split("/")[-1]):
                # Zip-slip guard: only write into the intended destination.
                target = (dest_dir / dst_name).resolve()
                if not target.is_relative_to(dest_dir.resolve()):
                    zip_path.unlink(missing_ok=True)
                    raise RuntimeError("Unsafe path inside Steam Audio SDK archive")
                with zf.open(name) as src, open(target, "wb") as dst:
                    dst.write(src.read())
                break

    zip_path.unlink(missing_ok=True)
    logger.info("Steam Audio SDK installed at %s", dest_file)


def _get_dir_size(path: Path) -> int:
    """Get total size of a directory in bytes."""
    total = 0
    for f in path.rglob("*"):
        if f.is_file():
            total += f.stat().st_size
    return total


def _copy_with_progress(src: Path, dst: Path, progress_manager, copied_so_far: int, total_bytes: int) -> int:
    """Copy a directory tree with byte-level progress tracking."""
    dst.mkdir(parents=True, exist_ok=True)
    for item in src.iterdir():
        dest_item = dst / item.name
        if item.is_dir():
            copied_so_far = _copy_with_progress(item, dest_item, progress_manager, copied_so_far, total_bytes)
        else:
            size = item.stat().st_size
            shutil.copy2(str(item), str(dest_item))
            copied_so_far += size
            progress_manager.update_progress(
                "migration",
                copied_so_far,
                total_bytes,
                filename=item.name,
                status="downloading",
            )
    return copied_so_far


def _safe_available(getter, attr="is_available"):
    """Return True/False for a backend availability probe without crashing."""
    try:
        backend = getter()
        fn = getattr(backend, attr, None)
        if callable(fn):
            return bool(fn())
    except Exception:
        logger.debug("Backend availability check failed", exc_info=True)
        return False
    return False
