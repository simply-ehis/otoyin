"""Model cache directory endpoint."""

from pathlib import Path

from .common import router


@router.get("/models/cache-dir")
async def get_models_cache_dir():
    """Get the path to the HuggingFace model cache directory."""
    from huggingface_hub import constants as hf_constants

    return {"path": str(Path(hf_constants.HF_HUB_CACHE))}
