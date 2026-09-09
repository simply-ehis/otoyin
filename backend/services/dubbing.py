"""Video dubbing pipeline.

End-to-end flow:
  video → extract audio → transcribe → translate → synthesize → mux back to video

Speaker diarization is optional (Resemblyzer + Silero VAD + sklearn).
When unavailable the entire track is treated as a single speaker.

Translation uses Argos Translate (offline, per-language download) with
deep-translator as fallback.
"""

from __future__ import annotations

import asyncio
import logging
import shutil
import subprocess
import tempfile
import uuid
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------


@dataclass
class Segment:
    """One transcribed utterance with timing."""

    id: int
    start: float
    end: float
    text: str
    speaker: str = "SPEAKER_00"


@dataclass
class DubbedSegment:
    """A segment after translation and synthesis."""

    id: int
    start: float
    end: float
    original_text: str
    translated_text: str
    speaker: str
    audio_path: str | None = None
    audio_duration: float = 0.0


@dataclass
class DubJob:
    """Runtime state for a dubbing job."""

    job_id: str
    status: str = "pending"  # pending | transcribing | translating | synthesizing | muxing | done | failed
    progress: float = 0.0
    source_lang: str | None = None
    target_lang: str = "en"
    total_segments: int = 0
    completed_segments: int = 0
    segments: list[DubbedSegment] = field(default_factory=list)
    output_path: str | None = None
    error: str | None = None


# Global job store (single-worker safe)
_jobs: dict[str, DubJob] = {}


def _which_ffmpeg() -> str | None:
    return shutil.which("ffmpeg")


def _which_ffprobe() -> str | None:
    return shutil.which("ffprobe")


FFMPEG = _which_ffmpeg()
FFPROBE = _which_ffprobe()

# ---------------------------------------------------------------------------
# Diarization (optional — torch-free via Resemblyzer + Silero VAD + sklearn)
# ---------------------------------------------------------------------------


def _diarize(audio_path: str, num_speakers: int | None = None) -> list[Segment]:
    """Run speaker diarization and return speaker-tagged segments.

    Delegates to the shared :mod:`backend.services.diarization` service
    (Silero VAD + Resemblyzer + SpectralClustering) and maps its turns to
    dubbing ``Segment`` objects. Falls back to single-speaker when the
    optional deps are unavailable.
    """
    from .diarization import diarize_turns

    turns = diarize_turns(audio_path, num_speakers)
    return [
        Segment(
            id=i,
            start=turn.start,
            end=turn.end,
            text="",
            speaker=turn.speaker,
        )
        for i, turn in enumerate(turns)
    ]


# ---------------------------------------------------------------------------
# Transcription
# ---------------------------------------------------------------------------


def _transcribe_with_segments(audio_path: str, language: str | None = None) -> list[Segment]:
    """Transcribe audio and return timed segments."""
    from .transcribe import get_whisper_model

    whisper = get_whisper_model()

    async def _run() -> dict:
        if not whisper.is_loaded():
            await whisper.load_model_async("base")
        return await whisper.transcribe_with_segments(audio_path, language=language)

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop and loop.is_running():
        # Called from a worker thread via asyncio.to_thread — create a dedicated loop
        new_loop = asyncio.new_event_loop()
        try:
            result = new_loop.run_until_complete(_run())
        finally:
            new_loop.close()
    else:
        result = asyncio.run(_run())

    raw_segments = result.get("segments", [])
    return [
        Segment(
            id=i,
            start=seg.get("start", 0.0),
            end=seg.get("end", 0.0),
            text=seg.get("text", "").strip(),
        )
        for i, seg in enumerate(raw_segments)
        if seg.get("text", "").strip()
    ]


def _align_speakers(
    transcript_segments: list[Segment],
    speaker_segments: list[Segment],
) -> list[Segment]:
    """Assign speaker labels to transcript segments by timestamp overlap."""
    if not speaker_segments:
        return transcript_segments

    from .diarization import align_speakers

    return align_speakers(transcript_segments, speaker_segments)


# ---------------------------------------------------------------------------
# Translation (Argos Translate primary, deep-translator fallback)
# ---------------------------------------------------------------------------

_argos_translator_cache: dict[str, object] = {}


