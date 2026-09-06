"""Launcher session endpoints (clip grid + scenes, ported from Resonant)."""

from __future__ import annotations

import asyncio
import logging
import math
import os
import uuid
from datetime import UTC, datetime

import numpy as np
import soundfile as sf
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import config, models
from ..database import LauncherSession as DBLauncherSession, get_db
from ..errors import ERR_INVALID_REQUEST
from ..utils.audio import save_audio

logger = logging.getLogger(__name__)

router = APIRouter()


def _to_response(row: DBLauncherSession) -> models.LauncherSessionResponse:
    tracks = row.tracks_json or []
    clips_raw = row.clips_json or {}
    clips = {k: models.LauncherClipPayload(**v) for k, v in clips_raw.items()}
    return models.LauncherSessionResponse(
        id=row.id,
        name=row.name or "Untitled session",
        session=models.LauncherSessionPayload(
            name=row.name or "Untitled session",
            bpm=row.bpm or 120.0,
            master_volume=row.master_volume or 0.84,
            tracks=[models.LauncherTrackPayload(**t) for t in tracks],
            clips=clips,
            num_scenes=row.num_scenes or 4,
        ),
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get(
    "/launcher/sessions",
    response_model=list[models.LauncherSessionResponse],
)
async def list_launcher_sessions(db: Session = Depends(get_db)):
    """List launcher sessions, newest first."""
    rows = (
        db.query(DBLauncherSession)
        .order_by(DBLauncherSession.updated_at.desc())
        .all()
    )
    return [_to_response(row) for row in rows]


@router.post(
    "/launcher/sessions", response_model=models.LauncherSessionResponse
)
async def create_launcher_session(
    data: models.LauncherSessionCreate, db: Session = Depends(get_db)
):
    """Create a launcher session."""
    payload = data.session
    row = DBLauncherSession(
        name=data.name or payload.name,
        bpm=payload.bpm,
        master_volume=payload.master_volume,
        tracks_json=[t.model_dump(by_alias=True) for t in payload.tracks],
        clips_json={
            k: v.model_dump(by_alias=True) for k, v in payload.clips.items()
        },
        num_scenes=payload.num_scenes,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_response(row)


@router.get(
    "/launcher/sessions/{session_id}",
    response_model=models.LauncherSessionResponse,
)
async def get_launcher_session(
    session_id: str, db: Session = Depends(get_db)
):
    """Get one launcher session."""
    row = db.query(DBLauncherSession).filter_by(id=session_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail=ERR_INVALID_REQUEST)
    return _to_response(row)


@router.put(
    "/launcher/sessions/{session_id}",
    response_model=models.LauncherSessionResponse,
)
async def update_launcher_session(
    session_id: str,
    data: models.LauncherSessionCreate,
    db: Session = Depends(get_db),
):
    """Replace a launcher session."""
    row = db.query(DBLauncherSession).filter_by(id=session_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail=ERR_INVALID_REQUEST)
    payload = data.session
    row.name = data.name or payload.name
    row.bpm = payload.bpm
    row.master_volume = payload.master_volume
    row.tracks_json = [t.model_dump(by_alias=True) for t in payload.tracks]
    row.clips_json = {
        k: v.model_dump(by_alias=True) for k, v in payload.clips.items()
    }
    row.num_scenes = payload.num_scenes
    row.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(row)
    return _to_response(row)


@router.delete("/launcher/sessions/{session_id}", status_code=204)
async def delete_launcher_session(
    session_id: str, db: Session = Depends(get_db)
):
    """Delete a launcher session."""
    row = db.query(DBLauncherSession).filter_by(id=session_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail=ERR_INVALID_REQUEST)
    db.delete(row)
    db.commit()


# ─── Capture (bounce session to WAV) ────────────────────────────────────────


def _apply_pan_stereo(audio: np.ndarray, pan: float) -> np.ndarray:
    """Equal-power stereo pan. audio is [n, 2]; pan in [-1, 1]."""
    pan = max(-1.0, min(1.0, pan))
    if pan <= -1.0:
        left, right = 1.0, 0.0
    elif pan >= 1.0:
        left, right = 0.0, 1.0
    else:
        angle = (pan + 1.0) * math.pi / 4.0
        left = math.cos(angle)
        right = math.sin(angle)
    out = audio.copy()
    out[:, 0] = audio[:, 0] * left
    out[:, 1] = audio[:, 1] * right
    return out


def _bounce_launcher_session(
    session: models.LauncherSessionPayload,
    active_clips: dict[str, str | None] | None = None,
) -> tuple[np.ndarray, int]:
    """Mix all unmuted/active clips into a stereo WAV array."""
    sample_rate = 44100
    has_solo = any(t.solo for t in session.tracks)

    # Determine which clips to include
    if active_clips is not None:
        clip_map = active_clips
    else:
        # Use the first scene's clip assignments
        clip_map = {}
        for track in session.tracks:
            for clip_id, clip in session.clips.items():
                if clip.track_id == track.id and clip.scene == 0:
                    clip_map[track.id] = clip_id
                    break

    processed: list[tuple[np.ndarray, float, float]] = []

    for track in session.tracks:
        if track.mute:
            continue
        if has_solo and not track.solo:
            continue
        clip_id = clip_map.get(track.id)
        if not clip_id or clip_id not in session.clips:
            continue
        clip = session.clips[clip_id]

        # Load audio from storage
        audio_path = config.resolve_storage_path(clip.audio_path)
        if not os.path.isfile(str(audio_path)):
            logger.warning("Clip audio not found: %s", audio_path)
            continue

        try:
            audio, sr = sf.read(str(audio_path), dtype="float32", always_2d=False)
        except Exception:
            logger.warning("Failed to read clip audio: %s", audio_path)
            continue

        if audio.ndim == 1:
            audio = np.stack([audio, audio], axis=1)
        if audio.shape[1] < 2:
            audio = np.concatenate([audio, audio], axis=1)
        elif audio.shape[1] > 2:
            audio = audio[:, :2]

        if sr != sample_rate:
            from scipy.signal import resample

            target_len = int(audio.shape[0] * sample_rate / sr)
            audio = resample(audio, target_len).astype(np.float32)

        processed.append((audio, track.volume, track.pan))

    if not processed:
        raise HTTPException(status_code=400, detail="No active clips to capture")

    max_len = max(a.shape[0] for a, _, _ in processed)
    mixed = np.zeros((max_len, 2), dtype=np.float32)

    for audio, volume, pan in processed:
        padded = np.zeros((max_len, 2), dtype=np.float32)
        padded[: audio.shape[0]] = audio
        padded = _apply_pan_stereo(padded, pan)
        mixed += padded * volume

    mixed *= session.master_volume
    mixed = np.clip(mixed, -1.0, 1.0)
    return mixed, sample_rate


@router.post(
    "/launcher/sessions/{session_id}/capture",
    response_model=models.LauncherCaptureResponse,
)
async def capture_launcher_session(
    session_id: str,
    data: models.LauncherCaptureRequest | None = None,
    db: Session = Depends(get_db),
):
    """Bounce active launcher clips to a WAV file and return its storage path."""
    row = db.query(DBLauncherSession).filter_by(id=session_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail=ERR_INVALID_REQUEST)

    payload = models.LauncherSessionPayload(
        name=row.name or "Untitled session",
        bpm=row.bpm or 120.0,
        master_volume=row.master_volume or 0.84,
        tracks=[models.LauncherTrackPayload(**t) for t in (row.tracks_json or [])],
        clips={
            k: models.LauncherClipPayload(**v)
            for k, v in (row.clips_json or {}).items()
        },
        num_scenes=row.num_scenes or 4,
    )

    active_clips = data.active_clips if data else None
    mixed, sr = await asyncio.to_thread(
        _bounce_launcher_session, payload, active_clips
    )

    output_filename = f"launcher_capture_{uuid.uuid4().hex[:12]}.wav"
    output_path = config.get_exports_dir() / output_filename
    await asyncio.to_thread(save_audio, mixed, output_path, sr)

    storage_path = str(output_path.relative_to(config.get_storage_dir()))
    return models.LauncherCaptureResponse(
        audio_path=storage_path,
        filename=output_filename,
        duration_s=round(mixed.shape[0] / sr, 3),
        sample_rate=sr,
    )
