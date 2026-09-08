"""
Voice profile / generation / story export/import module.

Handles exporting profiles, generations, and stories to ZIP archives and
importing them back. Archives use the ``.dstf.zip`` family and share the
zip-bomb limits and traversal-safe filename rules below.
"""

from __future__ import annotations

import io
import json
import logging
import uuid
import zipfile
from datetime import UTC, datetime
from pathlib import Path

from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session

from .. import config
from ..database import (
    Generation as DBGeneration,
    GenerationVersion as DBGenerationVersion,
    ProfileSample as DBProfileSample,
    Story as DBStory,
    StoryItem as DBStoryItem,
    VoiceProfile as DBVoiceProfile,
)
from ..models import VoiceProfileCreate, VoiceProfileResponse
from .profiles import add_profile_sample, create_profile

logger = logging.getLogger(__name__)

# Zip bomb / resource limits shared by both ZIP importers.
# Tests may monkeypatch these to exercise the rejection paths cheaply.
MAX_ZIP_MEMBERS = 200
MAX_ZIP_UNCOMPRESSED = 500 * 1024 * 1024  # 500 MB total expanded


# ── ZIP manifest Pydantic models ────────────────────────────────────────


class _ProfileData(BaseModel):
    name: str | None = None
    description: str | None = None
    language: str = "en"


class ProfileImportManifest(BaseModel):
    version: str
    profile: _ProfileData
    has_avatar: bool = False


class _GenerationData(BaseModel):
    text: str
    language: str
    duration: float
    seed: int | None = None
    instruct: str | None = None


class _GenerationProfileData(BaseModel):
    id: str | None = None
    name: str | None = None
    description: str | None = None
    language: str = "en"


class GenerationImportManifest(BaseModel):
    version: str
    generation: _GenerationData
    profile: _GenerationProfileData = _GenerationProfileData()
    versions: list[dict] = []


class _StoryData(BaseModel):
    name: str | None = None
    description: str | None = None


class StoryImportManifest(BaseModel):
    version: str
    story: _StoryData
    items: list[dict] = []
    generations: dict = {}
    versions: dict = {}
    profiles: dict = {}


class ProjectImportManifest(BaseModel):
    version: str
    project: dict
    profiles: dict = {}
    audio_files: list[dict] = []


def _get_unique_profile_name(name: str, db: Session) -> str:
    """
    Get a unique profile name by appending a number if needed.

    Args:
        name: Original profile name
        db: Database session

    Returns:
        Unique profile name
    """
    base_name = name
    counter = 1

    while True:
        existing = db.query(DBVoiceProfile).filter_by(name=name).first()
        if not existing:
            return name

        name = f"{base_name} ({counter})"
        counter += 1


def export_profile_to_zip(profile_id: str, db: Session) -> bytes:
    """
    Export a voice profile to a ZIP archive.

    Args:
        profile_id: Profile ID to export
        db: Database session

    Returns:
        ZIP file contents as bytes

    Raises:
        ValueError: If profile not found or has no samples
    """
    # Get profile
    profile = db.query(DBVoiceProfile).filter_by(id=profile_id).first()
    if not profile:
        raise ValueError(f"Profile {profile_id} not found")

    # Get all samples
    samples = db.query(DBProfileSample).filter_by(profile_id=profile_id).all()
    if not samples:
        raise ValueError(f"Profile {profile_id} has no samples")

    # Create ZIP in memory
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        # Check if profile has avatar
        has_avatar = False
        if profile.avatar_path:
            avatar_path = config.resolve_storage_path(profile.avatar_path)
            if avatar_path is not None and avatar_path.exists():
                has_avatar = True
                # Add avatar to ZIP root with original extension
                avatar_ext = avatar_path.suffix
                zip_file.write(avatar_path, f"avatar{avatar_ext}")

        # Create manifest.json
        manifest = {
            "version": "1.0",
            "profile": {
                "name": profile.name,
                "description": profile.description,
                "language": profile.language,
            },
            "has_avatar": has_avatar,
        }
        zip_file.writestr("manifest.json", json.dumps(manifest, indent=2))

        # Create samples.json mapping
        samples_data = {}

        for sample in samples:
            # Get filename from audio_path (should be {sample_id}.wav)
            audio_path = config.resolve_storage_path(sample.audio_path)
            if audio_path is None:
                raise ValueError(f"Audio file not found: {sample.audio_path}")
            filename = audio_path.name

            # Read audio file
            if not audio_path.exists():
                raise ValueError(f"Audio file not found: {audio_path}")

            # Add to samples directory in ZIP
            zip_path = f"samples/{filename}"
            zip_file.write(audio_path, zip_path)

            # Map filename to reference text
            samples_data[filename] = sample.reference_text

        zip_file.writestr("samples.json", json.dumps(samples_data, indent=2))

    zip_buffer.seek(0)
    return zip_buffer.read()


