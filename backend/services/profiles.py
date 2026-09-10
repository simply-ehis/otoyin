"""Voice profile management module."""

import json as _json
import logging
import shutil
import uuid
from datetime import UTC, datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import config
from ..database import Generation as DBGeneration, ProfileSample as DBProfileSample, VoiceProfile as DBVoiceProfile
from ..models import (
    EffectConfig,
    ProfileSampleResponse,
    VoiceProfileCreate,
    VoiceProfileResponse,
)
from ..utils.audio import save_audio, validate_and_load_reference_audio
from ..utils.cache import _get_cache_dir, clear_profile_cache
from ..utils.images import process_avatar, validate_image


def _parse_json_attr(obj, attr: str):
    """Parse a JSON Text column into a dict, returning None on failure."""
    raw = getattr(obj, attr, None)
    if not raw:
        return None
    try:
        return _json.loads(raw)
    except (ValueError, TypeError):
        return None


def _dumps_json(obj) -> str | None:
    """Serialize a dict to JSON Text, or None."""
    if obj is None:
        return None
    return _json.dumps(obj)


# ── Voice attribute composition ────────────────────────────────────────
# Structured attributes (gender, age, accent, tone, style, pacing) are
# stored as JSON in voice_attributes.  At generation time we compose them
# into a natural-language description that Parler-TTS (and any future
# text-described engine) can consume.

_ACCENT_MAP = {
    "american": "an American",
    "british": "a British",
    "australian": "an Australian",
    "indian": "an Indian",
    "irish": "an Irish",
    "scottish": "a Scottish",
    "french": "a French",
    "german": "a German",
    "spanish": "a Spanish",
    "italian": "an Italian",
    "japanese": "a Japanese",
    "chinese": "a Chinese",
    "korean": "a Korean",
    "brazilian": "a Brazilian",
    "mexican": "a Mexican",
    "russian": "a Russian",
    "arabic": "an Arabic",
    "african": "an African",
    "caribbean": "a Caribbean",
    "canadian": "a Canadian",
    "new_zealand": "a New Zealand",
    "south_african": "a South African",
}

_GENDER_MAP = {
    "male": "male",
    "female": "female",
    "non_binary": "non-binary",
}

_AGE_MAP = {
    "child": "a young child",
    "teen": "a teenager",
    "young_adult": "a young adult",
    "adult": "an adult",
    "middle_aged": "a middle-aged",
    "senior": "an older",
}


def compose_design_prompt(attrs: dict | None, fallback: str | None = None) -> str:
    """Compose a natural-language voice description from structured attributes.

    Returns a string like:
      "A young adult female speaker with a warm, clear British accent
       and an enthusiastic, fast-paced delivery."

    Falls back to ``fallback`` (the raw design_prompt) when attrs is empty.
    """
    if not attrs:
        return fallback or ""

    parts: list[str] = []

    # Gender + age + accent form the noun phrase
    gender = _GENDER_MAP.get(attrs.get("gender", ""), "")
    age = _AGE_MAP.get(attrs.get("age", ""), "")
    accent = _ACCENT_MAP.get(attrs.get("accent", ""), "")

    # Build the speaker noun
    noun_parts = [p for p in [age, gender] if p]
    noun = " ".join(noun_parts) if noun_parts else ""

    if accent:
        if noun:
            parts.append(f"{accent} {noun}")
        else:
            parts.append(f"{accent} speaker")
    else:
        if noun:
            parts.append(f"{noun} speaker")
        else:
            parts.append("a speaker")

    # Tone
    tone = attrs.get("tone", "")
    if tone:
        parts.append(f"with a {tone} tone")

    # Speaking style
    style = attrs.get("style", "")
    if style:
        parts.append(f"and a {style} delivery")

    # Pacing
    pacing = attrs.get("pacing", "")
    if pacing:
        parts.append(f"speaking at a {pacing} pace")

    description = " ".join(parts) + "."
    # Capitalize first letter without lowercasing the rest
    return description[0].upper() + description[1:] if description else description


logger = logging.getLogger(__name__)

