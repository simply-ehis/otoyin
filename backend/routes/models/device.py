"""Device capability detection endpoint.

Returns the host machine's hardware specs (RAM, VRAM, GPU, CPU) and a
per-model compatibility verdict so the UI can warn users before they
download models that won't fit on their device.
"""

from __future__ import annotations

from pydantic import BaseModel

from ...backends import get_all_model_configs
from ...services.device_capabilities import (
    check_model_compatibility,
    detect_device,
)
from .common import router


class DeviceCapabilitiesResponse(BaseModel):
    """Response shape for GET /device/capabilities."""

    total_ram_mb: int
    available_ram_mb: int
    total_vram_mb: int
    free_vram_mb: int
    gpu_name: str | None
    gpu_type: str | None
    cpu_cores: int
    tier: str
    models: list[dict]


@router.get("/device/capabilities", response_model=DeviceCapabilitiesResponse)
async def get_device_capabilities():
    """Detect device hardware and compute per-model compatibility.

    Returns the device's memory/GPU info, its tier classification, and a
    compatibility verdict for every registered model.  The frontend uses
    this to show warning badges on models that are too large for the
    user's hardware.
    """
    device = detect_device()

    # Annotate each registered model with compatibility info
    configs = get_all_model_configs()
    model_compat: list[dict] = []
    seen: set[str] = set()
    for cfg in configs:
        # Deduplicate (same model_name can appear in multiple engine configs)
        if cfg.model_name in seen:
            continue
        seen.add(cfg.model_name)

        compat = check_model_compatibility(
            model_name=cfg.model_name,
            size_mb=cfg.size_mb,
            gpu_only=cfg.gpu_only,
            device=device,
        )
        model_compat.append(
            {
                "model_name": cfg.model_name,
                "display_name": cfg.display_name,
                "category": cfg.category,
                "size_mb": cfg.size_mb,
                "gpu_only": cfg.gpu_only,
                "min_ram_mb": cfg.min_ram_mb,
                "min_vram_mb": cfg.min_vram_mb,
                "compatible": compat.compatible,
                "reason": compat.reason,
                "estimated_ram_mb": compat.estimated_ram_mb,
                "estimated_vram_mb": compat.estimated_vram_mb,
            }
        )

    return DeviceCapabilitiesResponse(
        total_ram_mb=device.total_ram_mb,
        available_ram_mb=device.available_ram_mb,
        total_vram_mb=device.total_vram_mb,
        free_vram_mb=device.free_vram_mb,
        gpu_name=device.gpu_name,
        gpu_type=device.gpu_type,
        cpu_cores=device.cpu_cores,
        tier=device.tier.value,
        models=model_compat,
    )
