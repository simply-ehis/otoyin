"""
Device capability detection and model recommendation.

Classifies the user's hardware into tiers and recommends models that fit
within the device's RAM/VRAM budget.  Avoids the failure mode where a user
on a 4 GB laptop tries to download a 7 GB model that will never load.

Tier system (RAM + VRAM):
  low_end     — ≤ 6 GB RAM  OR  ≤ 2 GB VRAM
  mid_range   — ≤ 16 GB RAM AND ≤ 8 GB VRAM
  high_end    — > 16 GB RAM AND > 8 GB VRAM

Model compatibility is determined by comparing the model's estimated
resource requirements against the device's available memory.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import StrEnum

logger = logging.getLogger(__name__)


class DeviceTier(StrEnum):
    LOW_END = "low_end"
    MID_RANGE = "mid_range"
    HIGH_END = "high_end"


@dataclass
class DeviceCapabilities:
    """Snapshot of the host machine's memory and compute."""

    total_ram_mb: int
    available_ram_mb: int
    total_vram_mb: int
    free_vram_mb: int
    gpu_name: str | None
    gpu_type: str | None  # "cuda" | "directml" | "mps" | "xpu" | None
    cpu_cores: int
    tier: DeviceTier

    def to_dict(self) -> dict:
        return {
            "total_ram_mb": self.total_ram_mb,
            "available_ram_mb": self.available_ram_mb,
            "total_vram_mb": self.total_vram_mb,
            "free_vram_mb": self.free_vram_mb,
            "gpu_name": self.gpu_name,
            "gpu_type": self.gpu_type,
            "cpu_cores": self.cpu_cores,
            "tier": self.tier.value,
        }


@dataclass
class ModelCompatibility:
    """Per-model compatibility verdict for a specific device."""

    model_name: str
    compatible: bool
    reason: str | None = None  # human-readable when incompatible
    estimated_ram_mb: int = 0
    estimated_vram_mb: int = 0

    def to_dict(self) -> dict:
        return {
            "model_name": self.model_name,
            "compatible": self.compatible,
            "reason": self.reason,
            "estimated_ram_mb": self.estimated_ram_mb,
            "estimated_vram_mb": self.estimated_vram_mb,
        }


# ── Hardware detection ──────────────────────────────────────────────────