CLONING_ENGINES = {
    "zonos_gguf",
    "styletts2",
    "qwen3_tts",
    "pocket_tts",
    "moss_tts_nano",
    "neutts",
    "neutts_2e",
    "parler_tts_gguf",
    "orpheus",
    "bark_small",
}

# Engines that accept text-described voice design (Parler-TTS pattern:
# a natural-language description controls gender, tone, accent, style).
DESIGN_CAPABLE_ENGINES: dict[str, dict] = {
    "parler_tts_gguf": {
        "label": "Parler-TTS Mini",
        "design_mode": "text_description",
        "description": "Text-described voice design — compose a natural-language description of the speaker.",
        "supported_attributes": ["gender", "age", "accent", "tone", "style", "pacing"],
        "attributes_help": {
            "gender": "Controls the speaker gender (male/female/non-binary).",
            "age": "Controls apparent age (child/teen/young_adult/adult/middle_aged/senior).",
            "accent": "Sets the speaker accent/nationality (american, british, french, etc.).",
            "tone": "Voice quality (warm, bright, deep, husky, clear, smooth, etc.).",
            "style": "Speaking delivery style (formal, casual, dramatic, narrative, etc.).",
            "pacing": "Speaking speed (slow/moderate/fast).",
        },
    },
    "neutts_2e": {
        "label": "NeuTTS-2E",
        "design_mode": "text_description",
        "description": "Emotion-aware voice design — compose a natural-language description of the speaker.",
        "supported_attributes": ["gender", "age", "accent", "tone", "style", "pacing"],
        "attributes_help": {
            "gender": "Controls the speaker gender (male/female/non-binary).",
            "age": "Controls apparent age (child/teen/young_adult/adult/middle_aged/senior).",
            "accent": "Sets the speaker accent/nationality (american, british, french, etc.).",
            "tone": "Voice quality (warm, bright, deep, husky, clear, smooth, etc.).",
            "style": "Speaking delivery style (formal, casual, dramatic, narrative, etc.).",
            "pacing": "Speaking speed (slow/moderate/fast).",
        },
    },
}


def get_voice_design_capabilities() -> dict:
    """Return per-engine voice design capability info for the frontend."""
    return {
        "engines": DESIGN_CAPABLE_ENGINES,
        "default_engine": "parler_tts_gguf",
        "composed_prompt_preview": True,
    }


def _profile_to_response(
    profile: DBVoiceProfile,
    generation_count: int = 0,
    sample_count: int = 0,
) -> VoiceProfileResponse:
    """Convert a DB profile to a VoiceProfileResponse, deserializing effects_chain."""
    effects_chain = None
    if profile.effects_chain:
        try:
            raw = _json.loads(profile.effects_chain)
            effects_chain = [EffectConfig(**e) for e in raw]
        except Exception as e:
            import logging

            logging.warning(f"Failed to parse effects_chain for profile {profile.id}: {e}")
    return VoiceProfileResponse(
        id=profile.id,
        name=profile.name,
        description=profile.description,
        language=profile.language,
        avatar_path=profile.avatar_path,
        effects_chain=effects_chain,
        voice_type=getattr(profile, "voice_type", None) or "cloned",
        preset_engine=getattr(profile, "preset_engine", None),
        preset_voice_id=getattr(profile, "preset_voice_id", None),
        design_prompt=getattr(profile, "design_prompt", None),
        voice_attributes=_parse_json_attr(profile, "voice_attributes"),
        default_engine=getattr(profile, "default_engine", None),
        personality=getattr(profile, "personality", None),
        generation_count=generation_count,
        sample_count=sample_count,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
    )


def _get_preset_voice_ids(engine: str) -> set[str]:
    if engine == "kokoro":
        from ..backends.kokoro_backend import KOKORO_VOICES

        return {voice_id for voice_id, _name, _gender, _lang in KOKORO_VOICES}

    if engine == "bark_small":
        from ..backends.bark_backend import BARK_VOICES

        return {voice_id for voice_id, _name, _gender, _lang in BARK_VOICES}

    return set()


