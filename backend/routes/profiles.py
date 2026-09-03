"""Voice profile endpoints."""

import io
import json as _json
import logging
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from backend.tool_dispatch import PROFILE_TOOLS, make_route

from .. import config, models
from ..database import ProfileSample as DBProfileSample, VoiceProfile as DBVoiceProfile, get_db
from ..services import channels, export_import, personality, profiles
from ..services.profiles import _profile_to_response
from ..utils.http import safe_content_disposition

logger = logging.getLogger(__name__)

router = APIRouter()


def _media_type_for(path) -> str:
    suffix = Path(path).suffix.lower()
    return {
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
        ".m4a": "audio/mp4",
        ".aac": "audio/aac",
        ".webm": "audio/webm",
    }.get(suffix, "audio/wav")


@router.get("/samples/{sample_id}")
async def serve_profile_sample_audio(sample_id: str, db: Session = Depends(get_db)):
    """Serve a voice profile sample's audio clip."""
    sample = db.query(DBProfileSample).filter_by(id=sample_id).first()
    audio_path = getattr(sample, "audio_path", None) if sample else None
    if not audio_path:
        raise HTTPException(status_code=404, detail="Sample not found")
    resolved = config.resolve_storage_path(audio_path)
    if resolved is None or not resolved.is_file():
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(resolved, media_type=_media_type_for(resolved))


# Generated profiles routes (deepened seam). Hand-written carve-outs
# (import_profile, serve_profile_sample_audio, avatar, channels, effects,
# export, etc.) remain below and are unchanged.

_PROFILE_ROUTE_MAP = {t.name: t for t in PROFILE_TOOLS}
router.add_api_route(
    "/profiles",
    make_route(_PROFILE_ROUTE_MAP["21labs.profiles.create_profile"]),
    methods=["POST"],
    response_model=models.VoiceProfileResponse,
)
router.add_api_route(
    "/profiles",
    make_route(_PROFILE_ROUTE_MAP["21labs.profiles.list_profiles"]),
    methods=["GET"],
    response_model=list[models.VoiceProfileResponse],
)