def _get_system_ram_mb() -> tuple[int, int]:
    """Return (total_mb, available_mb) of system RAM."""
    try:
        import psutil

        mem = psutil.virtual_memory()
        return int(mem.total // (1024 * 1024)), int(mem.available // (1024 * 1024))
    except Exception:
        logger.debug("psutil RAM detection failed", exc_info=True)
        return 0, 0


def _get_gpu_info() -> tuple[int, int, str | None, str | None]:
    """Return (total_vram_mb, free_vram_mb, gpu_name, gpu_type)."""
    # NVIDIA CUDA via nvidia-smi
    from ..utils.gpu_query import probe_nvidia_smi
    from ..utils.platform_detect import get_gpu_info

    cuda = probe_nvidia_smi()
    if cuda is not None:
        return int(cuda.total_mb), int(cuda.free_mb), cuda.name, "cuda"

    # DirectML (Windows) - name only; no VRAM counter exposed via ONNX
    try:
        info = get_gpu_info()
        if info.get("acceleration") == "directml":
            return 0, 0, info.get("name"), "directml"
    except Exception:
        logger.debug("suppressed exception in device_capabilities.py:109", exc_info=True)

    # Apple Silicon MPS - unified memory, no separate VRAM counter
    import platform as _platform

    if _platform.system() == "Darwin" and _platform.machine() == "arm64":
        return 0, 0, "Apple Silicon (MPS)", "mps"

    return 0, 0, None, None


def _get_cpu_cores() -> int:
    try:
        import os

        return os.cpu_count() or 0
    except Exception:
        logger.debug("suppressed exception in device_capabilities.py:140", exc_info=True)
        return 0


def detect_device() -> DeviceCapabilities:
    """Detect the current device's hardware capabilities."""
    total_ram, available_ram = _get_system_ram_mb()
    total_vram, free_vram, gpu_name, gpu_type = _get_gpu_info()
    cpu_cores = _get_cpu_cores()

    # Tier classification
    tier = _classify_tier(total_ram, total_vram)

    return DeviceCapabilities(
        total_ram_mb=total_ram,
        available_ram_mb=available_ram,
        total_vram_mb=total_vram,
        free_vram_mb=free_vram,
        gpu_name=gpu_name,
        gpu_type=gpu_type,
        cpu_cores=cpu_cores,
        tier=tier,
    )


def _classify_tier(total_ram_mb: int, total_vram_mb: int) -> DeviceTier:
    """Classify device into a tier based on available memory.

    Tiers:
      low_end   — ≤ 8 GB RAM (regardless of GPU)
      mid_range — 8-16 GB RAM with ≤ 8 GB VRAM, or ≤ 8 GB VRAM alone
      high_end  — > 16 GB RAM, or > 8 GB VRAM
    """
    # High-end: generous RAM or generous VRAM
    if total_ram_mb > 16 * 1024 or total_vram_mb > 8 * 1024:
        return DeviceTier.HIGH_END

    # Low-end: tight RAM
    if total_ram_mb <= 8 * 1024:
        return DeviceTier.LOW_END

    # Everything in between (8-16 GB RAM, ≤ 8 GB VRAM)
    return DeviceTier.MID_RANGE


# ── Model compatibility ─────────────────────────────────────────────────


def _estimate_model_ram_mb(size_mb: int) -> int:
    """Estimate peak RAM usage for a model given its download size.

    Rules of thumb:
    - ONNX models: ~1.2x download size (decoder + buffers)
    - PyTorch models: ~2x download size (weights + optimizer state)
    - GGUF models: ~1.05x download size (memory-mapped)

    We use 2x as a safe upper bound for all formats since we don't know
    the runtime format at config time.
    """
    return int(size_mb * 2)


def _estimate_model_vram_mb(size_mb: int, gpu_only: bool) -> int:
    """Estimate VRAM usage.  GPU-only models must fit entirely in VRAM.

    CPU-only models use zero VRAM.  Hybrid models (ONNX with CUDA provider)
    use ~1.1x download size.
    """
    if not gpu_only:
        # Hybrid: ONNX with optional CUDA — might use VRAM, might not
        return int(size_mb * 1.1)
    return size_mb


# ── Tier thresholds for recommendations ─────────────────────────────────

# Maximum recommended download size (MB) per tier
TIER_MAX_MODEL_SIZE_MB: dict[DeviceTier, int] = {
    DeviceTier.LOW_END: 800,
    DeviceTier.MID_RANGE: 4000,
    DeviceTier.HIGH_END: 20000,
}

# Maximum recommended peak RAM (MB) per tier
TIER_MAX_MODEL_RAM_MB: dict[DeviceTier, int] = {
    DeviceTier.LOW_END: 1500,
    DeviceTier.MID_RANGE: 8000,
    DeviceTier.HIGH_END: 32000,
}

# Maximum recommended peak VRAM (MB) per tier
TIER_MAX_MODEL_VRAM_MB: dict[DeviceTier, int] = {
    DeviceTier.LOW_END: 2000,
    DeviceTier.MID_RANGE: 8000,
    DeviceTier.HIGH_END: 24000,
}


def check_model_compatibility(
    model_name: str,
    size_mb: int,
    gpu_only: bool = False,
    device: DeviceCapabilities | None = None,
) -> ModelCompatibility:
    """Check if a model will run on the given device."""
    if device is None:
        device = detect_device()

    estimated_ram = _estimate_model_ram_mb(size_mb)
    estimated_vram = _estimate_model_vram_mb(size_mb, gpu_only)

    # Check 1: GPU-only model without a GPU
    if gpu_only and device.total_vram_mb == 0:
        return ModelCompatibility(
            model_name=model_name,
            compatible=False,
            reason="Requires a GPU but none was detected",
            estimated_ram_mb=estimated_ram,
            estimated_vram_mb=estimated_vram,
        )

    # Check 2: Model too large for available RAM (leave 1 GB headroom for OS)
    available_for_model = device.available_ram_mb - 1024
    if estimated_ram > available_for_model and available_for_model > 0:
        return ModelCompatibility(
            model_name=model_name,
            compatible=False,
            reason=f"Needs ~{_mb_fmt(estimated_ram)} RAM but only {_mb_fmt(available_for_model)} is available",
            estimated_ram_mb=estimated_ram,
            estimated_vram_mb=estimated_vram,
        )

    # Check 3: Model too large for VRAM (if GPU is involved)
    if device.total_vram_mb > 0 and estimated_vram > 0:
        available_vram = device.free_vram_mb
        if estimated_vram > available_vram and available_vram > 0:
            return ModelCompatibility(
                model_name=model_name,
                compatible=False,
                reason=f"Needs ~{_mb_fmt(estimated_vram)} VRAM but only {_mb_fmt(available_vram)} is free",
                estimated_ram_mb=estimated_ram,
                estimated_vram_mb=estimated_vram,
            )

    # Check 4: Tier-based recommendation (soft — still compatible, just heavy)
    tier_max = TIER_MAX_MODEL_SIZE_MB.get(device.tier, 999999)
    if size_mb > tier_max:
        return ModelCompatibility(
            model_name=model_name,
            compatible=True,
            reason=f"Large for a {device.tier.value.replace('_', '-')} device — may run slowly",
            estimated_ram_mb=estimated_ram,
            estimated_vram_mb=estimated_vram,
        )

    return ModelCompatibility(
        model_name=model_name,
        compatible=True,
        estimated_ram_mb=estimated_ram,
        estimated_vram_mb=estimated_vram,
    )


def recommend_models(
    models: list[dict],
    device: DeviceCapabilities | None = None,
) -> list[dict]:
    """Annotate a list of model dicts with compatibility info.

    Each model dict must have at least 'model_name', 'size_mb', and
    'gpu_only' keys.  Returns the same list with added 'compatibility'
    dict per entry.
    """
    if device is None:
        device = detect_device()

    for model in models:
        compat = check_model_compatibility(
            model_name=model["model_name"],
            size_mb=model.get("size_mb", 0),
            gpu_only=model.get("gpu_only", False),
            device=device,
        )
        model["compatibility"] = compat.to_dict()

    return models


def _mb_fmt(mb: int) -> str:
    """Human-readable MB/GB string."""
    if mb >= 1024:
        return f"{mb / 1024:.1f} GB"
    return f"{mb} MB"