async def import_profile_from_zip(file_bytes: bytes, db: Session) -> VoiceProfileResponse:
    """
    Import a voice profile from a ZIP archive.

    Args:
        file_bytes: ZIP file contents
        db: Database session

    Returns:
        Created profile

    Raises:
        ValueError: If ZIP is invalid or missing required files
    """
    zip_buffer = io.BytesIO(file_bytes)

    # Zip bomb / resource limits (module constants; see top of file)
    max_members = MAX_ZIP_MEMBERS
    max_uncompressed = MAX_ZIP_UNCOMPRESSED
    max_samples = 100

    try:
        with zipfile.ZipFile(zip_buffer, "r") as zip_file:
            # Validate ZIP structure
            namelist = zip_file.namelist()

            if "manifest.json" not in namelist:
                raise ValueError("ZIP archive missing manifest.json")

            if "samples.json" not in namelist:
                raise ValueError("ZIP archive missing samples.json")

            # Reject oversized archives before reading anything.
            infos = zip_file.infolist()
            if len(infos) > max_members:
                raise ValueError(f"ZIP has too many entries ({len(infos)} > {max_members})")
            total_uncompressed = sum(i.file_size for i in infos)
            if total_uncompressed > max_uncompressed:
                raise ValueError(
                    f"ZIP expands to {total_uncompressed // (1024 * 1024)} MB (limit {max_uncompressed // (1024 * 1024)} MB)"
                )

            # Read and validate manifest
            try:
                manifest = ProfileImportManifest.model_validate_json(zip_file.read("manifest.json"))
            except ValidationError as e:
                raise ValueError(f"Invalid manifest.json: {e}") from e

            profile_data = manifest.profile

            # Read samples mapping
            samples_data = json.loads(zip_file.read("samples.json"))

            if not isinstance(samples_data, dict):
                raise ValueError("Invalid samples.json: must be a dictionary")

            # Get unique profile name
            original_name = profile_data.name or "Imported Profile"
            unique_name = _get_unique_profile_name(original_name, db)

            # Create profile
            profile_create = VoiceProfileCreate(
                name=unique_name,
                description=profile_data.description,
                language=profile_data.language,
            )

            profile = await create_profile(profile_create, db)

            # Extract and add samples
            profile_dir = config.get_profiles_dir() / profile.id
            profile_dir.mkdir(parents=True, exist_ok=True)

            # Handle avatar if present
            avatar_files = [f for f in namelist if f.startswith("avatar.")]
            if avatar_files:
                try:
                    avatar_file = avatar_files[0]
                    # Extract to temporary file
                    import tempfile

                    with tempfile.NamedTemporaryFile(suffix=Path(avatar_file).suffix, delete=False) as tmp:
                        tmp.write(zip_file.read(avatar_file))
                        tmp_path = tmp.name

                    try:
                        from .profiles import upload_avatar

                        await upload_avatar(profile.id, tmp_path, db)
                    finally:
                        Path(tmp_path).unlink(missing_ok=True)
                except Exception:
                    logger.debug("Avatar import failed (non-fatal)", exc_info=True)

            for filename, reference_text in samples_data.items():
                # Validate filename — reject traversal and separators outright
                if len(samples_data) > max_samples:
                    raise ValueError(f"Too many sample entries ({len(samples_data)} > {max_samples})")
                if not filename.endswith(".wav"):
                    raise ValueError(f"Invalid sample filename: {filename} (must be .wav)")
                if (
                    "/" in filename
                    or "\\" in filename
                    or ".." in Path(filename).parts
                    or Path(filename).name != filename
                ):
                    raise ValueError(f"Sample filename must be a plain name: {filename}")

                # Extract audio file to temp location
                zip_path = f"samples/{filename}"

                if zip_path not in namelist:
                    raise ValueError(f"Sample file not found in ZIP: {zip_path}")

                # Extract to temporary file
                import tempfile

                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                    tmp.write(zip_file.read(zip_path))
                    tmp_path = tmp.name

                try:
                    # Add sample to profile
                    await add_profile_sample(
                        profile.id,
                        tmp_path,
                        reference_text,
                        db,
                    )
                finally:
                    # Clean up temp file
                    Path(tmp_path).unlink(missing_ok=True)

            return profile

    except zipfile.BadZipFile as exc:
        raise ValueError("Invalid ZIP file") from exc
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON in archive: {e}") from e
    except Exception as e:
        if isinstance(e, ValueError):
            raise
        raise ValueError(f"Error importing profile: {e!s}") from e


def export_generation_to_zip(generation_id: str, db: Session) -> bytes:
    """
    Export a generation to a ZIP archive.

    Args:
        generation_id: Generation ID to export
        db: Database session

    Returns:
        ZIP file contents as bytes

    Raises:
        ValueError: If generation not found
    """
    # Get generation
    generation = db.query(DBGeneration).filter_by(id=generation_id).first()
    if not generation:
        raise ValueError(f"Generation {generation_id} not found")

    # Get profile info
    profile = db.query(DBVoiceProfile).filter_by(id=generation.profile_id).first()
    if not profile:
        raise ValueError(f"Profile {generation.profile_id} not found")

    # Get all versions for this generation
    versions = (
        db.query(DBGenerationVersion)
        .filter_by(generation_id=generation_id)
        .order_by(DBGenerationVersion.created_at)
        .all()
    )

    # Create ZIP in memory
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        # Build version manifest entries
        version_entries = []
        for v in versions:
            v_path = config.resolve_storage_path(v.audio_path)
            if v_path is None:
                logger.warning("Skipping orphaned version %s (unresolvable path %s)", v.id, v.audio_path)
                continue
            effects_chain = None
            if v.effects_chain:
                effects_chain = json.loads(v.effects_chain)
            version_entries.append(
                {
                    "id": v.id,
                    "label": v.label,
                    "is_default": v.is_default,
                    "effects_chain": effects_chain,
                    "filename": v_path.name,
                }
            )

        manifest = {
            "version": "1.0",
            "generation": {
                "id": generation.id,
                "text": generation.text,
                "language": generation.language,
                "duration": generation.duration,
                "seed": generation.seed,
                "instruct": generation.instruct,
                "created_at": generation.created_at.isoformat(),
            },
            "profile": {
                "id": profile.id,
                "name": profile.name,
                "description": profile.description,
                "language": profile.language,
            },
            "versions": version_entries,
        }
        zip_file.writestr("manifest.json", json.dumps(manifest, indent=2))

        # Add all version audio files
        for v in versions:
            v_path = config.resolve_storage_path(v.audio_path)
            if v_path is not None and v_path.exists():
                zip_file.write(v_path, f"audio/{v_path.name}")

        # Fallback: if no versions exist, include the generation's main audio
        if not versions:
            audio_path = config.resolve_storage_path(generation.audio_path)
            if audio_path is not None and audio_path.exists():
                zip_file.write(audio_path, f"audio/{audio_path.name}")

    zip_buffer.seek(0)
    return zip_buffer.read()


