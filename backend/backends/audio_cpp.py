"""Shared helpers for the audio.cpp one-shot CLI sidecar.

audio.cpp (https://github.com/0xShug0/audio.cpp) is a ggml engine whose
``audiocpp_cli`` binary drives many audio-generation families (HeartMuLa,
Stable Audio 3, ...) as one-shot ``--task gen`` subprocesses. The binary
is a single dependency-free native executable, discovered the same way as
the other sidecars (crispasr, llama-server): env override → bundled
``data/models/`` → PATH.
"""

from pathlib import Path

# Env override for the audiocpp_cli binary path.
AUDIOCPP_ENV = "TWENTYLABS_AUDIOCPP"


def find_audiocpp() -> Path | None:
    """Resolve the audiocpp_cli binary (env override, bundled sidecar, PATH, auto-download)."""
    from ..utils.sidecar_downloader import find_audiocpp as _find

    return _find()
