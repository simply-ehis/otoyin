"""Model load/unload endpoints."""

from fastapi import HTTPException
from fastapi.responses import StreamingResponse

from ...errors import ERR_MODEL_LOAD_FAILED, ERR_MODEL_UNLOAD_FAILED
from .common import logger, router


@router.post("/models/load")
async def load_model(engine: str | None = None, model_size: str = "default", model_name: str | None = None):
    """Load a TTS model, offloading any other resident TTS engine first.

    Passing ``engine`` loads that specific provider; omit it to load the default
    TTS engine. Switching the active provider frees the previous model's memory
    immediately (single resident TTS slot enforced in the registry).

    ``model_name`` is optional but recommended: when multiple configs share the
    same engine key (e.g. all LLM planners use ``gguf_llm``), the manifest gate
    needs the exact model_name to verify the right config was downloaded.
    """
    from ...backends import load_engine_model

    if not engine:
        raise HTTPException(
            status_code=400, detail="No engine specified and no default — download a model from the Store first"
        )
    target = engine
    # Manifest gate: never auto-download. A TTS engine may only load if the user
    # has actually downloaded its model via the Models tab (DB row present).
    from ...backends import get_all_model_configs
    from ...services.model_registry import MODEL_NOT_DOWNLOADED_MSG, is_downloaded

    if model_name:
        # Precise lookup: find the exact config by model_name
        cfg = next((c for c in get_all_model_configs() if c.model_name == model_name), None)
        if cfg is None:
            raise HTTPException(status_code=400, detail=f"Unknown model: {model_name}")
        # The caller passed both engine + model_name: they must agree, or the
        # frontend resolved the wrong engine (shared-engine bug) and Activate
        # would load a sibling model and look like it "did nothing".
        if cfg.engine != target:
            raise HTTPException(
                status_code=400,
                detail=f"Engine mismatch: {model_name} uses engine '{cfg.engine}', not '{target}'. Refresh the Store and retry.",
            )
    else:
        # Legacy fallback: find the first config matching engine + model_size
        cfg = next(
            (c for c in get_all_model_configs() if c.engine == target and c.model_size == model_size),
            None,
        )
        if cfg is None:
            # Broader fallback: first config matching engine only
            cfg = next((c for c in get_all_model_configs() if c.engine == target), None)
        if cfg is None:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown engine: {target} — download its model from the Store first",
            )
    if not is_downloaded(cfg.model_name, cfg.model_size):
        # Self-heal: files may still be on disk after a privacy wipe or a
        # recreated DB dropped the manifest row. Re-seed instead of 400 so
        # Activate keeps working for models the user already has.
        healed = False
        try:
            from ...services.model_registry import seed_download
            from ...utils.model_status import is_model_downloaded

            if is_model_downloaded(cfg.model_name):
                seed_download(
                    (
                        cfg.model_name,
                        cfg.model_size,
                        cfg.engine,
                        cfg.hf_repo_id,
                        None,
                    )
                )
                healed = True
                logger.info(
                    "Manifest self-healed for %s (files present, row was missing)",
                    cfg.model_name,
                )
        except Exception:
            logger.debug("Manifest self-heal failed for %s", cfg.model_name, exc_info=True)
        if not healed:
            raise HTTPException(status_code=400, detail=f"{MODEL_NOT_DOWNLOADED_MSG} ({cfg.model_name})")

    # Integrity gate: a tampered/partial cache must not load silently.
    try:
        from ...services.model_integrity import verify_model_hashes

        verdict = verify_model_hashes(cfg.model_name)
        if not verdict.get("ok", True):
            raise HTTPException(
                status_code=400,
                detail=f"Model files failed integrity check ({verdict.get('reason')}) — re-download {cfg.model_name} from the Store.",
            )
    except HTTPException:
        raise
    except Exception:
        logger.debug("Integrity check skipped for %s", cfg.model_name, exc_info=True)

    try:
        # Use the resolved config's model_size when available — the query
        # param may be "default" but GGUF engines need the exact size tag
        # (e.g. "4B-Q4_K_M") so the registry gate and backend load the
        # right model variant.
        resolved_size = cfg.model_size if cfg else model_size
        await load_engine_model(target, resolved_size)
        from ...utils.model_lifecycle import lifecycle_manager

        lifecycle_manager.mark_model_used(target)
        # Confirm the backend actually reports loaded — otherwise the UI
        # spinner stops but nothing is ready ("activate does nothing").
        try:
            from ...backends import check_model_loaded

            if not check_model_loaded(cfg):
                raise RuntimeError("backend did not report loaded after load")
        except RuntimeError:
            raise
        except Exception:
            logger.debug("Post-load check skipped for %s", cfg.model_name, exc_info=True)
        return {
            "message": f"Model {target} ({resolved_size}) loaded successfully",
            "model_name": cfg.model_name,
            "engine": target,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to load model %s", target)
        raise HTTPException(status_code=500, detail=ERR_MODEL_LOAD_FAILED) from e


@router.post("/models/unload")
async def unload_model():
    """Unload the default TTS model to free memory."""
    from ...services import tts

    try:
        tts.unload_tts_model()
        return {"message": "Model unloaded successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=ERR_MODEL_UNLOAD_FAILED) from e


@router.post("/models/{model_name}/unload")
async def unload_model_by_name(model_name: str):
    """Unload a specific model from memory without deleting it from disk."""
    from ...backends import get_model_config, unload_model_by_config

    config = get_model_config(model_name)
    if not config:
        raise HTTPException(status_code=400, detail=f"Unknown model: {model_name}")

    try:
        was_loaded = unload_model_by_config(config)
        if not was_loaded:
            return {"message": f"Model {model_name} is not loaded"}
        return {"message": f"Model {model_name} unloaded successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=ERR_MODEL_UNLOAD_FAILED) from e


@router.post("/models/unload-all")
async def unload_all_models():
    """Unload all loaded models to free memory.

    Used by the process supervisor when system memory is critically low.
    This is a defense mechanism against Windows OOM killer — it's better to
    gracefully unload models than have the entire process killed.
    """
    unloaded = []

    # Unload TTS
    try:
        from ...services import tts

        tts.unload_tts_model()
        unloaded.append("tts")
    except Exception as e:
        logger.debug("TTS unload failed: %s", e)

    # Unload Whisper/STT
    try:
        from ...services import transcribe

        transcribe.unload_whisper_model()
        unloaded.append("whisper")
    except Exception as e:
        logger.debug("Whisper unload failed: %s", e)

    # Unload LLM
    try:
        from ...services import llm

        llm.unload_llm_model()
        unloaded.append("llm")
    except Exception as e:
        logger.debug("LLM unload failed: %s", e)

    # Unload lifecycle-managed engines
    try:
        import inspect as _inspect

        from ...utils.model_lifecycle import lifecycle_manager

        for engine_name, handle in lifecycle_manager._engines.items():
            try:
                if not handle.is_loaded():
                    continue
            except Exception as e:
                logger.debug("Engine %s load check failed: %s", engine_name, e)
                continue
            try:
                res = handle.unload()
                if _inspect.isawaitable(res):
                    await res
                unloaded.append(engine_name)
            except Exception as e:
                logger.debug("Engine %s unload failed: %s", engine_name, e)
    except Exception as e:
        logger.debug("Lifecycle unload failed: %s", e)

    return {"message": f"Unloaded {len(unloaded)} models", "unloaded": unloaded}


@router.get("/models/progress/{model_name}")
async def get_model_progress(model_name: str):
    """Get model download progress via Server-Sent Events."""
    from ...utils.progress import get_progress_manager

    progress_manager = get_progress_manager()

    async def event_generator():
        async for event in progress_manager.subscribe(model_name):
            yield event

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