def _get_argos_translator(source_lang: str, target_lang: str) -> object | None:
    """Get or create an Argos Translate translator for a language pair."""
    cache_key = f"{source_lang}-{target_lang}"
    if cache_key in _argos_translator_cache:
        return _argos_translator_cache[cache_key]

    try:
        import argostranslate.package
        import argostranslate.translate

        # Update package index if needed (first time only)
        if not argostranslate.package.get_available_packages():
            argostranslate.package.update_package_index()

        # Find and install the language pair package
        available_packages = argostranslate.package.get_available_packages()
        package_to_install = next(
            (pkg for pkg in available_packages if pkg.from_code == source_lang and pkg.to_code == target_lang),
            None,
        )

        if package_to_install is None:
            logger.info("Argos: no package for %s→%s", source_lang, target_lang)
            return None

        # Check if already installed
        installed_languages = argostranslate.translate.get_installed_languages()
        src_installed = next((lang for lang in installed_languages if lang.code == source_lang), None)
        tgt_installed = next((lang for lang in installed_languages if lang.code == target_lang), None)

        if src_installed and tgt_installed:
            translator = src_installed.get_translation(tgt_installed)
            _argos_translator_cache[cache_key] = translator
            return translator

        # Install the package
        argostranslate.package.install_from_path(package_to_install.download())

        # Get translator after install
        installed_languages = argostranslate.translate.get_installed_languages()
        src_installed = next((lang for lang in installed_languages if lang.code == source_lang), None)
        tgt_installed = next((lang for lang in installed_languages if lang.code == target_lang), None)

        if src_installed and tgt_installed:
            translator = src_installed.get_translation(tgt_installed)
            _argos_translator_cache[cache_key] = translator
            return translator

    except Exception as exc:
        logger.warning("Argos Translate init failed for %s→%s: %s", source_lang, target_lang, exc)

    return None


def _chunk_for_translate(text: str, limit: int = 4000) -> list[str]:
    """Global chunking for any supported text place — mirrors services/translation.py."""
    if len(text) <= limit:
        return [text]
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + limit, len(text))
        if end < len(text):
            for sep in ("\n\n", "\n", ". ", "! ", "? ", "; ", ", ", " "):
                idx = text.rfind(sep, start, end)
                if idx != -1 and idx > start + limit // 2:
                    end = idx + len(sep)
                    break
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start = end
    return chunks if chunks else [text]


def _translate_with_argos(text: str, source_lang: str, target_lang: str) -> str | None:
    """Translate text using Argos Translate. Returns None if unavailable."""
    translator = _get_argos_translator(source_lang, target_lang)
    if translator is None:
        return None

    # Global chunking — huge single segment is split, translated piece-wise, rejoined.
    parts: list[str] = []
    for ch in _chunk_for_translate(text):
        try:
            result = translator.translate(ch)
            if not result:
                return None
            parts.append(result.strip())
        except Exception as exc:
            logger.warning("Argos Translate failed: %s", exc)
            return None
    sep = "\n\n" if "\n\n" in text else "\n" if "\n" in text else " "
    return sep.join(parts) if parts else None


def _translate_with_deep_translator(text: str, source_lang: str, target_lang: str) -> str | None:
    """Fallback: translate using deep-translator (Google Translate)."""
    try:
        from deep_translator import GoogleTranslator

        src = source_lang if source_lang != "auto" else "auto"
        translator = GoogleTranslator(source=src, target=target_lang)
        parts: list[str] = []
        for ch in _chunk_for_translate(text):
            result = translator.translate(ch)
            if not result:
                return None
            parts.append(result.strip())
        sep = "\n\n" if "\n\n" in text else "\n" if "\n" in text else " "
        return sep.join(parts) if parts else None
    except Exception as exc:
        logger.warning("deep-translator failed: %s", exc)
        return None


async def _translate_segments(
    segments: list[Segment],
    target_lang: str,
    source_lang: str = "auto",
) -> list[Segment]:
    """Translate each segment's text to the target language.

    Uses Argos Translate as primary (offline, per-language download),
    falls back to deep-translator if Argos fails or model not available.
    """
    translated: list[Segment] = []
    chunk_size = 5
    for i in range(0, len(segments), chunk_size):
        chunk = segments[i : i + chunk_size]
        for seg in chunk:
            result_text: str | None = None
            # Try Argos Translate first
            if source_lang != "auto":
                result_text = _translate_with_argos(seg.text, source_lang, target_lang)
            # Fall back to deep-translator
            if result_text is None:
                result_text = await asyncio.to_thread(
                    _translate_with_deep_translator, seg.text, source_lang, target_lang
                )
            if result_text is None:
                logger.warning("All translation backends failed for segment %d", seg.id)
                translated.append(Segment(id=seg.id, start=seg.start, end=seg.end, text=seg.text, speaker=seg.speaker))
            else:
                translated.append(
                    Segment(
                        id=seg.id,
                        start=seg.start,
                        end=seg.end,
                        text=result_text,
                        speaker=seg.speaker,
                    )
                )
        if i + chunk_size < len(segments):
            await asyncio.sleep(0.5)
    return translated


# ---------------------------------------------------------------------------
# Synthesis
# ---------------------------------------------------------------------------