async def import_generation_from_zip(file_bytes: bytes, db: Session) -> dict:
    """
    Import a generation from a ZIP archive.

    Args:
        file_bytes: ZIP file contents
        db: Database session

    Returns:
        Dictionary with generation ID and profile info

    Raises:
        ValueError: If ZIP is invalid or missing required files
    """
    import shutil
    import tempfile
    from datetime import datetime
    from pathlib import Path

    from .. import config

    zip_buffer = io.BytesIO(file_bytes)

    # Zip bomb / resource limits (mirrors import_profile_from_zip)
    max_uncompressed = MAX_ZIP_UNCOMPRESSED
    max_members = MAX_ZIP_MEMBERS

    try:
        with zipfile.ZipFile(zip_buffer, "r") as zip_file:
            # Validate ZIP structure
            namelist = zip_file.namelist()

            if "manifest.json" not in namelist:
                raise ValueError("ZIP archive missing manifest.json")

            # Reject oversized archives before reading anything.
            infos = zip_file.infolist()
            if len(infos) > max_members:
                raise ValueError(f"ZIP has too many entries ({len(infos)} > {max_members})")
            total_uncompressed = sum(i.file_size for i in infos)
            if total_uncompressed > max_uncompressed:
                raise ValueError(
                    f"ZIP expands to {total_uncompressed // (1024 * 1024)} MB (limit {max_uncompressed // (1024 * 1024)} MB)"
                )

            # Read and validate manifest
            try:
                manifest = GenerationImportManifest.model_validate_json(zip_file.read("manifest.json"))
            except ValidationError as e:
                raise ValueError(f"Invalid manifest.json: {e}") from e

            generation_data = manifest.generation
            profile_data = manifest.profile

            # Find audio file in archive
            audio_files = [f for f in namelist if f.startswith("audio/") and f.endswith(".wav")]
            if not audio_files:
                raise ValueError("No audio file found in ZIP archive")

            audio_file_path = audio_files[0]

            # Check if we should match an existing profile or create metadata
            profile_id = None
            profile_name = profile_data.name or "Unknown Profile"

            # Try to find matching profile by name
            if profile_name and profile_name != "Unknown Profile":
                existing_profile = db.query(DBVoiceProfile).filter_by(name=profile_name).first()
                if existing_profile:
                    profile_id = existing_profile.id

            # If no matching profile, use a placeholder or the first available profile
            if not profile_id:
                # Get any profile, or None if no profiles exist
                any_profile = db.query(DBVoiceProfile).first()
                if any_profile:
                    profile_id = any_profile.id
                    profile_name = any_profile.name
                else:
                    raise ValueError("No voice profiles found. Please create a profile before importing generations.")

            # Extract audio file to temporary location
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp.write(zip_file.read(audio_file_path))
                tmp_path = tmp.name

            try:
                # Create generations directory
                generations_dir = config.get_generations_dir()
                generations_dir.mkdir(parents=True, exist_ok=True)

                # Generate new ID for this generation
                new_generation_id = str(__import__("uuid").uuid4())

                # Copy audio to generations directory
                audio_dest = generations_dir / f"{new_generation_id}.wav"
                shutil.copy(tmp_path, audio_dest)

                # Create generation record
                db_generation = DBGeneration(
                    id=new_generation_id,
                    profile_id=profile_id,
                    text=generation_data.text,
                    language=generation_data.language,
                    audio_path=config.to_storage_path(audio_dest),
                    duration=generation_data.duration,
                    seed=generation_data.seed,
                    instruct=generation_data.instruct,
                    created_at=datetime.now(UTC),
                )

                db.add(db_generation)
                db.commit()
                db.refresh(db_generation)

                return {
                    "id": db_generation.id,
                    "profile_id": profile_id,
                    "profile_name": profile_name,
                    "text": db_generation.text,
                    "message": f"Generation imported successfully (assigned to profile: {profile_name})",
                }

            finally:
                # Clean up temp file
                Path(tmp_path).unlink(missing_ok=True)

    except zipfile.BadZipFile as exc:
        raise ValueError("Invalid ZIP file") from exc
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON in archive: {e}") from e
    except Exception as e:
        if isinstance(e, ValueError):
            raise
        raise ValueError(f"Error importing generation: {e!s}") from e


# ── Story export / import ─────────────────────────────────────────────
#
# Scope decision (deliberate, not accidental): story archives are
# SELF-CONTAINED. Referenced voice profiles are embedded inline (record +
# samples + avatar) so a story renders on a machine that has never seen
# that voice — a name reference alone would strand the project. Cost: bigger
# archives when voices are large; accepted, audio dominates anyway.
#
# Import regenerates every ID (new uuids) so archives never collide with
# the target machine. Profiles match by name first (reuse) and only then
# import the embedded copy, so re-importing the same story doesn't clone
# voices each time.


