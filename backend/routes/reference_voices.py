"""Reference voice library endpoints — browse and use bundled celebrity voice clips."""

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..errors import ERR_AUDIO_NOT_FOUND, ERR_REF_VOICE_NOT_FOUND

router = APIRouter()


def _media_type_for(path: str) -> str:
    suffix = Path(path).suffix.lower()
    return {
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
    }.get(suffix, "audio/wav")


@router.get("/reference-voices")
async def list_reference_voices(language: str | None = None, category: str | None = None):
    """List available reference voices, optionally filtered by language/category."""
    from ..services.reference_voices import (
        get_categories,
        get_languages,
        get_voices,
        manifest_voice_count,
        pack_downloaded,
    )

    voices = get_voices()
    if language:
        voices = [v for v in voices if v.language == language]
    if category:
        voices = [v for v in voices if v.category == category]

    return {
        "voices": [
            {
                "id": v.id,
                "name": v.name,
                "language": v.language,
                "category": v.category,
                "duration": v.duration,
                "description": v.description,
            }
            for v in voices
        ],
        "languages": get_languages(),
        "categories": get_categories(),
        "pack_downloaded": pack_downloaded(),
        "manifest_count": manifest_voice_count(),
    }


@router.get("/reference-voices/{voice_id}")
async def get_reference_voice(voice_id: str):
    """Get details for a specific reference voice."""
    from ..services.reference_voices import get_voice

    voice = get_voice(voice_id)
    if voice is None:
        raise HTTPException(status_code=404, detail=ERR_REF_VOICE_NOT_FOUND)

    return {
        "id": voice.id,
        "name": voice.name,
        "language": voice.language,
        "category": voice.category,
        "duration": voice.duration,
        "description": voice.description,
    }


@router.get("/reference-voices/{voice_id}/audio")
async def serve_reference_voice_audio(voice_id: str):
    """Stream the audio file for a reference voice."""
    from ..services.reference_voices import get_voice

    voice = get_voice(voice_id)
    if voice is None:
        raise HTTPException(status_code=404, detail=ERR_REF_VOICE_NOT_FOUND)

    audio_path = Path(voice.audio_path)
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    return FileResponse(
        audio_path,
        media_type=_media_type_for(str(audio_path)),
        headers={"Content-Disposition": f'inline; filename="{voice_id}.wav"'},
    )


class UseReferenceVoiceRequest(BaseModel):
    profile_name: str | None = None


@router.post("/reference-voices/{voice_id}/use")
async def use_reference_voice(voice_id: str, data: UseReferenceVoiceRequest):
    """Create a voice profile from a reference voice clip.

    Copies the reference audio into a new voice profile so it can be used
    with any cloning-compatible TTS engine.
    """
    import shutil
    import tempfile
    from pathlib import Path as FilePath

    from ..database import get_db
    from ..services import profiles
    from ..services.reference_voices import get_voice

    voice = get_voice(voice_id)
    if voice is None:
        raise HTTPException(status_code=404, detail=ERR_REF_VOICE_NOT_FOUND)

    audio_path = FilePath(voice.audio_path)
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail=ERR_AUDIO_NOT_FOUND)

    profile_name = data.profile_name or voice.name

    # Create a temp copy of the audio file for profile creation
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        shutil.copy2(audio_path, tmp.name)
        tmp_path = tmp.name

    try:
        from ..models import VoiceProfileCreate

        profile_data = VoiceProfileCreate(name=profile_name)
        db = next(get_db())
        try:
            profile = await profiles.create_profile(profile_data, db)
            sample = await profiles.add_profile_sample(
                profile.id,
                tmp_path,
                voice.description or f"Reference clip for {voice.name}",
                db,
            )
            return {
                "profile_id": profile.id,
                "profile_name": profile.name,
                "sample_id": sample.id,
                "voice_id": voice_id,
                "voice_name": voice.name,
            }
        finally:
            db.close()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    finally:
        FilePath(tmp_path).unlink(missing_ok=True)


@router.post("/reference-voices/reload")
async def reload_reference_voices():
    """Reload the reference voice registry."""
    from ..services.reference_voices import reload_voices

    count = reload_voices()
    return {"count": count, "message": f"Loaded {count} reference voices"}