async def _synthesize_segments(
    segments: list[Segment],
    profile_id: str,
    engine: str,
    language: str,
    db_session,
) -> list[DubbedSegment]:
    """Synthesize translated text for each segment using a voice profile."""
    from ..backends import get_tts_backend_for_engine, load_engine_model
    from ..utils.model_lifecycle import lifecycle_manager
    from .profiles import create_voice_prompt_for_profile

    tts_backend = get_tts_backend_for_engine(engine)
    lifecycle_manager.mark_model_used(engine)
    if not tts_backend.is_loaded():
        await load_engine_model(engine, tts_backend)

    voice_prompt = await create_voice_prompt_for_profile(profile_id, db_session, use_cache=True, engine=engine)

    results: list[DubbedSegment] = []
    for seg in segments:
        try:
            audio_array, sample_rate = await tts_backend.generate(
                text=seg.text,
                voice_prompt=voice_prompt,
                language=language,
            )
            # Save segment audio to temp file
            seg_path = Path(tempfile.mktemp(suffix=".wav"))
            import soundfile as sf

            sf.write(str(seg_path), audio_array, sample_rate)
            audio_duration = len(audio_array) / sample_rate

            results.append(
                DubbedSegment(
                    id=seg.id,
                    start=seg.start,
                    end=seg.end,
                    original_text="",
                    translated_text=seg.text,
                    speaker=seg.speaker,
                    audio_path=str(seg_path),
                    audio_duration=audio_duration,
                )
            )
        except Exception as exc:
            logger.warning("Synthesis failed for segment %d: %s", seg.id, exc)
            results.append(
                DubbedSegment(
                    id=seg.id,
                    start=seg.start,
                    end=seg.end,
                    original_text="",
                    translated_text=seg.text,
                    speaker=seg.speaker,
                    audio_path=None,
                    audio_duration=0.0,
                )
            )
    return results


# ---------------------------------------------------------------------------
# Muxing
# ---------------------------------------------------------------------------


def _time_stretch_audio(audio_path: str, target_duration: float, output_path: str) -> str:
    """Stretch or compress audio to match a target duration using atempo."""
    import soundfile as sf

    ffmpeg = _which_ffmpeg() or FFMPEG
    if not ffmpeg:
        raise RuntimeError("ffmpeg not found — cannot stretch audio")
    info = sf.info(audio_path)
    current_duration = info.duration
    if current_duration <= 0 or target_duration <= 0:
        shutil.copy2(audio_path, output_path)
        return output_path

    ratio = target_duration / current_duration
    # atempo accepts 0.5-2.0; chain multiple for larger ratios
    atempo_filters: list[str] = []
    r = ratio
    while r > 2.0:
        atempo_filters.append("atempo=2.0")
        r /= 2.0
    while r < 0.5:
        atempo_filters.append("atempo=0.5")
        r *= 2.0
    atempo_filters.append(f"atempo={r:.4f}")
    filter_chain = ",".join(atempo_filters)

    cmd = [
        ffmpeg,
        "-i",
        audio_path,
        "-filter:a",
        filter_chain,
        "-y",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f"atempo failed: {result.stderr}")
    return output_path


