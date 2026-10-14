"""Subprocess spawning that never flashes a console window.

Windows console binaries — llama-server.exe, crispasr.exe, s2.exe,
parakeet, ffmpeg, the model venv scripts — open a visible console window
when spawned without ``CREATE_NO_WINDOW``. That window flashes on every
model load/generation and can steal focus. This module centralises the
flag so every model binary runs invisibly; off Windows it is a no-op.

``creationflags`` is Windows-only (passing it on POSIX raises), so the
helpers only add it on win32.
"""

import subprocess
import sys

if sys.platform == "win32":
    # CREATE_NO_WINDOW (0x08000000): the process gets no console and no
    # window is created. Safe with stdout/stderr DEVNULL or PIPE.
    CREATE_NO_WINDOW = 0x08000000
else:
    CREATE_NO_WINDOW = 0


def popen_kwargs() -> dict:
    """Extra kwargs that hide any console window (no-op off Windows)."""
    if sys.platform == "win32" and CREATE_NO_WINDOW:
        return {"creationflags": CREATE_NO_WINDOW}
    return {}


def popen_hidden(args, **kwargs) -> subprocess.Popen:
    """``subprocess.Popen`` with the console window hidden."""
    if sys.platform == "win32" and CREATE_NO_WINDOW:
        existing = kwargs.get("creationflags", 0)
        kwargs["creationflags"] = existing | CREATE_NO_WINDOW
    return subprocess.Popen(args, **kwargs)


def run_hidden(args, **kwargs) -> subprocess.CompletedProcess:
    """``subprocess.run`` with the console window hidden."""
    if sys.platform == "win32" and CREATE_NO_WINDOW:
        existing = kwargs.get("creationflags", 0)
        kwargs["creationflags"] = existing | CREATE_NO_WINDOW
    return subprocess.run(args, **kwargs)
