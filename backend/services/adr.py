"""ADR (Automated Dialogue Replacement) service — DB-backed persistence."""

import logging
import uuid

from sqlalchemy.orm import Session

from ..config import get_adr_dir, to_storage_path
from ..database.models import ADRLine, ADRSession, ADRTake

logger = logging.getLogger(__name__)


def create_session(
    db: Session,
    name: str,
    fps: float = 24.0,
    lines: list[dict] | None = None,
) -> ADRSession:
    session = ADRSession(
        id=str(uuid.uuid4()),
        name=name,
        fps=fps,
    )
    db.add(session)
    db.flush()

    for idx, line_data in enumerate(lines or []):
        line = ADRLine(
            id=str(uuid.uuid4()),
            session_id=session.id,
            line_index=idx,
            original_text=line_data.get("original_text", ""),
            character=line_data.get("character", ""),
            target_duration_ms=line_data.get("target_duration_ms", 0.0),
            timecode_in=line_data.get("timecode_in", ""),
            timecode_out=line_data.get("timecode_out", ""),
        )
        db.add(line)

    db.commit()
    db.refresh(session)
    return session


def list_sessions(db: Session) -> list[ADRSession]:
    return db.query(ADRSession).order_by(ADRSession.created_at.desc()).all()


def get_session(db: Session, session_id: str) -> ADRSession | None:
    return db.query(ADRSession).filter(ADRSession.id == session_id).first()


def delete_session(db: Session, session_id: str) -> bool:
    session = db.query(ADRSession).filter(ADRSession.id == session_id).first()
    if not session:
        return False
    db.delete(session)
    db.commit()
    return True


def get_lines(db: Session, session_id: str) -> list[ADRLine]:
    return db.query(ADRLine).filter(ADRLine.session_id == session_id).order_by(ADRLine.line_index).all()


def get_takes(db: Session, line_id: str) -> list[ADRTake]:
    return db.query(ADRTake).filter(ADRTake.line_id == line_id).order_by(ADRTake.take_number).all()


def add_take(
    db: Session,
    line_id: str,
    audio_filename: str,
    duration_ms: float = 0.0,
) -> ADRTake:
    line = db.query(ADRLine).filter(ADRLine.id == line_id).first()
    if not line:
        msg = f"Line {line_id} not found"
        raise ValueError(msg)

    existing = db.query(ADRTake).filter(ADRTake.line_id == line_id).count()
    take = ADRTake(
        id=str(uuid.uuid4()),
        line_id=line_id,
        take_number=existing + 1,
        audio_path=to_storage_path(get_adr_dir() / audio_filename),
        duration_ms=duration_ms,
    )
    db.add(take)
    db.commit()
    db.refresh(take)
    # Auto-score the take so quality badges and auto-select have data.
    try:
        import soundfile as sf

        fp = get_adr_dir() / audio_filename
        if fp.exists():
            data, sr = sf.read(str(fp))
            if getattr(data, "ndim", 1) > 1:
                data = data.mean(axis=1)
            # cap to 10s for scoring to avoid huge payloads
            sr_i = int(sr) if sr else 24000
            max_n = sr_i * 10
            if len(data) > max_n:
                data = data[:max_n]
            take.quality_score = score_take_quality(data.astype(float).tolist(), sr_i)
            db.commit()
            db.refresh(take)
    except Exception:
        logger.debug("ADR quality scoring failed", exc_info=True)
    return take


def select_take(db: Session, line_id: str, take_id: str) -> bool:
    line = db.query(ADRLine).filter(ADRLine.id == line_id).first()
    if not line:
        return False
    line.selected_take_id = take_id
    db.commit()
    return True


def delete_take(db: Session, take_id: str) -> bool:
    take = db.query(ADRTake).filter(ADRTake.id == take_id).first()
    if not take:
        return False
    db.delete(take)
    db.commit()
    return True


def set_guide_audio(db: Session, session_id: str, audio_path: str, duration_ms: float) -> bool:
    session = db.query(ADRSession).filter(ADRSession.id == session_id).first()
    if not session:
        return False
    session.guide_audio_path = to_storage_path(audio_path)
    session.guide_duration_ms = duration_ms
    db.commit()
    return True


def calculate_alignment_offset(
    guide_audio: list[float],
    take_audio: list[float],
    sample_rate: int,
) -> float:
    import numpy as np

    guide = np.array(guide_audio, dtype=np.float32)
    take = np.array(take_audio, dtype=np.float32)
    if len(guide) == 0 or len(take) == 0:
        return 0.0
    min_len = min(len(guide), len(take))
    guide = guide[:min_len]
    take = take[:min_len]
    guide_norm = guide - np.mean(guide)
    take_norm = take - np.mean(take)
    correlation = np.correlate(take_norm, guide_norm, mode="full")
    lag = np.argmax(correlation) - min_len + 1
    return (lag / sample_rate) * 1000.0


def score_take_quality(audio: list[float], sample_rate: int) -> float:
    import numpy as np

    signal = np.array(audio, dtype=np.float32)
    if len(signal) == 0:
        return 0.0
    rms = np.sqrt(np.mean(signal**2))
    peak = np.max(np.abs(signal))
    if peak == 0:
        return 0.0
    headroom_db = 20 * np.log10(peak)
    clipping_penalty = max(0, (headroom_db - 0) / 6) * 0.3
    silence_threshold = 0.01
    frame_size = int(0.02 * sample_rate)
    speech_frames = 0
    total_frames = 0
    for i in range(0, len(signal), frame_size):
        frame = signal[i : i + frame_size]
        if len(frame) > 0:
            total_frames += 1
            if np.max(np.abs(frame)) > silence_threshold:
                speech_frames += 1
    speech_ratio = speech_frames / max(total_frames, 1)
    score = min(1.0, rms * 3.0) * 0.5 + speech_ratio * 0.3 + (1.0 - clipping_penalty) * 0.2
    return max(0.0, min(1.0, score))


def auto_select_best_take(
    takes: list[dict],
    target_duration_ms: float,
) -> str | None:
    if not takes:
        return None
    scored = []
    for take in takes:
        timing_fit = 1.0
        if target_duration_ms > 0:
            duration_diff = abs(take.get("duration_ms", 0) - target_duration_ms) / target_duration_ms
            timing_fit = max(0, 1.0 - duration_diff)
        combined = take.get("quality_score", 0) * 0.6 + timing_fit * 0.4
        scored.append((take.get("id"), combined))
    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[0][0]


def compute_waveform(audio_path: str, num_bars: int = 100) -> list[float]:
    import numpy as np
    import soundfile as sf

    data, _sr = sf.read(audio_path)
    if data.ndim > 1:
        data = data.mean(axis=1)
    chunk = max(1, len(data) // num_bars)
    bars = []
    for i in range(0, len(data), chunk):
        segment = data[i : i + chunk]
        if len(segment) > 0:
            bars.append(float(np.max(np.abs(segment))))
    if not bars:
        return [0.0] * num_bars
    max_val = max(bars) or 1.0
    return [min(1.0, b / max_val) for b in bars]