def _assert_safe_archive_audio(path: str) -> str:
    """Validate an audio member path inside a story archive.

    Returns the path unchanged. Only ``audio/`` and ``profiles/`` prefixes
    with plain ``.wav`` basenames are allowed — rejects traversal,
    absolute paths, and separators outright.
    """
    if not path.startswith(("audio/", "profiles/")):
        raise ValueError(f"Archive path outside audio/profiles: {path}")
    name = path.rsplit("/", 1)[-1]
    if not name.endswith(".wav") or Path(name).name != name or ".." in Path(path).parts:
        raise ValueError(f"Invalid archive audio path: {path}")
    return path


def _check_story_zip_bounds(zip_file: zipfile.ZipFile) -> list[str]:
    """Shared zip-bomb limits for story archives. Returns the namelist."""
    namelist = zip_file.namelist()
    if "manifest.json" not in namelist:
        raise ValueError("ZIP archive missing manifest.json")
    infos = zip_file.infolist()
    if len(infos) > MAX_ZIP_MEMBERS:
        raise ValueError(f"ZIP has too many entries ({len(infos)} > {MAX_ZIP_MEMBERS})")
    total_uncompressed = sum(i.file_size for i in infos)
    if total_uncompressed > MAX_ZIP_UNCOMPRESSED:
        raise ValueError(
            f"ZIP expands to {total_uncompressed // (1024 * 1024)} MB "
            f"(limit {MAX_ZIP_UNCOMPRESSED // (1024 * 1024)} MB)"
        )
    return namelist


def export_story_to_zip(story_id: str, db: Session) -> bytes:
    """Export a story (items + generations + versions + voices) to a ZIP.

    Voice profiles referenced by the story's generations are embedded
    inline so the archive is fully self-contained. Audio files that are
    missing on disk are skipped with a warning; the export fails only
    when the story would contain zero audio files at all.
    """
    import uuid as _uuid

    story = db.query(DBStory).filter_by(id=story_id).first()
    if not story:
        raise ValueError(f"Story {story_id} not found")

    items = (
        db.query(DBStoryItem).filter_by(story_id=story_id).order_by(DBStoryItem.track, DBStoryItem.start_time_ms).all()
    )

    generation_ids = sorted({i.generation_id for i in items})
    generations = (
        {g.id: g for g in db.query(DBGeneration).filter(DBGeneration.id.in_(generation_ids)).all()}
        if generation_ids
        else {}
    )
    missing_gens = [gid for gid in generation_ids if gid not in generations]
    if missing_gens:
        raise ValueError(f"Story references missing generations: {', '.join(missing_gens[:3])}")

    # Batch-fetch all versions for all generations (avoid N+1)
    all_gen_ids = list(generations.keys())
    all_versions = (
        db.query(DBGenerationVersion)
        .filter(DBGenerationVersion.generation_id.in_(all_gen_ids))
        .order_by(DBGenerationVersion.created_at)
        .all()
        if all_gen_ids
        else []
    )
    versions_by_gen: dict[str, list] = {gid: [] for gid in all_gen_ids}
    for v in all_versions:
        versions_by_gen[v.generation_id].append(v)

    profile_ids = sorted({g.profile_id for g in generations.values() if g.profile_id})
    profiles = (
        {p.id: p for p in db.query(DBVoiceProfile).filter(DBVoiceProfile.id.in_(profile_ids)).all()}
        if profile_ids
        else {}
    )
    missing_profiles = [pid for pid in profile_ids if pid not in profiles]
    if missing_profiles:
        raise ValueError(f"Story references missing voice profiles: {', '.join(missing_profiles[:3])}")

    zip_buffer = io.BytesIO()
    audio_included = 0

    def _add_audio(db_path: str | None, arc_name: str) -> str | None:
        """Resolve + write one audio file. Returns arc name or None if skipped."""
        nonlocal audio_included
        if not db_path:
            return None
        resolved = config.resolve_storage_path(db_path)
        if resolved is None or not resolved.exists():
            logger.warning("Skipping missing audio file in story export: %s", db_path)
            return None
        zip_file.write(resolved, arc_name)
        audio_included += 1
        return arc_name

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        manifest_versions: dict[str, dict] = {}
        for gen_id, gen in generations.items():
            for v in versions_by_gen.get(gen_id, []):
                arc = f"audio/{gen_id}-{v.id}.wav"
                stored = _add_audio(v.audio_path, arc)
                effects_chain = None
                if v.effects_chain:
                    try:
                        effects_chain = json.loads(v.effects_chain)
                    except (json.JSONDecodeError, TypeError):
                        effects_chain = None
                manifest_versions[v.id] = {
                    "generation": gen_id,
                    "label": v.label,
                    "is_default": bool(v.is_default),
                    "effects_chain": effects_chain,
                    "audio": stored,
                }
            main_arc = f"audio/{gen_id}.wav"
            main_stored = _add_audio(gen.audio_path, main_arc)
            if main_stored is None and not manifest_versions:
                logger.warning("Generation %s has no audio on disk", gen_id)

        # Batch-fetch all profile samples (avoid N+1)
        all_prof_ids = list(profiles.keys())
        all_samples = (
            db.query(DBProfileSample)
            .filter(DBProfileSample.profile_id.in_(all_prof_ids))
            .all()
            if all_prof_ids
            else []
        )
        samples_by_profile: dict[str, list] = {pid: [] for pid in all_prof_ids}
        for s in all_samples:
            samples_by_profile[s.profile_id].append(s)

        manifest_profiles: dict[str, dict] = {}
        for prof_id, prof in profiles.items():
            samples = samples_by_profile[prof_id]
            sample_entries = []
            avatar_arc = None
            if prof.avatar_path:
                avatar_path = config.resolve_storage_path(prof.avatar_path)
                if avatar_path is not None and avatar_path.exists():
                    avatar_arc = f"profiles/{prof_id}/avatar{avatar_path.suffix}"
                    zip_file.write(avatar_path, avatar_arc)
            for sample in samples:
                sample_path = config.resolve_storage_path(sample.audio_path)
                if sample_path is None or not sample_path.exists():
                    logger.warning("Skipping missing sample in story export: %s", sample.audio_path)
                    continue
                sample_arc = f"profiles/{prof_id}/samples/{sample_path.name}"
                zip_file.write(sample_path, sample_arc)
                sample_entries.append({"file": sample_arc, "reference_text": sample.reference_text})
                audio_included += 1
            voice_attributes = None
            if prof.voice_attributes:
                try:
                    voice_attributes = json.loads(prof.voice_attributes)
                except (json.JSONDecodeError, TypeError):
                    voice_attributes = None
            manifest_profiles[prof_id] = {
                "name": prof.name,
                "description": prof.description,
                "language": prof.language,
                "voice_type": prof.voice_type or "cloned",
                "preset_engine": prof.preset_engine,
                "preset_voice_id": prof.preset_voice_id,
                "design_prompt": prof.design_prompt,
                "voice_attributes": voice_attributes,
                "default_engine": prof.default_engine,
                "personality": prof.personality,
                "effects_chain": prof.effects_chain,
                "avatar": avatar_arc,
                "samples": sample_entries,
            }

        manifest_generations: dict[str, dict] = {}
        for gen_id, gen in generations.items():
            manifest_generations[gen_id] = {
                "profile": gen.profile_id,
                "text": gen.text,
                "language": gen.language,
                "engine": gen.engine,
                "model_size": gen.model_size,
                "seed": gen.seed,
                "temperature": gen.temperature,
                "instruct": gen.instruct,
                "duration": gen.duration,
                "source": gen.source,
                "use_cloud": bool(gen.use_cloud),
                "voice_clean": bool(gen.voice_clean),
                "audio": f"audio/{gen_id}.wav",
                "versions": [v.id for v in versions_by_gen.get(gen_id, [])],
            }

        manifest_items = [
            {
                "generation": i.generation_id,
                "version": i.version_id,
                "track": i.track,
                "start_time_ms": i.start_time_ms,
                "trim_start_ms": i.trim_start_ms,
                "trim_end_ms": i.trim_end_ms,
                "volume": i.volume,
                "fade_in_ms": i.fade_in_ms,
                "fade_out_ms": i.fade_out_ms,
                "gain_db": i.gain_db,
                "pan": i.pan,
            }
            for i in items
        ]

        manifest = {
            "version": "1.0",
            "export_id": f"story-{_uuid.uuid4().hex[:8]}",
            "story": {"name": story.name, "description": story.description},
            "items": manifest_items,
            "generations": manifest_generations,
            "versions": manifest_versions,
            "profiles": manifest_profiles,
        }
        zip_file.writestr("manifest.json", json.dumps(manifest, indent=2))

    if audio_included == 0:
        raise ValueError(f"Story {story_id} has no audio files on disk to export")

    zip_buffer.seek(0)
    return zip_buffer.read()


