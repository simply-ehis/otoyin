"""Shared helpers for the audio.cpp one-shot CLI sidecar.

audio.cpp (https://github.com/0xShug0/audio.cpp) is a ggml engine whose
``audiocpp_cli`` binary drives many audio-generation families (HeartMuLa,
Stable Audio 3, ...) as one-shot ``--task gen`` subprocesses. The binary
is a single dependency-free native executable, discovered the same way as
the other sidecars (crispasr, llama-server): env override → bundled
``data/models/`` → PATH.
"""

import os
import shutil
from pathlib import Path

# Env override for the audiocpp_cli binary path.
AUDIOCPP_ENV = "TWENTYLABS_AUDIOCPP"


def find_audiocpp() -> Path | None:
    """Resolve the audiocpp_cli binary (env override, bundled sidecar, PATH)."""
    env_path = os.environ.get(AUDIOCPP_ENV)
    if env_path and Path(env_path).exists():
        return Path(env_path)

    from ..config import get_models_dir

    bundled = get_models_dir() / ("audiocpp_cli.exe" if os.name == "nt" else "audiocpp_cli")
    if bundled.exists():
        return bundled

    exe = "audiocpp_cli.exe" if os.name == "nt" else "audiocpp_cli"
    found = shutil.which(exe)
    return Path(found) if found else None
