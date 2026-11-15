"""Shared helpers for the audio.cpp one-shot CLI sidecar.

audio.cpp (https://github.com/0xShug0/audio.cpp) is a ggml engine whose
``audiocpp_cli`` binary drives many audio-generation families (HeartMuLa,
Stable Audio 3, kokoro_tts, fish_audio, ...) as one-shot subprocesses. The
binary is a single dependency-free native executable, discovered the same
way as the other sidecars (crispasr, llama-server): env override → bundled
``data/models/`` → PATH → auto-download.

``run_one_shot`` is the shared engine every migrated backend uses to turn an
argument list into a decoded float32 numpy array — no per-backend subprocess,
return-code, timeout or cleanup boilerplate.
"""

import contextlib
import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np

from ..utils.audio import load_audio
from ..utils.hidden_subprocess import run_hidden

logger = logging.getLogger(__name__)

# Env override for the audiocpp_cli binary path.
AUDIOCPP_ENV = "TWENTYLABS_AUDIOCPP"

# Per-invocation wall-clock budget. CPU generation of speech is usually under a
# minute, but music/Drama-class models need far longer; callers pass their own
# default and users can override globally via TWENTYLABS_AUDIOCPP_TIMEOUT.
DEFAULT_TIMEOUT_S = 600.0

# Env overrides (documented in docs/knowledge/86-audio-cpp-unification.md):
#   TWENTYLABS_AUDIOCPP_BACKEND      GPU selector: best (default) | cpu | cuda | vulkan | metal
#   TWENTYLABS_AUDIOCPP_THREADS      worker thread count (CLI default 4 when unset)
#   TWENTYLABS_AUDIOCPP_SESSION_OPTS comma-separated `key=value`, appended as
#                                  --session-option flags (e.g. "moss_tts_nano.weight_type=f16,fish_audio.mem_saver=true")
#   TWENTYLABS_AUDIOCPP_TIMEOUT      wall-clock budget in seconds


def find_audiocpp() -> Path | None:
    """Resolve the audiocpp_cli binary (env override, bundled sidecar, PATH, auto-download)."""
    from ..utils.sidecar_downloader import find_audiocpp as _find

    return _find()


def run_one_shot(
    args: list[str],
    *,
    sample_rate: int,
    prefix: str,
    timeout_s: float | None = None,
    mem_saver_family: str | None = None,
) -> tuple[np.ndarray, int]:
    """Run audiocpp_cli as a one-shot subprocess and decode the resulting WAV.

    ``args`` is the full ``audiocpp_cli`` argument list (no binary path).
    ``args`` must NOT include ``--out``/``--out-dir``; this helper owns the
    temporary output WAV location. On non-zero exit the tail of
    stderr/stdout is raised so the failure is diagnosable.

    ``mem_saver_family``: when the global "Low memory mode" generation
    setting is on and the family implements audiocpp's ``.mem_saver=true``
    session option, append it. Unsupported families must pass ``None`` -
    passing a family that doesn't implement the option makes the CLI fail.
    """
    binary = find_audiocpp()
    if binary is None:
        raise RuntimeError(
            "audiocpp_cli binary not found. Set TWENTYLABS_AUDIOCPP to its path, "
            "or wait for the on-demand sidecar download."
        )
    for flag in ("--out", "--out-dir"):
        if flag in args:
            raise ValueError(f"{flag} is managed by run_one_shot; do not pass it in args")

    # Low memory mode: cheap session-level win for staged families - release
    # cached AR graphs / phase graphs after each request phase.
    if mem_saver_family:
        try:
            from ..services.settings import get_low_memory_mode

            if get_low_memory_mode():
                args += ["--session-option", f"{mem_saver_family}.mem_saver=true"]
        except Exception:
            logger.debug("low_memory_mode append failed; skipping mem_saver", exc_info=True)

    # Audio.cpp `usage.md` documents `--backend` with cpu|cuda|vulkan|metal|best
    # (default `cpu`). `best` lets ggml pick the fastest available device —
    # without it, GPU machines decode on CPU instead.
    if "--backend" not in args:
        args = ["--backend", os.environ.get("TWENTYLABS_AUDIOCPP_BACKEND", "best"), *args]
    threads = os.environ.get("TWENTYLABS_AUDIOCPP_THREADS")
    if threads:
        args += ["--threads", threads]
    extra_opts = os.environ.get("TWENTYLABS_AUDIOCPP_SESSION_OPTS", "")
    for pair in (p.strip() for p in extra_opts.split(",") if p.strip()):
        if "=" in pair:
            args += ["--session-option", pair]
    budget = float(
        os.environ.get("TWENTYLABS_AUDIOCPP_TIMEOUT", timeout_s if timeout_s is not None else DEFAULT_TIMEOUT_S)
    )
    tmpdir = tempfile.mkdtemp(prefix=f"{prefix}-")
    out_wav = str(Path(tmpdir) / "out.wav")
    try:
        proc = run_hidden([str(binary), *args, "--out", out_wav], capture_output=True, text=True, timeout=budget)
        if proc.returncode != 0:
            tail = (proc.stderr or proc.stdout or "").strip().splitlines()[-5:]
            raise RuntimeError(f"audiocpp failed (exit {proc.returncode}): {' | '.join(tail)}")
        if not Path(out_wav).exists():
            raise RuntimeError("audiocpp exited 0 but produced no WAV output")
        audio, _sr = load_audio(out_wav, sample_rate=sample_rate)
        return audio.astype(np.float32), sample_rate
    except subprocess.TimeoutExpired:
        raise TimeoutError(f"audiocpp exceeded {budget:g}s for this generation.") from None
    finally:
        with contextlib.suppress(OSError):
            shutil.rmtree(tmpdir, ignore_errors=True)