def _validate_profile_fields(
    *,
    voice_type: str,
    preset_engine: str | None,
    preset_voice_id: str | None,
    design_prompt: str | None,
    voice_attributes: dict | None = None,
    default_engine: str | None,
) -> str | None:
    if voice_type == "preset":
        if not preset_engine or not preset_voice_id:
            return "Preset profiles require both preset_engine and preset_voice_id"
        if default_engine and default_engine != preset_engine:
            return "Preset profiles must use their preset_engine as default_engine"

        available_voice_ids = _get_preset_voice_ids(preset_engine)
        if available_voice_ids and preset_voice_id not in available_voice_ids:
            return f"Preset voice '{preset_voice_id}' is not valid for engine '{preset_engine}'"
        return None

    if voice_type == "designed":
        has_prompt = design_prompt and design_prompt.strip()
        has_attrs = voice_attributes and any(v for v in voice_attributes.values() if v)
        if not has_prompt and not has_attrs:
            return "Designed profiles require a design_prompt or voice_attributes"
        if preset_engine or preset_voice_id:
            return "Designed profiles cannot set preset_engine or preset_voice_id"
        return None

    if preset_engine or preset_voice_id:
        return "Cloned profiles cannot set preset_engine or preset_voice_id"
    if design_prompt:
        return "Cloned profiles cannot set design_prompt"
    if default_engine and default_engine not in CLONING_ENGINES:
        return f"Cloned profiles cannot use default engine '{default_engine}'"
    return None


def validate_profile_engine(profile, engine: str) -> None:
    voice_type = getattr(profile, "voice_type", None) or "cloned"

    if voice_type == "preset":
        preset_engine = getattr(profile, "preset_engine", None)
        preset_voice_id = getattr(profile, "preset_voice_id", None)
        if not preset_engine or not preset_voice_id:
            raise ValueError(f"Preset profile {profile.id} is missing preset engine metadata")
        if preset_engine != engine:
            raise ValueError(f"Preset profile {profile.id} only supports engine '{preset_engine}', not '{engine}'")
        return

    if voice_type == "designed":
        design_prompt = getattr(profile, "design_prompt", None)
        if not design_prompt or not design_prompt.strip():
            raise ValueError(f"Designed profile {profile.id} is missing design_prompt")
        return

    if engine not in CLONING_ENGINES:
        raise ValueError(f"Engine '{engine}' does not support cloned voice profiles")