async def import_story_from_zip(file_bytes: bytes, db: Session) -> dict:
    """Import a story archive: new IDs everywhere, voices matched by name.

    Returns ``{"id", "name", "items", "generations", "profiles_reused",
    "profiles_imported"}``. Raises ValueError on any invalid archive.
    """
    import shutil
    import tempfile
    import uuid as _uuid
    from datetime import datetime

    from ..models import VoiceProfileCreate

    zip_buffer = io.BytesIO(file_bytes)

    try:
        with zipfile.ZipFile(zip_buffer, "r") as zip_file:
            namelist = _check_story_zip_bounds(zip_file)

            try:
                manifest = StoryImportManifest.model_validate_json(zip_file.read("manifest.json"))
            except ValidationError as e:
                raise ValueError(f"Invalid manifest.json: {e}") from e

            if manifest.version not in ("1.0", 1):
                raise ValueError("Unsupported story archive version")

            story_data = manifest.story
            items_data = manifest.items
            generations_data = manifest.generations
            versions_data = manifest.versions
            profiles_data = manifest.profiles
            if not isinstance(items_data, list) or not items_data:
                raise ValueError("Story archive has no items")

            # Every referenced audio member must exist and be traversal-safe.
            referenced_audio: set[str] = set()
            for gen in generations_data.values():
                if gen.get("audio"):
                    referenced_audio.add(gen["audio"])
            for ver in versions_data.values():
                if ver.get("audio"):
                    referenced_audio.add(ver["audio"])
            for prof in profiles_data.values():
                if prof.get("avatar"):
                    referenced_audio.add(prof["avatar"])
                for sample in prof.get("samples", []):
                    referenced_audio.add(sample["file"])
            archive_set = set(namelist)
            for arc in referenced_audio:
                _assert_safe_archive_audio(arc)
                if arc not in archive_set:
                    raise ValueError(f"Archive manifest references missing file: {arc}")

            # ── Profiles: reuse by name, else import embedded copy ──
            profile_id_map: dict[str, str] = {}
            profiles_reused = 0
            profiles_imported = 0
            for prof_key, prof in profiles_data.items():
                existing = db.query(DBVoiceProfile).filter_by(name=prof.get("name", "")).first()
                if existing:
                    profile_id_map[prof_key] = existing.id
                    profiles_reused += 1
                    continue
                unique_name = _get_unique_profile_name(prof.get("name") or "Imported Voice", db)
                voice_attributes = prof.get("voice_attributes")
                if isinstance(voice_attributes, str):
                    try:
                        voice_attributes = json.loads(voice_attributes)
                    except (json.JSONDecodeError, TypeError):
                        voice_attributes = None
                new_profile = await create_profile(
                    VoiceProfileCreate(
                        name=unique_name,
                        description=prof.get("description"),
                        language=prof.get("language") or "en",
                        voice_type=prof.get("voice_type") or "cloned",
                        preset_engine=prof.get("preset_engine"),
                        preset_voice_id=prof.get("preset_voice_id"),
                        design_prompt=prof.get("design_prompt"),
                        voice_attributes=voice_attributes,
                        default_engine=prof.get("default_engine"),
                        personality=prof.get("personality"),
                    ),
                    db,
                )
                if prof.get("effects_chain"):
                    db.query(DBVoiceProfile).filter_by(id=new_profile.id).update(
                        {"effects_chain": prof["effects_chain"]}
                    )
                    db.commit()
                # Samples (cloned voices). Preset/designed voices have none.
                for sample in prof.get("samples", []):
                    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                        tmp.write(zip_file.read(sample["file"]))
                        tmp_path = tmp.name
                    try:
                        await add_profile_sample(new_profile.id, tmp_path, sample.get("reference_text", ""), db)
                    finally:
                        Path(tmp_path).unlink(missing_ok=True)
                # Avatar (non-fatal, mirrors import_profile_from_zip).
                if prof.get("avatar"):
                    try:
                        with tempfile.NamedTemporaryFile(suffix=Path(prof["avatar"]).suffix, delete=False) as tmp:
                            tmp.write(zip_file.read(prof["avatar"]))
                            tmp_path = tmp.name
                        try:
                            from .profiles import upload_avatar

                            await upload_avatar(new_profile.id, tmp_path, db)
                        finally:
                            Path(tmp_path).unlink(missing_ok=True)
                    except Exception:
                        logger.debug("Story avatar import failed (non-fatal)", exc_info=True)
                profile_id_map[prof_key] = new_profile.id
                profiles_imported += 1

            # ── Generations + versions (new IDs, audio restored) ──
            generations_dir = config.get_generations_dir()
            generations_dir.mkdir(parents=True, exist_ok=True)
            generation_id_map: dict[str, str] = {}
            version_id_map: dict[str, str] = {}
            for gen_key, gen in generations_data.items():
                if gen.get("profile") not in profile_id_map:
                    raise ValueError(f"Generation references unknown profile: {gen.get('profile')}")
                new_gen_id = str(_uuid.uuid4())
                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                    tmp.write(zip_file.read(gen["audio"]))
                    tmp_path = tmp.name
                try:
                    audio_dest = generations_dir / f"{new_gen_id}.wav"
                    shutil.copy(tmp_path, audio_dest)
                finally:
                    Path(tmp_path).unlink(missing_ok=True)
                db.add(
                    DBGeneration(
                        id=new_gen_id,
                        profile_id=profile_id_map[gen["profile"]],
                        text=gen.get("text", ""),
                        language=gen.get("language") or "en",
                        audio_path=config.to_storage_path(audio_dest),
                        duration=gen.get("duration"),
                        seed=gen.get("seed"),
                        instruct=gen.get("instruct"),
                        engine=gen.get("engine") or "",
                        model_size=gen.get("model_size"),
                        temperature=gen.get("temperature"),
                        source=gen.get("source") or "manual",
                        use_cloud=bool(gen.get("use_cloud")),
                        voice_clean=bool(gen.get("voice_clean")),
                        created_at=datetime.now(UTC),
                    )
                )
                generation_id_map[gen_key] = new_gen_id
                for ver_key in gen.get("versions", []):
                    ver = versions_data.get(ver_key)
                    if ver is None:
                        raise ValueError(f"Generation references unknown version: {ver_key}")
                    new_ver_id = str(_uuid.uuid4())
                    effects_chain = ver.get("effects_chain")
                    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                        if ver.get("audio"):
                            tmp.write(zip_file.read(ver["audio"]))
                        tmp_path = tmp.name
                    try:
                        ver_dest = generations_dir / f"{new_ver_id}.wav"
                        shutil.copy(tmp_path, ver_dest)
                    finally:
                        Path(tmp_path).unlink(missing_ok=True)
                    db.add(
                        DBGenerationVersion(
                            id=new_ver_id,
                            generation_id=new_gen_id,
                            label=ver.get("label") or "take",
                            audio_path=config.to_storage_path(ver_dest),
                            effects_chain=json.dumps(effects_chain) if effects_chain is not None else None,
                            is_default=bool(ver.get("is_default")),
                        )
                    )
                    version_id_map[ver_key] = new_ver_id
            db.commit()

            # ── Story + items (remapped IDs) ──
            new_story_id = str(_uuid.uuid4())
            db.add(
                DBStory(
                    id=new_story_id,
                    name=story_data.name or "Imported Story",
                    description=story_data.description,
                    created_at=datetime.now(UTC),
                    updated_at=datetime.now(UTC),
                )
            )
            item_count = 0
            for item in items_data:
                if item.get("generation") not in generation_id_map:
                    raise ValueError(f"Item references unknown generation: {item.get('generation')}")
                version_ref = item.get("version")
                if version_ref is not None and version_ref not in version_id_map:
                    raise ValueError(f"Item references unknown version: {version_ref}")
                db.add(
                    DBStoryItem(
                        id=str(_uuid.uuid4()),
                        story_id=new_story_id,
                        generation_id=generation_id_map[item["generation"]],
                        version_id=version_id_map.get(version_ref) if version_ref else None,
                        start_time_ms=int(item.get("start_time_ms") or 0),
                        track=int(item.get("track") or 0),
                        trim_start_ms=int(item.get("trim_start_ms") or 0),
                        trim_end_ms=int(item.get("trim_end_ms") or 0),
                        volume=float(item.get("volume", 1.0)),
                        fade_in_ms=int(item.get("fade_in_ms") or 0),
                        fade_out_ms=int(item.get("fade_out_ms") or 0),
                        gain_db=float(item.get("gain_db") or 0.0),
                        pan=float(item.get("pan") or 0.0),
                    )
                )
                item_count += 1
            db.commit()

            return {
                "id": new_story_id,
                "name": story_data.name or "Imported Story",
                "items": item_count,
                "generations": len(generation_id_map),
                "profiles_reused": profiles_reused,
                "profiles_imported": profiles_imported,
                "message": f"Story imported successfully ({item_count} items, {len(generation_id_map)} clips)",
            }

    except zipfile.BadZipFile as exc:
        raise ValueError("Invalid ZIP file") from exc
    except Exception as e:
        if isinstance(e, ValueError):
            raise
        raise ValueError(f"Error importing story: {e!s}") from e


