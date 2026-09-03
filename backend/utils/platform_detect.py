"""
Platform detection for backend selection.

Detects OS, GPU, and available inference runtimes to choose the best backend.
"""

import logging
import platform
import sys
from typing import Literal

logger = logging.getLogger(__name__)

BackendType = Literal["onnx", "pytorch"]


def get_windows_version() -> tuple[int, int, int] | None:
    """Return (major, minor, build) for Windows, or None if not Windows."""
    if platform.system() != "Windows":
        return None
    ver = sys.getwindowsversion()
    return (ver.major, ver.minor, ver.build)


def is_windows_11() -> bool:
    """Windows 11 is build >= 22000 (platform.release() wrongly says '10')."""
    ver = get_windows_version()
    return ver is not None and ver[2] >= 22000


def is_macos() -> bool:
    """Check if running on macOS."""
    return platform.system() == "Darwin"


def is_apple_silicon() -> bool:
    """Check if running on Apple Silicon (M-series)."""
    return is_macos() and platform.machine() == "arm64"


def _detect_onnx_providers() -> list[str]:
    """Return ordered list of available ONNX Runtime execution providers."""
    try:
        import onnxruntime as ort

        return ort.get_available_providers()
    except ImportError:
        return []


def has_directml() -> bool:
    """Check if DirectML execution provider is available."""
    return "DmlExecutionProvider" in _detect_onnx_providers()


def has_cuda_onnx() -> bool:
    """Check if CUDA execution provider is available in ONNX Runtime."""
    return "CUDAExecutionProvider" in _detect_onnx_providers()


def has_coreml_onnx() -> bool:
    """Check if CoreML execution provider is available in ONNX Runtime."""
    return "CoreMLExecutionProvider" in _detect_onnx_providers()


def _detect_gpu_name() -> str | None:
    """Best-effort GPU detection via WMI/dxdiag (Windows) or system_profiler (macOS)."""
    try:
        if is_macos():
            import subprocess

            result = subprocess.run(
                ["system_profiler", "SPDisplaysDataType"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            for line in result.stdout.splitlines():
                if "Chipset Model" in line or "GPU" in line:
                    name = line.split(":")[-1].strip()
                    if name and name != "Name":
                        return name
        else:
            import subprocess

            # PowerShell Get-CimInstance — wmic is deprecated on Windows 11 24H2+
            result = subprocess.run(
                [
                    "powershell",
                    "-NoProfile",
                    "-Command",
                    "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name",
                ],
                capture_output=True,
                text=True,
                timeout=10,
            )
            for line in result.stdout.strip().splitlines():
                name = line.strip()
                if name:
                    return name
    except Exception:
        logger.debug("GPU detection failed", exc_info=True)
    return None


def get_gpu_info() -> dict[str, str | None]:
    """Return GPU name and detected acceleration type."""
    gpu_name = _detect_gpu_name()
    accel = "none"
    if has_cuda_onnx():
        accel = "cuda"
    elif has_directml():
        accel = "directml"
    elif has_coreml_onnx():
        accel = "coreml"
    return {"name": gpu_name, "acceleration": accel}


def get_backend_type() -> BackendType:
    """Detect the best backend for the current platform.

    Priority:
      1. ONNX Runtime with hardware EP available → ONNX (uses CUDA/DirectML/CoreML/CPU automatically)
      2. Fallback → PyTorch
    """
    providers = _detect_onnx_providers()
    if providers:
        return "onnx"

    return "pytorch"


def log_platform_info() -> None:
    """Log detailed platform info at startup."""
    import os

    system = platform.system()
    release = platform.release()
    version = platform.version()
    machine = platform.machine()

    if system == "Windows":
        ver = get_windows_version()
        if ver:
            os_label = f"Windows {'11' if ver[2] >= 22000 else '10'} (build {ver[2]})"
        else:
            os_label = f"Windows {release}"
    elif system == "Darwin":
        os_label = f"macOS {release} ({machine})"
    else:
        os_label = f"{system} {release}"

    logger.info("OS: %s (%s, %s)", os_label, version, machine)

    gpu = get_gpu_info()
    if gpu["name"]:
        logger.info("GPU: %s [%s]", gpu["name"], gpu["acceleration"])
    else:
        logger.info("GPU: None detected")

    providers = _detect_onnx_providers()
    if providers:
        logger.info("ONNX providers: %s", ", ".join(providers))

    backend = get_backend_type()
    logger.info("Backend: %s", backend.upper())
