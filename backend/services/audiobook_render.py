"""Chapter rendering: reuses the canonical Generate pipeline per chapter.

Each chapter delegates to `services.generation.run_generation` via a
`GenerationContext`, so it inherits: chunking/crossfade from
GenerationSettings, rate-limit, model-lifecycle, trim, normalize,
voice_clean, emotion, telemetry, SSE progress, and history.
WAV is default; conversion to mp3/m4b happens later via ffmpeg.
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy.orm import Session

from .. import config
from ..database import Audiobook as DBAudiobook, AudiobookChapter as DBChapter
from ..utils.hidden_subprocess import run_hidden

logger = logging.getLogger(__name__)


def _get_generation_settings(db: Session) -> tuple[int, int, bool]:
    """Return (max_chunk_chars, crossfade_ms, normalize) from GenerationSettings."""
    try:
        from ..database import GenerationSettings as DBGenSettings

        row = db.query(DBGenSettings).first()
        if row:
            return int(row.max_chunk_chars or 800), int(row.crossfade_ms or 50), bool(row.normalize_audio)
    except Exception:
        logger.debug("Generation settings load failed", exc_info=True)
    return 800, 50, True


def _resolve_profile_for_chapter(
    db: Session, audiobook_id: str, chapter_text: str, default_profile_id: str | None
) -> str | None:
    if default_profile_id:
        return default_profile_id
    # If cast table has entries, try to pick NARRATOR or first cast member
    from ..database import AudiobookVoiceCast as DBCast

    cast = db.query(DBCast).filter_by(audiobook_id=audiobook_id).first()
    if cast and cast.profile_id:
        return cast.profile_id
    from ..database import VoiceProfile as DBProfile

    row = db.query(DBProfile).first()
    return row.id if row else None


async def _render_text_via_generation(
    db: Session,
    text: str,
    profile_id: str,
    engine: str | None,
) -> tuple[str, str, int]:
    """Render `text` via canonical Generation pipeline. Returns (gen_id, audio_path, duration_ms)."""
    from ..database import VoiceProfile as DBProfile
    from ..services import history, profiles
    from ..services.generation import GenerationContext, run_generation
    from ..services.model_registry import is_downloaded
    from ..services.task_queue import get_task_manager

    profile = db.query(DBProfile).filter_by(id=profile_id).first()
    if not profile:
        raise ValueError(f"Profile {profile_id} not found")

    # Resolve engine — never force a default download. Caller must have validated cache.
    eng = engine or getattr(profile, "default_engine", None) or getattr(profile, "preset_engine", None)
    if not eng:
        # No engine implied: require explicit engine from render request
        raise ValueError("No engine selected — pick a cached engine from Models tab")
    try:
        profiles.validate_profile_engine(profile, eng)  # type: ignore
    except ValueError as e:
        raise ValueError(str(e)) from e

    # Enforce cached — never trigger download from render path
    from ..backends import get_all_model_configs

    cfgs = [c for c in get_all_model_configs() if c.engine == eng]
    if cfgs and not any(is_downloaded(c.model_name, c.model_size) for c in cfgs):
        raise ValueError(f"Engine '{eng}' is not downloaded — install it from Models tab")

    model_size = "default"
    max_chunk_chars, crossfade_ms, normalize = _get_generation_settings(db)

    gen_id = str(uuid.uuid4())
    await history.create_generation(
        profile_id=profile_id,
        text=text[:2000],
        language=getattr(profile, "language", None) or "en",
        audio_path="",
        duration=0,
        seed=None,
        db=db,
        generation_id=gen_id,
        status="generating",
        engine=eng,
        model_size=model_size,
        source="audiobook",
    )
    get_task_manager().start_generation(task_id=gen_id, profile_id=profile_id, text=text[:120])
    import json as _json

    effects_chain = None
    if getattr(profile, "effects_chain", None):
        try:
            effects_chain = _json.loads(profile.effects_chain)  # type: ignore
        except Exception:
            logger.debug("suppressed exception in audiobook_render.py:113", exc_info=True)
            effects_chain = None
    ctx = GenerationContext(
        generation_id=gen_id,
        profile_id=profile_id,
        text=text,
        language=getattr(profile, "language", None) or "en",
        engine=eng,
        model_size=model_size,
        seed=None,
        mode="generate",
        normalize=normalize,
        effects_chain=effects_chain,
        max_chunk_chars=max_chunk_chars,
        crossfade_ms=crossfade_ms,
    )
    await run_generation(ctx)
    from ..database import Generation as DBGeneration

    gen = db.query(DBGeneration).filter_by(id=gen_id).first()
    if not gen or gen.status == "failed":
        raise RuntimeError(gen.error if gen and gen.error else "Generation failed")
    return gen_id, gen.audio_path or "", int((gen.duration or 0) * 1000)


async def render_chapter(
    db: Session,
    chapter: DBChapter,
    profile_id: str,
    engine: str | None = None,
) -> DBChapter:
    text = (chapter.text or "").strip()
    if not text:
        chapter.status = "failed"
        chapter.error = "Empty chapter text"
        db.commit()
        return chapter
    chapter.status = "rendering"
    db.commit()
    try:
        from ..database import AudiobookUtterance as DBUtt

        utterances = db.query(DBUtt).filter_by(chapter_id=chapter.id).order_by(DBUtt.order_index).all()
        if utterances:
            # Multi-voice: render each utterance with its character's cast
            from ..database import AudiobookVoiceCast as DBCast

            wav_paths: list[str] = []
            total_ms = 0
            for utt in utterances:
                utt.status = "rendering"
                db.commit()
                # Resolve per-utterance voice from cast table, fallback to utterance's own or chapter default
                cast = db.query(DBCast).filter_by(audiobook_id=chapter.audiobook_id, character=utt.character).first()
                utt_profile = utt.profile_id or (cast.profile_id if cast else None) or profile_id
                utt_engine = utt.engine or (cast.engine if cast else None) or engine
                if not utt_profile:
                    raise ValueError(f"No voice assigned for character '{utt.character}'")
                gen_id, audio_path, dur_ms = await _render_text_via_generation(db, utt.text, utt_profile, utt_engine)
                utt.generation_id = gen_id
                utt.audio_path = audio_path
                utt.duration_ms = dur_ms
                utt.status = "done"
                utt.error = None
                db.commit()
                if audio_path:
                    p = config.resolve_storage_path(audio_path)
                    if p and p.exists():
                        wav_paths.append(str(p))
                    total_ms += dur_ms
            # Concatenate utterance wavs into chapter wav
            if wav_paths:
                import numpy as np
                import soundfile as sf

                # Simple concat with ffmpeg if available else via soundfile
                try:
                    import tempfile
                    from pathlib import Path

                    from ..services.audio_conversion import ffmpeg_path

                    ffmpeg = ffmpeg_path()
                    if ffmpeg and len(wav_paths) > 1:
                        with tempfile.TemporaryDirectory() as td:
                            lst = Path(td) / "list.txt"
                            lst.write_text("\n".join(f"file '{Path(p).resolve()}'" for p in wav_paths))
                            out = Path(td) / "chapter.wav"
                            run_hidden(
                                [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(out)],
                                capture_output=True,
                                check=False,
                            )
                            if not out.exists():
                                run_hidden(
                                    [ffmpeg, "-y", "-f", "concat", "-safe", "0", "-i", str(lst), str(out)],
                                    capture_output=True,
                                    check=True,
                                )
                            final = config.get_generations_dir() / f"{chapter.id}_chapter.wav"
                            # copy out
                            import shutil

                            shutil.copy(str(out), str(final))
                            chapter.audio_path = config.to_storage_path(final)
                    else:
                        # soundfile concat
                        audios = []
                        sr = None
                        for p in wav_paths:
                            data, s = sf.read(p, dtype="float32")
                            if sr is None:
                                sr = s
                            if data.ndim > 1:
                                data = data.mean(axis=1)
                            audios.append(data)
                        if audios:
                            concat = np.concatenate(audios)
                            final = config.get_generations_dir() / f"{chapter.id}_chapter.wav"
                            sf.write(str(final), concat, sr or 24000)
                            chapter.audio_path = config.to_storage_path(final)
                except Exception:
                    # fallback: use first utterance's audio as chapter audio
                    logger.debug("suppressed exception in audiobook_render.py:234", exc_info=True)
                    chapter.audio_path = utterances[0].audio_path if utterances else None
                chapter.duration_ms = total_ms
                chapter.status = "done"
                chapter.error = None
                db.commit()
                return chapter
            raise RuntimeError("No utterance audio produced")
        # Single-voice chapter (prose)
        gen_id, audio_path, dur_ms = await _render_text_via_generation(db, text, profile_id, engine)
        chapter.generation_id = gen_id
        chapter.audio_path = audio_path
        chapter.duration_ms = dur_ms
        chapter.status = "done"
        chapter.error = None
        db.commit()
    except Exception as e:
        import logging

        logging.getLogger(__name__).exception("render_chapter failed")
        chapter.status = "failed"
        chapter.error = str(e)[:500]
        db.commit()
    return chapter


async def render_audiobook(
    audiobook_id: str,
    profile_id: str | None = None,
    engine: str | None = None,
    db_factory=None,
) -> dict:
    from ..database.session import SessionLocal

    close = False
    if db_factory is None:
        db = SessionLocal()
        close = True
    else:
        db = db_factory()
    try:
        book = db.query(DBAudiobook).filter_by(id=audiobook_id).first()
        if not book:
            return {"error": "Audiobook not found"}
        chapters = db.query(DBChapter).filter_by(audiobook_id=audiobook_id).order_by(DBChapter.order_index).all()
        total = len(chapters)
        done = 0
        for ch in chapters:
            if ch.status == "done" and ch.audio_path:
                done += 1
                continue
            pid = _resolve_profile_for_chapter(db, audiobook_id, ch.text, profile_id)
            if not pid:
                ch.status = "failed"
                ch.error = "No voice profile assigned"
                db.commit()
                continue
            await render_chapter(db, ch, pid, engine)
            done += 1
        total_ms = sum(c.duration_ms or 0 for c in chapters if c.duration_ms)
        book.total_duration_ms = total_ms
        db.commit()
        return {"audiobook_id": audiobook_id, "total": total, "done": done, "total_duration_ms": total_ms}
    finally:
        if close:
            db.close()
