"""Audio generation endpoints (SFX + music)."""

import asyncio
import io
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..backends import get_music_backend
from ..backends.base import ModelNotCachedError
from ..backends.protocols import MUSIC_ENGINES
from ..errors import ERR_ENGINE_NOT_AVAILABLE, ERR_MUSIC_FAILED, ERR_SFX_FAILED
from ..utils.model_lifecycle import lifecycle_manager

logger = logging.getLogger(__name__)

router = APIRouter()


class SFXGenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=1000)
    duration_seconds: float = Field(default=5.0, ge=0.1, le=30.0)
    seed: int | None = Field(default=None, ge=0, le=2**31 - 1)
    engine: str = "stable_audio"


class MusicGenerateRequest(BaseModel):
    engine: str = "acestep_gguf"
    prompt: str = Field(..., min_length=1, max_length=1000)
    duration_seconds: float = Field(default=30.0, ge=1.0, le=300.0)
    genre: str = Field(default="pop", max_length=32)
    mood: str = Field(default="neutral", max_length=32)
    tempo: int | None = Field(default=None, ge=40, le=240)
    seed: int | None = Field(default=None, ge=0, le=2**31 - 1)
    mode: str = Field(default="generate", pattern="^(generate|cover|repaint)$")
    reference_audio_path: str = ""


@router.post("/generate/music")
async def generate_music(data: MusicGenerateRequest):
    """Generate a music track using a registered MusicBackend engine."""
    if data.engine not in MUSIC_ENGINES:
        raise HTTPException(
            status_code=400,
            detail=f"That music engine isn't in the catalog. Supported: {', '.join(MUSIC_ENGINES)}",
        )
    # Manifest gate: music engines must be downloaded via the Store.
    from ..backends.configs import get_all_model_configs
    from ..services.model_registry import is_downloaded

    cfg = next((c for c in get_all_model_configs() if c.engine == data.engine), None)
    if cfg is not None and not is_downloaded(cfg.model_name, cfg.model_size):
        raise HTTPException(status_code=400, detail=f"Download this model from the Store first ({cfg.model_name})")
    backend = get_music_backend(data.engine)
    if not backend.is_available():
        raise HTTPException(status_code=503, detail=ERR_ENGINE_NOT_AVAILABLE)
    lifecycle_manager.mark_model_used(data.engine)

    try:
        from ..utils.rate_limiter import get_limiter, with_retry

        await get_limiter("music").acquire()

        gen_kwargs: dict = dict(
            prompt=data.prompt,
            duration_seconds=data.duration_seconds,
            genre=data.genre,
            mood=data.mood,
            tempo=data.tempo,
            seed=data.seed,
        )
        # Only pass mode/reference_audio_path when the backend accepts them
        # (currently acestep-specific).
        import inspect

        sig = inspect.signature(backend.generate)
        if "mode" in sig.parameters:
            gen_kwargs["mode"] = data.mode
        if "reference_audio_path" in sig.parameters:
            gen_kwargs["reference_audio_path"] = data.reference_audio_path or None

        audio, sample_rate = await with_retry(
            # generate() is a blocking, multi-minute CPU call - keep the
            # event loop free by running it in a worker thread.
            lambda: asyncio.to_thread(backend.generate, **gen_kwargs),
            attempts=3,
            label="music.generate",
        )
    except ModelNotCachedError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except LookupError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception("Music generation failed")
        raise HTTPException(status_code=500, detail=ERR_MUSIC_FAILED) from e

    import soundfile as sf

    buf = io.BytesIO()
    sf.write(buf, audio, sample_rate, format="WAV")
    buf.seek(0)

    from fastapi.responses import StreamingResponse

    return StreamingResponse(
        buf,
        media_type="audio/wav",
        headers={"Content-Disposition": 'inline; filename="generated_music.wav"'},
    )


@router.post("/generate/sfx")
async def generate_sfx(data: SFXGenerateRequest):
    """Generate sound effects using a registered MusicBackend engine."""
    if data.engine not in MUSIC_ENGINES:
        raise HTTPException(
            status_code=400,
            detail=f"That SFX engine isn't in the catalog. Supported: {', '.join(MUSIC_ENGINES)}",
        )
    # Manifest gate: SFX engines must be downloaded via the Store.
    from ..backends.configs import get_all_model_configs
    from ..services.model_registry import is_downloaded

    cfg = next((c for c in get_all_model_configs() if c.engine == data.engine), None)
    if cfg is not None and not is_downloaded(cfg.model_name, cfg.model_size):
        raise HTTPException(status_code=400, detail=f"Download this model from the Store first ({cfg.model_name})")
    backend = get_music_backend(data.engine)
    if not backend.is_available():
        raise HTTPException(status_code=503, detail=ERR_ENGINE_NOT_AVAILABLE)
    lifecycle_manager.mark_model_used(data.engine)

    try:
        from ..utils.rate_limiter import get_limiter, with_retry

        await get_limiter("sfx").acquire()
        audio, sample_rate = await with_retry(
            # generate() is a blocking, multi-second CPU call - keep the
            # event loop free by running it in a worker thread.
            lambda: asyncio.to_thread(
                backend.generate,
                prompt=data.prompt,
                duration_seconds=data.duration_seconds,
                seed=data.seed,
            ),
            attempts=3,
            label="sfx.generate",
        )
    except ModelNotCachedError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except LookupError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception("SFX generation failed")
        raise HTTPException(status_code=500, detail=ERR_SFX_FAILED) from e

    import soundfile as sf

    buf = io.BytesIO()
    sf.write(buf, audio, sample_rate, format="WAV")
    buf.seek(0)

    from fastapi.responses import StreamingResponse

    return StreamingResponse(
        buf,
        media_type="audio/wav",
        headers={"Content-Disposition": 'inline; filename="generated_sfx.wav"'},
    )
