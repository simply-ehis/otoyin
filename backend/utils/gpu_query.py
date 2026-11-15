"""Best-effort GPU probe with no PyTorch dependency.

Reports CUDA hardware presence and memory via the NVIDIA System Management
Interface (``nvidia-smi``), which ships with the NVIDIA display driver on
Windows. DirectML and Apple Silicon detection lives in ``platform_detect``;
this module only answers "is there an NVIDIA GPU, and how much VRAM does it
have?".

All functions are pure or end with a best-effort subprocess. Any failure
(no nvidia-smi, non-NVIDIA GPU, unparseable output, timeout) returns
``None`` — callers treat ``None`` as "no CUDA GPU" and fall back to CPU
semantics. Never raises.
"""

from __future__ import annotations

import csv
import shutil
import subprocess
from dataclasses import dataclass


@dataclass(frozen=True)
class NvidiaGpu:
    """Single NVIDIA GPU as reported by nvidia-smi."""

    name: str
    total_mb: float
    free_mb: float

    @property
    def used_mb(self) -> float:
        return self.total_mb - self.free_mb


def probe_nvidia_smi() -> NvidiaGpu | None:
    """Return the first NVIDIA GPU, or ``None``.

    Multi-GPU hosts: the reporting assumes one workload and uses the first
    device — llama.cpp sidecars are pinned per-process anyway and the app
    does not currently schedule VRAM across GPUs.
    """
    exe = shutil.which("nvidia-smi")
    if not exe:
        return None
    try:
        out = (
            subprocess.check_output(
                [exe, "--query-gpu=name,memory.total,memory.free", "--format=csv,noheader,nounits"],
                timeout=5.0,
                stderr=subprocess.DEVNULL,
            )
            .decode("utf-8", errors="ignore")
            .strip()
        )
    except Exception:
        return None
    if not out:
        return None
    first = out.splitlines()[0]
    try:
        name, total, free = next(csv.reader([first]))
        name = name.strip()
        total_mb = float(total.strip())
        free_mb = float(free.strip())
    except (StopIteration, ValueError, IndexError):
        return None
    if not name:
        return None
    return NvidiaGpu(name=name, total_mb=total_mb, free_mb=free_mb)