@router.post("/profiles/import", response_model=models.VoiceProfileResponse)
async def import_profile(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Import a voice profile from a ZIP archive."""
    MAX_FILE_SIZE = config.PROFILE_MAX_FILE_SIZE

    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400, detail=f"File too large. Maximum size is {MAX_FILE_SIZE / (1024 * 1024)}MB"
        )

    try:
        profile = await export_import.import_profile_from_zip(content, db)
        return profile
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error") from e


# ── Preset Voice Endpoints ───────────────────────────────────────────
# These MUST be declared before /profiles/{profile_id} to avoid the
# wildcard swallowing "presets" as a profile_id.


@router.get("/profiles/preset-voices")
async def list_all_preset_voices(engine: str | None = None):
    """List preset voices across engines (optional engine filter)."""
    from ..backends import get_all_model_configs

    out = []
    for cfg in get_all_model_configs():
        if not cfg.structured_preset_voices:
            continue
        if engine and cfg.engine != engine:
            continue
        out.append(
            {
                "engine": cfg.engine,
                "voices": [
                    {
                        "id": v.id,
                        "name": v.name,
                        "gender": v.gender,
                        "language": v.language,
                    }
                    for v in cfg.structured_preset_voices
                ],
            }
        )
    return {"engines": out}


@router.get("/profiles/presets/{engine}")
async def list_preset_voices(engine: str):
    """List available preset voices for an engine.

    Reads structured_preset_voices from the model catalog directly (the
    same source routes/models/status.py uses) rather than a hardcoded
    per-engine branch — so any engine with preset voices is covered
    automatically, including ones added after this was first written.
    """
    from ..backends import get_all_model_configs

    for cfg in get_all_model_configs():
        if cfg.engine == engine and cfg.structured_preset_voices:
            return {
                "engine": engine,
                "voices": [
                    {
                        "id": v.id,
                        "name": v.name,
                        "gender": v.gender,
                        "language": v.language,
                    }
                    for v in cfg.structured_preset_voices
                ],
            }
    return {"engine": engine, "voices": []}


@router.get("/profiles/voice-design-capabilities")
async def voice_design_capabilities():
    """Return per-engine voice design capability info for the frontend.

    Tells the UI which engines support text-described voice design,
    what attributes they accept, and provides help text for each.
    """
    from ..services.profiles import get_voice_design_capabilities

    return get_voice_design_capabilities()


@router.get("/profiles/{profile_id}", response_model=models.VoiceProfileResponse)
async def get_profile(
    profile_id: str,
    db: Session = Depends(get_db),
):
    """Get a voice profile by ID."""
    profile = await profiles.get_profile(profile_id, db)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile


@router.put("/profiles/{profile_id}", response_model=models.VoiceProfileResponse)
async def update_profile(
    profile_id: str,
    data: models.VoiceProfileCreate,
    db: Session = Depends(get_db),
):
    """Update a voice profile."""
    try:
        profile = await profiles.update_profile(profile_id, data, db)
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        return profile
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.delete("/profiles/{profile_id}")
async def delete_profile(
    profile_id: str,
    db: Session = Depends(get_db),
):
    """Delete a voice profile."""
    success = await profiles.delete_profile(profile_id, db)
    if not success:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"message": "Profile deleted successfully"}


SAMPLE_MAX_FILE_SIZE = config.PROFILE_SAMPLE_MAX_FILE_SIZE
SAMPLE_UPLOAD_CHUNK_SIZE = 1024 * 1024  # 1 MB


@router.post("/profiles/{profile_id}/samples", response_model=models.ProfileSampleResponse)
async def add_profile_sample(
    profile_id: str,
    file: UploadFile = File(...),
    reference_text: str = Form(...),
    db: Session = Depends(get_db),
):
    """Add a sample to a voice profile."""
    _allowed_audio_exts = {".wav", ".mp3", ".m4a", ".ogg", ".flac", ".aac", ".webm", ".opus"}
    _uploaded_ext = Path(file.filename or "").suffix.lower()
    file_suffix = _uploaded_ext if _uploaded_ext in _allowed_audio_exts else ".wav"

    with tempfile.NamedTemporaryFile(suffix=file_suffix, delete=False) as tmp:
        total_size = 0
        while chunk := await file.read(SAMPLE_UPLOAD_CHUNK_SIZE):
            total_size += len(chunk)
            if total_size > SAMPLE_MAX_FILE_SIZE:
                Path(tmp.name).unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large (max {SAMPLE_MAX_FILE_SIZE // (1024 * 1024)} MB)",
                )
            tmp.write(chunk)
        tmp_path = tmp.name

    try:
        sample = await profiles.add_profile_sample(
            profile_id,
            tmp_path,
            reference_text,
            db,
        )
        return sample
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to process audio file") from e
    finally:
        Path(tmp_path).unlink(missing_ok=True)


@router.get("/profiles/{profile_id}/samples", response_model=list[models.ProfileSampleResponse])
async def get_profile_samples(
    profile_id: str,
    db: Session = Depends(get_db),
):
    """Get all samples for a profile."""
    return await profiles.get_profile_samples(profile_id, db)


@router.delete("/profiles/samples/{sample_id}")
async def delete_profile_sample(
    sample_id: str,
    db: Session = Depends(get_db),
):
    """Delete a profile sample."""
    success = await profiles.delete_profile_sample(sample_id, db)
    if not success:
        raise HTTPException(status_code=404, detail="Sample not found")
    return {"message": "Sample deleted successfully"}


@router.put("/profiles/samples/{sample_id}", response_model=models.ProfileSampleResponse)
async def update_profile_sample(
    sample_id: str,
    data: models.ProfileSampleUpdate,
    db: Session = Depends(get_db),
):
    """Update a profile sample's reference text."""
    sample = await profiles.update_profile_sample(sample_id, data.reference_text, db)
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")
    return sample


@router.post("/profiles/{profile_id}/avatar", response_model=models.VoiceProfileResponse)
async def upload_profile_avatar(
    profile_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Upload or update avatar image for a profile."""
    # Stream to disk with a hard cap so an oversized upload can't OOM the worker.
    max_bytes = config.IMAGE_MAX_FILE_SIZE
    suffix = Path(file.filename or "").suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp_path = tmp.name
        total = 0
        while chunk := await file.read(1024 * 1024):
            total += len(chunk)
            if total > max_bytes:
                Path(tmp_path).unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"Avatar exceeds {max_bytes // (1024 * 1024)} MB limit.",
                )
            tmp.write(chunk)

    try:
        profile = await profiles.upload_avatar(profile_id, tmp_path, db)
        return profile
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    finally:
        Path(tmp_path).unlink(missing_ok=True)


@router.get("/profiles/{profile_id}/avatar")
async def get_profile_avatar(
    profile_id: str,
    db: Session = Depends(get_db),
):
    """Get avatar image for a profile."""
    profile = await profiles.get_profile(profile_id, db)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    if not profile.avatar_path:
        raise HTTPException(status_code=404, detail="No avatar found for this profile")

    avatar_path = config.resolve_storage_path(profile.avatar_path)
    if avatar_path is None or not avatar_path.exists():
        raise HTTPException(status_code=404, detail="Avatar file not found")

    return FileResponse(avatar_path)


@router.delete("/profiles/{profile_id}/avatar")
async def delete_profile_avatar(
    profile_id: str,
    db: Session = Depends(get_db),
):
    """Delete avatar image for a profile."""
    success = await profiles.delete_avatar(profile_id, db)
    if not success:
        raise HTTPException(status_code=404, detail="Profile not found or no avatar to delete")
    return {"message": "Avatar deleted successfully"}


@router.get("/profiles/{profile_id}/export")
async def export_profile(
    profile_id: str,
    db: Session = Depends(get_db),
):
    """Export a voice profile as a ZIP archive."""
    try:
        profile = await profiles.get_profile(profile_id, db)
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")

        zip_bytes = export_import.export_profile_to_zip(profile_id, db)

        safe_name = "".join(c for c in profile.name if c.isalnum() or c in (" ", "-", "_")).strip()
        if not safe_name:
            safe_name = "profile"
        filename = f"profile-{safe_name}.dstf.zip"

        return StreamingResponse(
            io.BytesIO(zip_bytes),
            media_type="application/zip",
            headers={"Content-Disposition": safe_content_disposition("attachment", filename)},
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error") from e


@router.get("/profiles/{profile_id}/channels")
async def get_profile_channels(
    profile_id: str,
    db: Session = Depends(get_db),
):
    """Get list of channel IDs assigned to a profile."""
    try:
        channel_ids = await channels.get_profile_channels(profile_id, db)
        return {"channel_ids": channel_ids}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.put("/profiles/{profile_id}/channels")
async def set_profile_channels(
    profile_id: str,
    data: models.ProfileChannelAssignment,
    db: Session = Depends(get_db),
):
    """Set which channels a profile is assigned to."""
    try:
        await channels.set_profile_channels(profile_id, data, db)
        return {"message": "Profile channels updated successfully"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.put("/profiles/{profile_id}/effects", response_model=models.VoiceProfileResponse)
async def update_profile_effects(
    profile_id: str,
    data: models.ProfileEffectsUpdate,
    db: Session = Depends(get_db),
):
    """Set or clear the default effects chain for a voice profile."""
    profile = db.query(DBVoiceProfile).filter_by(id=profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    if data.effects_chain is not None:
        from ..utils.effects import validate_effects_chain

        chain_dicts = [e.model_dump() for e in data.effects_chain]
        error = validate_effects_chain(chain_dicts)
        if error:
            raise HTTPException(status_code=400, detail=error)
        profile.effects_chain = _json.dumps(chain_dicts)
    else:
        profile.effects_chain = None

    profile.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(profile)

    return _profile_to_response(profile)


# ── Personality endpoint ──────────────────────────────────────────────
# Only ``/profiles/{id}/compose`` remains — the UI's compose button
# produces a fresh in-character utterance the user can edit before
# speaking. Rewrite now happens inside ``/generate`` (and ``/speak``)
# when ``personality=true``; there is no standalone rewrite/respond/speak
# endpoint.


@router.post(
    "/profiles/{profile_id}/compose",
    response_model=models.PersonalityTextResponse,
)
async def compose_in_character(
    profile_id: str,
    db: Session = Depends(get_db),
):
    """Produce a fresh utterance in the profile's character voice."""
    profile = db.query(DBVoiceProfile).filter_by(id=profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    try:
        result = await personality.compose_as_profile(profile.personality)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return models.PersonalityTextResponse(text=result.text, model_size=result.model_size)