def _mux_video_with_audio(
    video_path: str,
    dubbed_segments: list[DubbedSegment],
    output_path: str,
    sample_rate: int = 48000,
) -> str:
    """Replace the audio track of a video with dubbed segments, preserving timing."""
    ffmpeg = _which_ffmpeg() or FFMPEG
    ffprobe = _which_ffprobe() or FFPROBE
    if not ffmpeg:
        raise RuntimeError("ffmpeg not found — cannot mux video")
    if not ffprobe:
        raise RuntimeError("ffprobe not found — cannot probe video")

    with tempfile.TemporaryDirectory(prefix="dub_") as tmp:
        # Build a silence-padded master audio that matches the video duration
        probe_cmd = [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            video_path,
        ]
        probe_result = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=30)
        video_duration = float(probe_result.stdout.strip() or "0")

        # Create full-length silence
        silence_path = str(Path(tmp) / "silence.wav")
        silence_cmd = [
            ffmpeg,
            "-f",
            "lavfi",
            "-i",
            f"anullsrc=r={sample_rate}:cl=mono",
            "-t",
            f"{video_duration:.3f}",
            "-y",
            silence_path,
        ]
        subprocess.run(silence_cmd, capture_output=True, text=True, timeout=60, check=True)

        # Place each segment at its timestamp using adelay + amix
        input_args = ["-i", silence_path]
        filter_parts: list[str] = []
        valid_segments = [s for s in dubbed_segments if s.audio_path]

        for i, seg in enumerate(valid_segments):
            input_args.extend(["-i", seg.audio_path])
            delay_ms = int(seg.start * 1000)
            filter_parts.append(f"[{i + 1}:a]adelay={delay_ms}|{delay_ms}[d{i}]")

        if not valid_segments:
            shutil.copy2(silence_path, output_path)
            return output_path

        # Mix all delayed segments onto the silence base
        mix_inputs = "".join(f"[d{i}]" for i in range(len(valid_segments)))
        filter_parts.append(
            f"[0:a]{mix_inputs}amix=inputs={len(valid_segments) + 1}:duration=first:dropout_transition=0[out]"
        )
        filter_complex = ";".join(filter_parts)

        # Step 1: create dubbed audio
        dubbed_audio = str(Path(tmp) / "dubbed_audio.wav")
        audio_cmd = [
            ffmpeg,
            *input_args,
            "-filter_complex",
            filter_complex,
            "-map",
            "[out]",
            "-ar",
            str(sample_rate),
            "-y",
            dubbed_audio,
        ]
        result = subprocess.run(audio_cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            raise RuntimeError(f"Audio mix failed: {result.stderr}")

        # Step 2: replace video audio track
        mux_cmd = [
            ffmpeg,
            "-i",
            video_path,
            "-i",
            dubbed_audio,
            "-c:v",
            "copy",
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-shortest",
            "-y",
            output_path,
        ]
        result = subprocess.run(mux_cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            raise RuntimeError(f"Video mux failed: {result.stderr}")

    return output_path


# ---------------------------------------------------------------------------
# Public pipeline
# ---------------------------------------------------------------------------


async def run_dubbing(
    job_id: str,
    video_path: str,
    target_lang: str,
    profile_id: str,
    engine: str,
    source_lang: str | None = None,
    num_speakers: int | None = None,
    db_session=None,
) -> DubJob:
    """Execute the full dubbing pipeline for a job."""
    job = _jobs[job_id]
    data_dir = Path(tempfile.mkdtemp(prefix="dubbing_"))

    try:
        # Step 1: Extract audio from video
        job.status = "transcribing"
        job.progress = 0.05
        audio_path = str(data_dir / "extracted.wav")
        from .extended_import import extract_audio_from_video

        extract_audio_from_video(video_path, output_path=audio_path, sample_rate=44100, channels=1)

        # Step 2: Diarize speakers
        speaker_segments: list[Segment] = []
        if num_speakers != 1:
            speaker_segments = await asyncio.to_thread(_diarize, audio_path, num_speakers)

        # Step 3: Transcribe
        job.progress = 0.15
        transcript = await asyncio.to_thread(_transcribe_with_segments, audio_path, source_lang)
        # Detect source language from whisper if not provided
        if source_lang and source_lang != "auto":
            job.source_lang = source_lang
        else:
            # _transcribe_with_segments doesn't return language; fallback to first segment detection is not available
            # Keep original request value so UI can display it
            job.source_lang = source_lang or "auto"

        # Align speaker labels
        if speaker_segments:
            transcript = _align_speakers(transcript, speaker_segments)

        job.total_segments = len(transcript)
        job.progress = 0.30

        # Step 4: Translate
        job.status = "translating"
        translated = await _translate_segments(transcript, target_lang, source_lang or "auto")
        job.progress = 0.50

        # Step 5: Synthesize
        job.status = "synthesizing"
        original_texts = {seg.id: seg.text for seg in transcript}
        dubbed = await _synthesize_segments(
            translated,
            profile_id,
            engine,
            target_lang,
            db_session,
        )
        for ds in dubbed:
            ds.original_text = original_texts.get(ds.id, "")
            if ds.audio_path:
                job.completed_segments += 1
        job.segments = dubbed
        job.progress = 0.85

        # Step 6: Mux
        job.status = "muxing"
        output_path = str(data_dir / f"dubbed_{job_id}.mp4")
        await asyncio.to_thread(_mux_video_with_audio, video_path, dubbed, output_path)
        job.output_path = output_path
        job.progress = 1.0
        job.status = "done"

    except Exception as exc:
        logger.exception("Dubbing job %s failed", job_id)
        job.status = "failed"
        job.error = str(exc)

    return job


# ---------------------------------------------------------------------------
# Job management
# ---------------------------------------------------------------------------


def create_job() -> str:
    """Create a new dubbing job and return its ID."""
    job_id = str(uuid.uuid4())
    _jobs[job_id] = DubJob(job_id=job_id)
    return job_id


def get_job(job_id: str) -> DubJob | None:
    return _jobs.get(job_id)


def cancel_job(job_id: str) -> bool:
    job = _jobs.get(job_id)
    if job and job.status not in ("done", "failed"):
        job.status = "failed"
        job.error = "Cancelled by user"
        return True
    return False