# ── Standalone project export / import ──────────────────────────────
#
# Scope decision (deliberate): project archives are SELF-CONTAINED.
# Voice profiles referenced by characters are embedded inline (record +
# samples + avatar) so a project renders on a machine that has never
# seen that voice. Import regenerates every ID (new uuids) so archives
# never collide with the target machine. Profiles match by name first
# (reuse) and only then import the embedded copy.


def export_standalone_project_to_zip(project_id: str, db: Session) -> bytes:
    """Export a standalone project to a self-contained ZIP archive.

    The archive includes the project JSON manifest, all referenced voice
    profiles (with samples and avatars), and any audio files stored in
    the project's audio_files list.

    Raises ValueError if the project is not found or has no scenes.
    """
    from ..database.models import StandaloneProjectRow

    doc = db.query(StandaloneProjectRow).filter_by(id=project_id).first()
    if not doc:
        raise ValueError(f"Project {project_id} not found")

    project_data = json.loads(doc.project_json)
    characters = project_data.get("characters", [])
    scenes = project_data.get("scenes", [])
    if not scenes:
        raise ValueError("Project has no scenes to export")

    # Collect voice profile IDs referenced by characters
    profile_ids = sorted({c["voice_profile_id"] for c in characters if c.get("voice_profile_id")})
    profiles = {}
    if profile_ids:
        profiles = {p.id: p for p in db.query(DBVoiceProfile).filter(DBVoiceProfile.id.in_(profile_ids)).all()}

    zip_buffer = io.BytesIO()
    audio_included = 0

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        # ── Profiles (self-contained, same pattern as story export) ──
        manifest_profiles: dict[str, dict] = {}
        for prof_id, prof in profiles.items():
            samples = db.query(DBProfileSample).filter_by(profile_id=prof_id).all()
            sample_entries: list[dict] = []
            avatar_arc = None
            if prof.avatar_path:
                avatar_path = config.resolve_storage_path(prof.avatar_path)
                if avatar_path is not None and avatar_path.exists():
                    avatar_arc = f"profiles/{prof_id}/avatar{avatar_path.suffix}"
                    zip_file.write(avatar_path, avatar_arc)
            for sample in samples:
                sample_path = config.resolve_storage_path(sample.audio_path)
                if sample_path is None or not sample_path.exists():
                    logger.warning("Skipping missing sample in project export: %s", sample.audio_path)
                    continue
                sample_arc = f"profiles/{prof_id}/samples/{sample_path.name}"
                zip_file.write(sample_path, sample_arc)
                sample_entries.append({"file": sample_arc, "reference_text": sample.reference_text})
                audio_included += 1
            voice_attributes = None
            if prof.voice_attributes:
                try:
                    voice_attributes = json.loads(prof.voice_attributes)
                except (json.JSONDecodeError, TypeError):
                    voice_attributes = None
            manifest_profiles[prof_id] = {
                "name": prof.name,
                "description": prof.description,
                "language": prof.language,
                "voice_type": prof.voice_type or "cloned",
                "preset_engine": prof.preset_engine,
                "preset_voice_id": prof.preset_voice_id,
                "design_prompt": prof.design_prompt,
                "voice_attributes": voice_attributes,
                "default_engine": prof.default_engine,
                "personality": prof.personality,
                "effects_chain": prof.effects_chain,
                "avatar": avatar_arc,
                "samples": sample_entries,
            }

        # ── Audio files referenced in the project ──
        manifest_audio: list[dict] = []
        for af in project_data.get("audio_files", []):
            if isinstance(af, dict) and af.get("path"):
                resolved = config.resolve_storage_path(af["path"])
                if resolved is not None and resolved.exists():
                    arc_name = f"audio/{resolved.name}"
                    zip_file.write(resolved, arc_name)
                    manifest_audio.append({"path": af["path"], "arc": arc_name})
                    audio_included += 1

        # ── Project manifest ──
        manifest = {
            "version": "1.0",
            "export_id": f"project-{uuid.uuid4().hex[:8]}",
            "project": project_data,
            "profiles": manifest_profiles,
            "audio_files": manifest_audio,
        }
        zip_file.writestr("manifest.json", json.dumps(manifest, indent=2))

    zip_buffer.seek(0)
    return zip_buffer.read()


