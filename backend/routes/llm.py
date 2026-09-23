"""LLM inference endpoints."""

import logging

from fastapi import APIRouter, HTTPException

from .. import models
from ..backends import get_llm_model_configs
from ..backends.configs.llm import resolve_planner_size
from ..services.llm import get_llm_model
from ..utils.model_lifecycle import lifecycle_manager

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/llm/status")
async def llm_status():
    """Explain the local LLM state to the assistant panel.

    Returns loaded size, context window, cache state and the last load
    failure so the UI can say "model not downloaded" instead of hanging.
    """
    from ..services.model_registry import is_downloaded

    backend = get_llm_model()
    model_size = backend.model_size
    cfg = next(
        (c for c in get_llm_model_configs() if c.model_size == model_size),
        None,
    )
    return {
        "loaded": backend.is_loaded(),
        "model_size": backend._current_model_size or model_size,
        "n_ctx": backend.n_ctx,
        "cached": backend._is_model_cached(model_size),
        "load_error": backend.load_error,
        "entitled": is_downloaded(cfg.model_name, cfg.model_size) if cfg else False,
    }


@router.post("/llm/generate", response_model=models.LLMGenerateResponse)
async def llm_generate(request: models.LLMGenerateRequest):
    """Run a single-turn local LLM completion."""
    backend = get_llm_model()
    lifecycle_manager.mark_model_used("gguf_llm")
    model_size = resolve_planner_size(request.model_size or backend.model_size)

    valid_sizes = {cfg.model_size for cfg in get_llm_model_configs()}
    if model_size not in valid_sizes:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid LLM size '{model_size}'. Must be one of: {sorted(valid_sizes)}",
        )

    already_loaded = backend.is_loaded() and backend.model_size == model_size
    # Manifest gate: never auto-download. Only models the user downloaded via the
    # Models tab are loadable here.
    from ..services.model_registry import (
        MODEL_FILE_MISSING_MSG,
        MODEL_NOT_DOWNLOADED_MSG,
        is_downloaded,
    )

    catalog_cfg = next(
        (cfg for cfg in get_llm_model_configs() if cfg.model_size == model_size),
        None,
    )
    if catalog_cfg is not None and not is_downloaded(catalog_cfg.model_name, catalog_cfg.model_size):
        raise HTTPException(status_code=400, detail=MODEL_NOT_DOWNLOADED_MSG)
    if not already_loaded and not backend._is_model_cached(model_size):
        raise HTTPException(status_code=400, detail=MODEL_FILE_MISSING_MSG)

    examples: list[tuple[str, str]] | None = None
    if request.examples:
        for pair in request.examples:
            if len(pair) != 2:
                raise HTTPException(
                    status_code=400,
                    detail="Each example must be a [user, assistant] pair",
                )
        examples = [(pair[0], pair[1]) for pair in request.examples]

    max_tokens = request.max_tokens
    if max_tokens is None:
        # Honor the user's saved token budget (Assistant settings panel);
        # falls back to the RAM-aware default when unset.
        from ..services.settings import get_budget_max_tokens

        max_tokens = get_budget_max_tokens(model_size)

    try:
        text = await backend.generate(
            prompt=request.prompt,
            system=request.system,
            max_tokens=max_tokens,
            temperature=request.temperature,
            model_size=model_size,
            examples=examples,
        )
        return models.LLMGenerateResponse(text=text, model_size=model_size)
    except Exception as e:
        # The backend exception text can include filesystem paths and stack
        # frames — log it server-side and hand the client a generic message.
        logger.exception("LLM generate failed")
        raise HTTPException(status_code=500, detail="LLM generation failed") from e