async def create_profile(
    data: VoiceProfileCreate,
    db: Session,
) -> VoiceProfileResponse:
    """
    Create a new voice profile.

    Args:
        data: Profile creation data
        db: Database session

    Returns:
        Created profile

    Raises:
        ValueError: If a profile with the same name already exists
    """
    existing_profile = db.query(DBVoiceProfile).filter_by(name=data.name).first()
    if existing_profile:
        raise ValueError(f"A profile with the name '{data.name}' already exists. Please choose a different name.")

    # Auto-set default_engine for preset profiles
    default_engine = data.default_engine
    voice_type = data.voice_type or "cloned"
    if voice_type == "preset" and data.preset_engine and not default_engine:
        default_engine = data.preset_engine

    # Auto-compose design_prompt from voice_attributes if provided
    voice_attributes = getattr(data, "voice_attributes", None)
    design_prompt = data.design_prompt
    if voice_type == "designed" and voice_attributes and not design_prompt:
        design_prompt = compose_design_prompt(voice_attributes)

    validation_error = _validate_profile_fields(
        voice_type=voice_type,
        preset_engine=data.preset_engine,
        preset_voice_id=data.preset_voice_id,
        design_prompt=design_prompt,
        voice_attributes=voice_attributes,
        default_engine=default_engine,
    )
    if validation_error:
        raise ValueError(validation_error)

    db_profile = DBVoiceProfile(
        id=str(uuid.uuid4()),
        name=data.name,
        description=data.description,
        language=data.language,
        voice_type=voice_type,
        preset_engine=data.preset_engine,
        preset_voice_id=data.preset_voice_id,
        design_prompt=design_prompt,
        voice_attributes=_dumps_json(voice_attributes),
        default_engine=default_engine,
        personality=data.personality,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    db.add(db_profile)
    db.commit()
    db.refresh(db_profile)

    profile_dir = config.get_profiles_dir() / db_profile.id
    profile_dir.mkdir(parents=True, exist_ok=True)

    from .telemetry import track_event

    track_event(
        "profile_created",
        {"voice_type": voice_type, "engine": default_engine},
    )

    return _profile_to_response(db_profile)


async def add_profile_sample(
    profile_id: str,
    audio_path: str,
    reference_text: str,
    db: Session,
) -> ProfileSampleResponse:
    """
    Add a sample to a voice profile.

    Args:
        profile_id: Profile ID
        audio_path: Path to temporary audio file
        reference_text: Transcript of audio
        db: Database session

    Returns:
        Created sample
    """
    import asyncio

    profile = db.query(DBVoiceProfile).filter_by(id=profile_id).first()
    if not profile:
        raise ValueError(f"Profile {profile_id} not found")

    # Validate and load audio in a single pass, off the event loop
    is_valid, error_msg, audio, sr = await asyncio.to_thread(validate_and_load_reference_audio, audio_path)
    if not is_valid:
        raise ValueError(f"Invalid reference audio: {error_msg}")

    # Offline neural cleanup (DeepFilterNet) on ingest — every reference clip
    # brought into the app is denoised before it is stored.
    from .noise_reduction import reduce_noise_deepfilternet

    audio = await asyncio.to_thread(reduce_noise_deepfilternet, audio, sr)

    sample_id = str(uuid.uuid4())
    profile_dir = config.get_profiles_dir() / profile_id
    profile_dir.mkdir(parents=True, exist_ok=True)

    dest_path = profile_dir / f"{sample_id}.wav"
    await asyncio.to_thread(save_audio, audio, str(dest_path), sr)

    db_sample = DBProfileSample(
        id=sample_id,
        profile_id=profile_id,
        audio_path=config.to_storage_path(dest_path),
        reference_text=reference_text,
    )

    db.add(db_sample)

    profile.updated_at = datetime.now(UTC)

    db.commit()
    db.refresh(db_sample)

    # Invalidate combined audio cache for this profile
    # Since a new sample was added, any cached combined audio is now stale
    clear_profile_cache(profile_id)

    return ProfileSampleResponse.model_validate(db_sample)


async def get_profile(
    profile_id: str,
    db: Session,
) -> VoiceProfileResponse | None:
    """
    Get a voice profile by ID.

    Args:
        profile_id: Profile ID
        db: Database session

    Returns:
        Profile or None if not found
    """
    profile = db.query(DBVoiceProfile).filter_by(id=profile_id).first()
    if not profile:
        return None

    return _profile_to_response(profile)


def get_profile_orm_by_name_or_id(
    name_or_id: str,
    db: Session,
) -> DBVoiceProfile | None:
    """Resolve a profile from a user-supplied string that may be either id or name.

    Id is tried first (fast path, matches UUIDs). Name fallback is
    case-insensitive so agents can say "Morgan" regardless of casing.
    """
    if not name_or_id:
        return None
    row = db.query(DBVoiceProfile).filter(DBVoiceProfile.id == name_or_id).first()
    if row is not None:
        return row
    return db.query(DBVoiceProfile).filter(func.lower(DBVoiceProfile.name) == name_or_id.lower()).first()


async def get_profile_samples(
    profile_id: str,
    db: Session,
) -> list[ProfileSampleResponse]:
    """
    Get all samples for a profile.

    Args:
        profile_id: Profile ID
        db: Database session

    Returns:
        List of samples
    """
    samples = db.query(DBProfileSample).filter_by(profile_id=profile_id).all()
    return [ProfileSampleResponse.model_validate(s) for s in samples]


async def list_profiles(db: Session) -> list[VoiceProfileResponse]:
    """
    List all voice profiles with generation and sample counts.

    Args:
        db: Database session

    Returns:
        List of profiles
    """
    profiles = db.query(DBVoiceProfile).order_by(DBVoiceProfile.created_at.desc()).all()

    if not profiles:
        return []

    # Batch-fetch generation counts
    gen_counts_rows = (
        db.query(DBGeneration.profile_id, func.count(DBGeneration.id)).group_by(DBGeneration.profile_id).all()
    )
    gen_counts = {row[0]: row[1] for row in gen_counts_rows}

    # Batch-fetch sample counts
    sample_counts_rows = (
        db.query(DBProfileSample.profile_id, func.count(DBProfileSample.id)).group_by(DBProfileSample.profile_id).all()
    )
    sample_counts = {row[0]: row[1] for row in sample_counts_rows}

    return [
        _profile_to_response(
            p,
            generation_count=gen_counts.get(p.id, 0),
            sample_count=sample_counts.get(p.id, 0),
        )
        for p in profiles
    ]


async def update_profile(
    profile_id: str,
    data: VoiceProfileCreate,
    db: Session,
) -> VoiceProfileResponse | None:
    """
    Update a voice profile.

    Args:
        profile_id: Profile ID
        data: Updated profile data
        db: Database session

    Returns:
        Updated profile or None if not found

    Raises:
        ValueError: If a profile with the same name already exists (different profile)
    """
    profile = db.query(DBVoiceProfile).filter_by(id=profile_id).first()
    if not profile:
        return None

    if profile.name != data.name:
        existing_profile = db.query(DBVoiceProfile).filter_by(name=data.name).first()
        if existing_profile:
            raise ValueError(f"A profile with the name '{data.name}' already exists. Please choose a different name.")

    voice_type = getattr(data, "voice_type", None) or getattr(profile, "voice_type", None) or "cloned"
    preset_engine = getattr(data, "preset_engine", None) or getattr(profile, "preset_engine", None)
    preset_voice_id = getattr(data, "preset_voice_id", None) or getattr(profile, "preset_voice_id", None)
    design_prompt = getattr(data, "design_prompt", None) or getattr(profile, "design_prompt", None)
    voice_attributes = getattr(data, "voice_attributes", None) or _parse_json_attr(profile, "voice_attributes")
    default_engine = (
        data.default_engine if data.default_engine is not None else getattr(profile, "default_engine", None)
    )

    # Auto-compose design_prompt from voice_attributes if provided
    if voice_type == "designed" and voice_attributes and not design_prompt:
        design_prompt = compose_design_prompt(voice_attributes)

    validation_error = _validate_profile_fields(
        voice_type=voice_type,
        preset_engine=preset_engine,
        preset_voice_id=preset_voice_id,
        design_prompt=design_prompt,
        voice_attributes=voice_attributes,
        default_engine=default_engine,
    )
    if validation_error:
        raise ValueError(validation_error)

    profile.name = data.name
    profile.description = data.description
    profile.language = data.language
    profile.personality = data.personality
    profile.design_prompt = design_prompt
    profile.voice_attributes = _dumps_json(voice_attributes)
    if data.default_engine is not None:
        profile.default_engine = data.default_engine or None  # empty string → NULL
    profile.updated_at = datetime.now(UTC)

    db.commit()
    db.refresh(profile)

    return _profile_to_response(profile)


async def delete_profile(
    profile_id: str,
    db: Session,
) -> bool:
    """
    Delete a voice profile and all associated data.

    Args:
        profile_id: Profile ID
        db: Database session

    Returns:
        True if deleted, False if not found
    """
    profile = db.query(DBVoiceProfile).filter_by(id=profile_id).first()
    if not profile:
        return False

    from .history import delete_generations_by_profile

    await delete_generations_by_profile(profile_id, db)

    # Clean up library tags, audiobook cast refs, channel mappings, and captures linkage
    from ..database.models import (
        AudiobookVoiceCast as DBCast,
        LibraryItemTag as DBTag,
        ProfileChannelMapping as DBChannelMap,
    )

    # Remove library tags pointing at this profile's samples is handled via cascade,
    # but also clean any tag refs for the profile itself if ever tagged
    db.query(DBTag).filter(DBTag.item_id == profile_id).delete(synchronize_session=False)
    # Clear audiobook voice cast assignments
    db.query(DBCast).filter(DBCast.profile_id == profile_id).update(
        {DBCast.profile_id: None}, synchronize_session=False
    )
    # Clear channel mappings
    db.query(DBChannelMap).filter(DBChannelMap.profile_id == profile_id).delete()

    db.query(DBProfileSample).filter_by(profile_id=profile_id).delete()

    db.delete(profile)
    db.commit()

    profile_dir = config.get_profiles_dir() / profile_id
    if profile_dir.exists():
        shutil.rmtree(profile_dir)

    # Clean up combined audio cache files for this profile
    clear_profile_cache(profile_id)

    from .telemetry import track_event

    track_event("profile_deleted", {"voice_type": profile.voice_type})

    return True


async def delete_profile_sample(
    sample_id: str,
    db: Session,
) -> bool:
    """
    Delete a profile sample.

    Args:
        sample_id: Sample ID
        db: Database session

    Returns:
        True if deleted, False if not found
    """
    sample = db.query(DBProfileSample).filter_by(id=sample_id).first()
    if not sample:
        return False

    # Store profile_id before deleting
    profile_id = sample.profile_id

    audio_path = config.resolve_storage_path(sample.audio_path)
    if audio_path is not None and audio_path.exists():
        audio_path.unlink()

    db.delete(sample)
    db.commit()

    # Invalidate combined audio cache for this profile
    # Since the sample set changed, any cached combined audio is now stale
    clear_profile_cache(profile_id)

    return True


async def update_profile_sample(
    sample_id: str,
    reference_text: str,
    db: Session,
) -> ProfileSampleResponse | None:
    """
    Update a profile sample's reference text.

    Args:
        sample_id: Sample ID
        reference_text: Updated reference text
        db: Database session

    Returns:
        Updated sample or None if not found
    """
    sample = db.query(DBProfileSample).filter_by(id=sample_id).first()
    if not sample:
        return None

    # Store profile_id before updating
    profile_id = sample.profile_id

    sample.reference_text = reference_text
    db.commit()
    db.refresh(sample)

    # Invalidate combined audio cache for this profile
    # Since the reference text changed, cache keys and combined text are now stale
    clear_profile_cache(profile_id)

    return ProfileSampleResponse.model_validate(sample)


async def create_voice_prompt_for_profile(
    profile_id: str,
    db: Session,
    use_cache: bool = True,
    engine: str = "kokoro",
) -> dict:
    """
    Create a voice prompt from a profile.

    For cloned profiles: combines all audio samples into a voice prompt.
    For preset profiles: returns the engine-specific preset voice reference.
    For designed profiles: returns the text design prompt (future).

    Args:
        profile_id: Profile ID
        db: Database session
        use_cache: Whether to use cached prompts
        engine: TTS engine to create prompt for

    Returns:
        Voice prompt dictionary
    """
    profile = db.query(DBVoiceProfile).filter_by(id=profile_id).first()
    if not profile:
        raise ValueError(f"Profile not found: {profile_id}")

    voice_type = getattr(profile, "voice_type", None) or "cloned"
    validate_profile_engine(profile, engine)

    if voice_type == "preset":
        return _build_preset_voice_prompt(profile, profile_id, engine)

    if voice_type == "designed":
        return _build_designed_voice_prompt(profile, profile_id)

    if engine not in CLONING_ENGINES:
        raise ValueError(f"Engine '{engine}' does not support cloned voice profiles")

    return await _build_cloned_voice_prompt(profile_id, db, engine, use_cache)


def _build_preset_voice_prompt(profile, profile_id: str, engine: str) -> dict:
    """Build voice prompt for a preset profile."""
    if not profile.preset_engine or not profile.preset_voice_id:
        raise ValueError(f"Preset profile {profile_id} is missing preset engine metadata")
    if profile.preset_engine != engine:
        raise ValueError(f"Preset profile {profile_id} only supports engine '{profile.preset_engine}', not '{engine}'")
    return {
        "voice_type": "preset",
        "preset_engine": profile.preset_engine,
        "preset_voice_id": profile.preset_voice_id,
    }


def _build_designed_voice_prompt(profile, profile_id: str) -> dict:
    """Build voice prompt for a designed profile."""
    # Prefer structured voice_attributes → compose natural-language description
    attrs = _parse_json_attr(profile, "voice_attributes")
    if attrs:
        description = compose_design_prompt(attrs, fallback=profile.design_prompt)
    else:
        description = profile.design_prompt

    if not description or not description.strip():
        raise ValueError(f"Designed profile {profile_id} is missing design_prompt")
    return {
        "voice_type": "designed",
        "design_prompt": description,
    }


async def _build_cloned_voice_prompt(profile_id: str, db: Session, engine: str, use_cache: bool) -> dict:
    """Build voice prompt for a cloned profile from audio samples."""
    from ..backends import get_tts_backend_for_engine

    samples = db.query(DBProfileSample).filter_by(profile_id=profile_id).all()
    if not samples:
        raise ValueError(f"No samples found for profile {profile_id}")

    tts_model = get_tts_backend_for_engine(engine)

    if len(samples) == 1:
        sample = samples[0]
        sample_audio_path = config.resolve_storage_path(sample.audio_path)
        if sample_audio_path is None:
            raise ValueError(f"Sample audio not found for profile {profile_id}")
        voice_prompt, _ = await tts_model.create_voice_prompt(
            str(sample_audio_path),
            sample.reference_text,
            use_cache=use_cache,
        )
        return voice_prompt

    audio_paths = []
    for sample in samples:
        sample_audio_path = config.resolve_storage_path(sample.audio_path)
        if sample_audio_path is None:
            raise ValueError(f"Sample audio not found for profile {profile_id}")
        audio_paths.append(str(sample_audio_path))
    reference_texts = [s.reference_text for s in samples]

    combined_audio, combined_text = await tts_model.combine_voice_prompts(
        audio_paths,
        reference_texts,
    )

    # Save combined audio to cache directory (persistent)
    import hashlib

    sample_ids_str = "-".join(sorted([s.id for s in samples]))
    combination_hash = hashlib.md5(sample_ids_str.encode()).hexdigest()[:12]

    cache_dir = _get_cache_dir()
    cache_dir.mkdir(parents=True, exist_ok=True)
    combined_path = cache_dir / f"combined_{profile_id}_{combination_hash}.wav"

    save_audio(combined_audio, str(combined_path), 24000)

    voice_prompt, _ = await tts_model.create_voice_prompt(
        str(combined_path),
        combined_text,
        use_cache=use_cache,
    )
    return voice_prompt


async def upload_avatar(
    profile_id: str,
    image_path: str,
    db: Session,
) -> VoiceProfileResponse:
    """
    Upload and process avatar image for a profile.

    Args:
        profile_id: Profile ID
        image_path: Path to uploaded image file
        db: Database session

    Returns:
        Updated profile
    """
    profile = db.query(DBVoiceProfile).filter_by(id=profile_id).first()
    if not profile:
        raise ValueError(f"Profile {profile_id} not found")

    is_valid, error_msg = validate_image(image_path)
    if not is_valid:
        raise ValueError(error_msg)

    if profile.avatar_path:
        old_avatar = config.resolve_storage_path(profile.avatar_path)
        if old_avatar is not None and old_avatar.exists():
            old_avatar.unlink()

    # Determine file extension from uploaded file
    from PIL import Image

    with Image.open(image_path) as img:
        # Normalize JPEG variants (MPO is multi-picture format from some cameras)
        img_format = img.format
        if img_format in ("MPO", "JPG"):
            img_format = "JPEG"

        ext_map = {"PNG": ".png", "JPEG": ".jpg", "WEBP": ".webp"}
        ext = ext_map.get(img_format, ".png")

    profile_dir = config.get_profiles_dir() / profile_id
    profile_dir.mkdir(parents=True, exist_ok=True)
    output_path = profile_dir / f"avatar{ext}"

    process_avatar(image_path, str(output_path))

    profile.avatar_path = config.to_storage_path(output_path)
    profile.updated_at = datetime.now(UTC)

    db.commit()
    db.refresh(profile)

    return _profile_to_response(profile)


async def delete_avatar(
    profile_id: str,
    db: Session,
) -> bool:
    """
    Delete avatar image for a profile.

    Args:
        profile_id: Profile ID
        db: Database session

    Returns:
        True if deleted, False if not found or no avatar
    """
    profile = db.query(DBVoiceProfile).filter_by(id=profile_id).first()
    if not profile or not profile.avatar_path:
        return False

    avatar_path = config.resolve_storage_path(profile.avatar_path)
    if avatar_path is not None and avatar_path.exists():
        avatar_path.unlink()

    profile.avatar_path = None
    profile.updated_at = datetime.now(UTC)

    db.commit()

    return True