async def import_standalone_project_from_zip(file_bytes: bytes, db: Session) -> dict:
    """Import a standalone project archive: new IDs everywhere, voices matched by name.

    Returns ``{"id", "name", "scenes", "characters", "profiles_reused",
    "profiles_imported"}``. Raises ValueError on any invalid archive.
    """
    import shutil
    import tempfile

    from ..database.models import StandaloneProjectRow
    from ..services.standalone_project import project_from_json, project_to_dict

    zip_buffer = io.BytesIO(file_bytes)

    try:
        with zipfile.ZipFile(zip_buffer, "r") as zip_file:
            namelist = _check_story_zip_bounds(zip_file)

            try:
                manifest = ProjectImportManifest.model_validate_json(zip_file.read("manifest.json"))
            except ValidationError as e:
                raise ValueError(f"Invalid manifest.json: {e}") from e

            if manifest.version not in ("1.0", 1):
                raise ValueError("Unsupported project archive version")

            project_data = manifest.project
            profiles_data = manifest.profiles
            audio_files_data = manifest.audio_files

            # ── Profiles: reuse by name, else import embedded copy ──
            profile_id_map: dict[str, str] = {}
            profiles_reused = 0
            profiles_imported = 0
            for prof_key, prof in profiles_data.items():
                existing = db.query(DBVoiceProfile).filter_by(name=prof.get("name", "")).first()
                if existing:
                    profile_id_map[prof_key] = existing.id
                    profiles_reused += 1
                    continue
                unique_name = _get_unique_profile_name(prof.get("name") or "Imported Voice", db)
                voice_attributes = prof.get("voice_attributes")
                if isinstance(voice_attributes, str):
                    try:
                        voice_attributes = json.loads(voice_attributes)
                    except (json.JSONDecodeError, TypeError):
                        voice_attributes = None
                new_profile = await create_profile(
                    VoiceProfileCreate(
                        name=unique_name,
                        description=prof.get("description"),
                        language=prof.get("language") or "en",
                        voice_type=prof.get("voice_type") or "cloned",
                        preset_engine=prof.get("preset_engine"),
                        preset_voice_id=prof.get("preset_voice_id"),
                        design_prompt=prof.get("design_prompt"),
                        voice_attributes=voice_attributes,
                        default_engine=prof.get("default_engine"),
                        personality=prof.get("personality"),
                    ),
                    db,
                )
                if prof.get("effects_chain"):
                    db.query(DBVoiceProfile).filter_by(id=new_profile.id).update(
                        {"effects_chain": prof["effects_chain"]}
                    )
                    db.commit()
                for sample in prof.get("samples", []):
                    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                        tmp.write(zip_file.read(sample["file"]))
                        tmp_path = tmp.name
                    try:
                        await add_profile_sample(new_profile.id, tmp_path, sample.get("reference_text", ""), db)
                    finally:
                        Path(tmp_path).unlink(missing_ok=True)
                if prof.get("avatar"):
                    try:
                        with tempfile.NamedTemporaryFile(suffix=Path(prof["avatar"]).suffix, delete=False) as tmp:
                            tmp.write(zip_file.read(prof["avatar"]))
                            tmp_path = tmp.name
                        try:
                            from .profiles import upload_avatar

                            await upload_avatar(new_profile.id, tmp_path, db)
                        finally:
                            Path(tmp_path).unlink(missing_ok=True)
                    except Exception:
                        logger.debug("Project avatar import failed (non-fatal)", exc_info=True)
                profile_id_map[prof_key] = new_profile.id
                profiles_imported += 1

            # ── Remap voice_profile_id in characters ──
            for char in project_data.get("characters", []):
                old_id = char.get("voice_profile_id")
                if old_id and old_id in profile_id_map:
                    char["voice_profile_id"] = profile_id_map[old_id]

            # ── Restore audio files ──
            generations_dir = config.get_generations_dir()
            generations_dir.mkdir(parents=True, exist_ok=True)
            restored_audio: list[dict] = []
            for af in audio_files_data:
                arc_name = af.get("arc")
                if arc_name and arc_name in namelist:
                    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                        tmp.write(zip_file.read(arc_name))
                        tmp_path = tmp.name
                    new_id = str(uuid.uuid4())
                    dest = generations_dir / f"{new_id}.wav"
                    try:
                        shutil.copy(tmp_path, dest)
                        restored_audio.append({"path": config.to_storage_path(dest)})
                    finally:
                        Path(tmp_path).unlink(missing_ok=True)

            # ── Create project with new ID ──
            project_data["id"] = str(uuid.uuid4())
            project_data["created_at"] = datetime.now(UTC).isoformat()
            project_data["updated_at"] = datetime.now(UTC).isoformat()
            project_data["audio_files"] = restored_audio

            project = project_from_json(json.dumps(project_data))
            doc = StandaloneProjectRow(
                id=project.id,
                name=project.name,
                project_json=json.dumps(project_to_dict(project)),
            )
            db.add(doc)
            db.commit()

            return {
                "id": project.id,
                "name": project.name,
                "scenes": len(project.scenes),
                "characters": len(project.characters),
                "profiles_reused": profiles_reused,
                "profiles_imported": profiles_imported,
                "message": f"Project imported successfully ({len(project.scenes)} scenes, {len(project.characters)} characters)",
            }

    except zipfile.BadZipFile as exc:
        raise ValueError("Invalid ZIP file") from exc
    except Exception as e:
        if isinstance(e, ValueError):
            raise
        raise ValueError(f"Error importing project: {e!s}") from e
