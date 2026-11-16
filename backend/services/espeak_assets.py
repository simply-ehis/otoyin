"""On-demand eSpeak-ng runtime assets for audiocpp TTS families.

Four of the bundled audiocpp TTS engines depend on eSpeak-ng at inference
time (phonemization happens inside the C++ binary, not in Python):
kokoro_tts, piper_tts, inflect_v2 and kitten_tts. The shared library and its
matching data are an upstream GPL-3.0-or-later component, so we do not ship
them inside the installer. Instead they are downloaded the first time any of
those engines is installed (or first used for an already-installed one),
verified against a pinned SHA-256, and reused by every other eSpeak engine
indefinitely.

The assets arrive as the pinned upstream wheel from PyPI
(``espeakng_loader-0.2.4-win_amd64``), which is just a zip with the library
and data in a stable layout; the DLL is extracted to
``data/bin/espeak-ng/espeak-ng.dll`` and the dictionaries to
``data/bin/espeak-ng/espeak-ng-data/``. ``espeak_session_opts()`` hands the
audiocpp CLI the ``<family>.espeak_library_path`` / ``<family>.espeak_data_path``
session options.
"""

from __future__ import annotations

import contextlib
import hashlib
import logging
import os
import shutil
import sys
import tempfile
import threading
from pathlib import Path
from zipfile import ZipFile

logger = logging.getLogger(__name__)

_WHEEL_URL = (
    "https://files.pythonhosted.org/packages/9d/ed/a3d872fbad4f3a3f3db0e8c31768ab14e77cd77306de16b8b20b1e1df7ea/"
    "espeakng_loader-0.2.4-py3-none-win_amd64.whl"
)
_WHEEL_SHA256 = "41f1e08ac9deda2efd1ea9de0b81dab9f5ae3c4b24284f76533d0a7b1dd7abd7"
_WHEEL_SIZE = 9_437_292

# Engine ids (as used in ModelConfig.engine) whose audiocpp families
# phoneme-ize via eSpeak-ng. Keep in sync with the model_specs families
# (kokoro_tts, piper_tts, inflect_v2, kitten_tts) and the nested C++
# espeak_phonemizer.md adapter.
ESPEAK_ENGINES = frozenset({"kokoro", "piper_tts", "inflect_v2", "kitten_tts"})

# CLI families (OneShotSpec.family / dedicated backends) that must receive
# the espeak session options.
ESPEAK_FAMILIES = frozenset({"kokoro_tts", "piper_tts", "inflect_v2", "kitten_tts"})

_install_lock = threading.Lock()


def espeak_dir() -> Path:
    from .. import config

    return config.get_data_dir() / "bin" / "espeak-ng"


def espeak_lib_path() -> Path:
    return espeak_dir() / "espeak-ng.dll"


def espeak_data_path() -> Path:
    return espeak_dir() / "espeak-ng-data"


def is_espeak_installed() -> bool:
    lib = espeak_lib_path()
    data = espeak_data_path()
    return lib.is_file() and data.is_dir() and any(data.iterdir())


def _download_with_sha256(url: str, sha256: str, expected_size: int, dest: Path) -> None:
    """Stream the wheel to ``dest`` with SHA-256 verification."""
    import urllib.request

    tmp = dest.with_suffix(dest.suffix + ".part")
    try:
        with urllib.request.urlopen(url, timeout=60) as resp, open(tmp, "wb") as fh:
            hasher = hashlib.sha256()
            written = 0
            while True:
                chunk = resp.read(64 * 1024)
                if not chunk:
                    break
                fh.write(chunk)
                hasher.update(chunk)
                written += len(chunk)
        if written != expected_size:
            raise RuntimeError(f"eSpeak-ng wheel download incomplete: got {written} bytes, expected {expected_size}")
        if hasher.hexdigest() != sha256:
            raise RuntimeError(f"eSpeak-ng wheel SHA-256 mismatch: got {hasher.hexdigest()}, expected {sha256}")
        os.replace(tmp, dest)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise


def ensure_espeak_installed() -> bool:
    """Install eSpeak-ng assets if missing. Returns True when installed after the call.

    Atomic: stages into a sibling temp dir, then swaps the real directory in one
    rename. Concurrent calls share the install lock, so a double install cannot
    happen even when two eSpeak engines download in parallel.
    """
    if is_espeak_installed():
        return True
    if sys.platform != "win32":
        raise RuntimeError(
            "Bundled eSpeak-ng install is only wired for Windows (one espeak-dependent engine runs here)."
        )

    with _install_lock:
        if is_espeak_installed():
            return True

        target = espeak_dir()
        target.parent.mkdir(parents=True, exist_ok=True)
        staging = Path(tempfile.mkdtemp(prefix="espeak-ng-", dir=target.parent))
        try:
            wheel = staging / "espeakng_loader.whl"
            _download_with_sha256(_WHEEL_URL, _WHEEL_SHA256, _WHEEL_SIZE, wheel)

            extract = staging / "extract"
            extract.mkdir()
            with ZipFile(wheel) as zf:
                dll_entry = "espeakng_loader/espeak-ng.dll"
                data_prefix = "espeakng_loader/espeak-ng-data/"
                for info in zf.infolist():
                    if info.filename == dll_entry:
                        with zf.open(info) as src, open(extract / "espeak-ng.dll", "wb") as fh:
                            shutil.copyfileobj(src, fh)
                    elif info.filename.startswith(data_prefix) and not info.is_dir():
                        rel = info.filename[len(data_prefix) :]
                        if rel:
                            out = extract / "espeak-ng-data" / rel
                            out.parent.mkdir(parents=True, exist_ok=True)
                            with zf.open(info) as src, open(out, "wb") as fh:
                                shutil.copyfileobj(src, fh)

            # Sanity: the DLL and a populated data dir must exist before swap.
            if not (extract / "espeak-ng.dll").is_file() or not any((extract / "espeak-ng-data").rglob("*")):
                raise RuntimeError("eSpeak-ng wheel missing expected contents (espeak-ng.dll / espeak-ng-data)")

            # Swap: remove empty target if present, then rename staging dir over it.
            with contextlib.suppress(FileNotFoundError):
                target.rmdir()  # only succeeds if empty
            os.replace(extract, target)
            logger.info("eSpeak-ng runtime assets installed at %s", target)
            return True
        finally:
            with contextlib.suppress(Exception):
                shutil.rmtree(staging, ignore_errors=True)


def ensure_espeak_for_engine(engine: str | None) -> bool:
    """Install eSpeak-ng when ``engine`` needs it. Returns True when espeak is ready
    (installed now or already present); False when the engine doesn't need it."""
    if engine is None or engine not in ESPEAK_ENGINES:
        return False
    return ensure_espeak_installed()


def espeak_session_opts(family: str) -> list[str]:
    """audiocpp ``--session-option`` arguments binding eSpeak-ng for ``family``.

    Returns an empty list when the assets are not installed (caller must treat
    that as an error for eSpeak-dependent families).
    """
    if family not in ESPEAK_FAMILIES or not is_espeak_installed():
        return []
    lib = espeak_lib_path()
    data = espeak_data_path()
    return [
        "--session-option",
        f"{family}.espeak_library_path={lib}",
        "--session-option",
        f"{family}.espeak_data_path={data}",
    ]
