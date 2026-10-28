"""Voice-conversion endpoints (RVC + Seed-VC)."""

import asyncio
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
from ..backends.rvc_onnx_backend import RVC_VOICE_PACKS
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
    engine: str = "rvc_onnx"  # "rvc_onnx" | "seed_vc" | "openvoice_onnx" | "cloud"
    # Consent
    consent_given: bool = False
    # RVC fields
    voice_pack: str = ""
    transpose: int = 0
    index_rate: float = 0.5
    f0_method: str = "rmvpe"
    # Seed-VC fields
    reference_audio_path: str = ""
    diffusion_steps: int = 10
    length_adjust: float = 1.0
    inference_cfg_rate: float = 0.7
    f0_condition: bool = False


@router.get("/voice-packs")
async def list_voice_packs():
    """List available RVC voice packs (installed + downloadable)."""
    from ..backends.rvc_onnx_backend import rvc_onnx_backend

    installed = set()
    models_dir = rvc_onnx_backend._get_models_dir()
    if models_dir.exists():
        for d in models_dir.iterdir():
            if d.is_dir() and any(f.suffix == ".onnx" for f in d.iterdir()):
                installed.add(d.name)

    source = rvc_onnx_backend.pack_source
    packs = []
    for name in RVC_VOICE_PACKS:
        desc = source(name)
        packs.append(
            {
                "name": name,
                "repo": desc["repo"],
                "installed": name in installed,
            }
        )
    return {"voice_packs": packs}


@router.post("/voice-pack/download")
async def download_voice_pack(pack_name: str):
    """Download an RVC voice pack's files from HuggingFace into the models dir."""
    desc = RVC_VOICE_PACKS.get(pack_name)
    if desc is None:
        raise HTTPException(status_code=404, detail=f"Unknown voice pack: {pack_name}")

    from huggingface_hub import hf_hub_download

    models_dir = Path(config.get_models_dir()) / "rvc" / pack_name
    models_dir.mkdir(parents=True, exist_ok=True)

    try:
        repo = desc["repo"]
        files = []
        if "pth" in desc:
            files.append(desc["pth"])
        if "index" in desc:
            files.append(desc["index"])
        if "zip" in desc:
            files.append(desc["zip"])

        for fname in files:
            await asyncio.to_thread(hf_hub_download, repo_id=repo, filename=fname, local_dir=str(models_dir))

        if "zip" in desc:
            import zipfile

            zip_path = models_dir / desc["zip"]
            if zip_path.exists():
                with zipfile.ZipFile(zip_path) as z:
                    z.extractall(models_dir)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Download failed: {e}") from e

    return {"status": "ok", "pack": pack_name}


@router.post("/voice-convert")
async def convert_voice(req: VoiceConvertRequest):
    """Convert a stored audio file into a target voice.

    - engine="rvc_onnx": needs a downloaded ``voice_pack`` (pre-trained).
    - engine="seed_vc": needs a ``reference_audio_path`` (zero-shot clone).
    Returns WAV audio.

    Requires ``consent_given=true`` — the caller must attest they have
    rights to use the source audio and any reference voice.
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
            voice = req.voice_pack or req.reference_audio_path
            try:
                wav, out_sr = backend.convert(audio, sr, voice, pitch_shift=req.transpose)
            except LookupError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            _log_provenance(req.engine, resolved, None, source_hash, None)
            buf = io.BytesIO()
            sf.write(buf, np.asarray(wav, dtype=np.float32), out_sr, format="WAV")
            buf.seek(0)
            return StreamingResponse(buf, media_type="audio/wav")

        backend = get_vc_backend(req.engine)
        lifecycle_manager.mark_model_used(req.engine)

        if req.engine == "seed_vc":
            ref = config.resolve_storage_path(req.reference_audio_path)
            if ref is None or not ref.exists():
                raise HTTPException(
                    status_code=400,
                    detail=ERR_SEED_VC_NEEDS_REF,
                )
            ref_path = ref
            reference_hash = _file_sha256(ref)
            wav, out_sr = backend.convert(
                audio,
                sr,
                str(ref),
                diffusion_steps=req.diffusion_steps,
                length_adjust=req.length_adjust,
                inference_cfg_rate=req.inference_cfg_rate,
                f0_condition=req.f0_condition,
                pitch_shift=req.transpose,
            )
        elif req.engine == "openvoice_onnx":
            ref = config.resolve_storage_path(req.reference_audio_path)
            if ref is None or not ref.exists():
                raise HTTPException(
                    status_code=400,
                    detail=ERR_SEED_VC_NEEDS_REF,
                )
            ref_path = ref
            reference_hash = _file_sha256(ref)
            wav, out_sr = backend.convert(str(resolved), str(ref))
        else:
            if req.voice_pack not in RVC_VOICE_PACKS:
                raise HTTPException(
                    status_code=400,
                    detail=f"That voice pack isn't in the studio. Available: {', '.join(RVC_VOICE_PACKS.keys())}",
                )
            wav, out_sr = backend.convert(
                audio,
                sr,
                req.voice_pack,
                transpose=req.transpose,
                index_rate=req.index_rate,
                f0_method=req.f0_method,
            )

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
