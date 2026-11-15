"""Voice-conversion endpoints (Tone-Color-VC, MeanVC2, Seed-VC, Cloud)."""

import hashlib
import io
import json
import logging
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import soundfile as sf
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .. import config
from ..backends import get_vc_backend
from ..errors import ERR_AUDIO_NOT_FOUND, ERR_SEED_VC_NEEDS_REF, ERR_VOICE_CONVERSION_FAILED
from ..utils.async_audio import async_load_audio
from ..utils.model_lifecycle import lifecycle_manager

logger = logging.getLogger(__name__)

router = APIRouter()


def _file_sha256(path: Path) -> str:
    """Compute SHA-256 hex digest of a file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _log_provenance(
    engine: str,
    source_path: Path,
    reference_path: Path | None,
    source_hash: str,
    reference_hash: str | None,
) -> None:
    """Append a provenance entry to the consent log."""
    log_path = config.get_data_dir() / "voice_conversion_log.jsonl"
    entry = {
        "timestamp": datetime.now(UTC).isoformat(),
        "engine": engine,
        "source_hash": source_hash,
        "reference_hash": reference_hash,
        "source_name": source_path.name,
        "reference_name": reference_path.name if reference_path else None,
    }
    try:
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")
    except OSError:
        logger.warning("Failed to write voice conversion provenance log")


class VoiceConvertRequest(BaseModel):
    audio_path: str
    engine: str = "meanvc2"  # "meanvc2" | "tone_color_vc" | "seed_vc" | "cloud"
    # Consent
    consent_given: bool = False
    # Clone fields
    reference_audio_path: str = ""
    seed: int | None = None


@router.post("/voice-convert")
async def convert_voice(req: VoiceConvertRequest):
    """Convert a stored audio file into the voice of a reference clip.

    - engine="meanvc2":     zero-shot (Apache-2.0),
    - engine="tone_color_vc": OpenVoice V2-derived (MIT),
    - engine="seed_vc":     zero-shot clone + optional SVC routes,
    - engine="cloud":       BYOK provider.
    Returns WAV audio.

    Requires ``consent_given=true`` — the caller must attest they have
    rights to use the source and reference audio.
    """
    if not req.consent_given:
        raise HTTPException(
            status_code=400,
            detail="Consent is required. Set consent_given=true to confirm you have rights to use this audio.",
        )

    resolved = config.resolve_storage_path(req.audio_path)
    if resolved is None or not resolved.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    # Compute source hash for provenance
    source_hash = _file_sha256(resolved)
    reference_hash: str | None = None
    ref_path: Path | None = None

    try:
        audio, sr = await async_load_audio(str(resolved))
        audio = audio.mean(axis=1) if audio.ndim > 1 else audio
        audio = np.asarray(audio, dtype=np.float32)

        if req.engine == "cloud":
            backend = get_vc_backend("cloud")
            lifecycle_manager.mark_model_used("cloud")
            voice = req.reference_audio_path
            try:
                wav, out_sr = backend.convert(audio, sr, voice, pitch_shift=req.seed or 0)
            except LookupError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            _log_provenance(req.engine, resolved, None, source_hash, None)
            buf = io.BytesIO()
            sf.write(buf, np.asarray(wav, dtype=np.float32), out_sr, format="WAV")
            buf.seek(0)
            return StreamingResponse(buf, media_type="audio/wav")

        backend = get_vc_backend(req.engine)
        lifecycle_manager.mark_model_used(req.engine)

        ref = config.resolve_storage_path(req.reference_audio_path)
        if ref is None or not ref.exists():
            raise HTTPException(
                status_code=400,
                detail=ERR_SEED_VC_NEEDS_REF,
            )
        ref_path = ref
        reference_hash = _file_sha256(ref)

        if req.engine == "seed_vc" or req.engine == "tone_color_vc" or req.engine == "meanvc2":
            wav, out_sr = await backend.convert(str(resolved), str(ref), seed=req.seed)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown conversion engine: {req.engine}")

        _log_provenance(req.engine, resolved, ref_path, source_hash, reference_hash)

        buf = io.BytesIO()
        sf.write(buf, np.asarray(wav, dtype=np.float32), out_sr, format="WAV")
        buf.seek(0)
        return StreamingResponse(buf, media_type="audio/wav")
    except HTTPException:
        raise
    except (RuntimeError, ValueError, OSError) as e:
        logger.exception("Voice conversion failed")
        raise HTTPException(status_code=500, detail=ERR_VOICE_CONVERSION_FAILED) from e
