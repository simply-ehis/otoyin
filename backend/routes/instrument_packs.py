"""Instrument pack endpoints — upload, list, serve, remove."""

from __future__ import annotations

import json
import logging
import os
import shutil
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from .. import config, models
from ..database import InstrumentPack as DBInstrumentPack, get_db
from ..errors import ERR_INVALID_REQUEST

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_UPLOAD_BYTES = 200 * 1024 * 1024  # 200 MB


def _instruments_dir() -> str:
    d = config.get_data_dir() / "instruments"
    d.mkdir(parents=True, exist_ok=True)
    return str(d)


def _to_response(row: DBInstrumentPack) -> models.InstrumentPackResponse:
    instruments_raw = row.instruments_json or []
    return models.InstrumentPackResponse(
        id=row.id,
        name=row.name,
        version=row.version or "1.0.0",
        format=row.format or "soundfont",
        bytes=row.bytes or 0,
        source=row.source,
        instruments=[models.InstrumentPackInstrument(**i) for i in instruments_raw],
        installed_at=row.installed_at or datetime.now(UTC),
    )


@router.get(
    "/instrument-packs",
    response_model=list[models.InstrumentPackResponse],
)
async def list_instrument_packs(db: Session = Depends(get_db)):
    """List installed instrument packs, newest first."""
    rows = db.query(DBInstrumentPack).order_by(DBInstrumentPack.installed_at.desc()).all()
    return [_to_response(row) for row in rows]


@router.post(
    "/instrument-packs/upload",
    response_model=models.InstrumentUploadResponse,
)
async def upload_instrument_pack(
    file: UploadFile,
    name: str = Form(""),
    db: Session = Depends(get_db),
):
    """Upload an instrument file (SF2/SF3/SFZ/WAV/OGG/MP3) and register it."""
    contents = bytearray()
    total = 0
    while chunk := await file.read(1024 * 1024):
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="File too large")
        contents.extend(chunk)

    if not contents:
        raise HTTPException(status_code=400, detail="Empty file")

    filename = file.filename or "unknown"
    ext = os.path.splitext(filename)[1].lower()
    format_map = {
        ".sf2": "soundfont",
        ".sf3": "soundfont",
        ".sfz": "sfz",
        ".wav": "sample",
        ".ogg": "sample",
        ".mp3": "sample",
        ".flac": "sample",
        ".m4a": "sample",
    }
    fmt = format_map.get(ext, "sample")

    pack_id = uuid.uuid4().hex[:12]
    pack_dir = os.path.join(_instruments_dir(), pack_id)
    os.makedirs(pack_dir, exist_ok=True)
    dest = os.path.join(pack_dir, filename)
    with open(dest, "wb") as f:
        f.write(contents)

    instruments = _index_instruments(dest, fmt, pack_id)
    manifest = {
        "name": name or os.path.splitext(filename)[0],
        "format": fmt,
        "instruments": instruments,
    }
    with open(os.path.join(pack_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f)

    row = DBInstrumentPack(
        id=pack_id,
        name=name or os.path.splitext(filename)[0],
        version="1.0.0",
        format=fmt,
        bytes=len(contents),
        source=filename,
        instruments_json=instruments,
        installed_at=datetime.now(UTC),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return models.InstrumentUploadResponse(
        pack=_to_response(row),
        instrument_count=len(instruments),
    )


def _index_instruments(path: str, fmt: str, pack_id: str) -> list[dict]:
    """Best-effort instrument indexing from an uploaded file."""
    instruments: list[dict] = []
    basename = os.path.splitext(os.path.basename(path))[0]

    if fmt == "soundfont":
        try:
            from spessasynth_core import SoundBankLoader

            with open(path, "rb") as f:
                data = f.read()
            bank = SoundBankLoader.fromArrayBuffer(data)
            for idx, preset in enumerate(bank):
                instruments.append(
                    {
                        "id": f"{pack_id}:preset-{idx}",
                        "name": getattr(preset, "name", f"Preset {idx}"),
                        "family": "soundfont",
                        "program": getattr(preset, "program", idx),
                        "bankMSB": getattr(preset, "bank", 0),
                        "percussion": getattr(preset, "percussion", False),
                        "format": "soundfont",
                    }
                )
        except Exception:
            logger.warning("Could not index SF2 presets: %s", path)
            instruments.append(
                {
                    "id": f"{pack_id}:main",
                    "name": basename,
                    "family": "soundfont",
                    "format": "soundfont",
                }
            )
    else:
        instruments.append(
            {
                "id": f"{pack_id}:main",
                "name": basename,
                "family": fmt,
                "format": fmt,
            }
        )

    return instruments


@router.get(
    "/instrument-packs/{pack_id}",
    response_model=models.InstrumentPackResponse,
)
async def get_instrument_pack(pack_id: str, db: Session = Depends(get_db)):
    """Get one instrument pack."""
    row = db.query(DBInstrumentPack).filter_by(id=pack_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail=ERR_INVALID_REQUEST)
    return _to_response(row)


@router.get("/instrument-packs/{pack_id}/file")
async def get_instrument_pack_file(pack_id: str, db: Session = Depends(get_db)):
    """Download the raw instrument file (SF2/SF3/SFZ/etc.) for a pack."""
    row = db.query(DBInstrumentPack).filter_by(id=pack_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail=ERR_INVALID_REQUEST)
    pack_dir = os.path.join(_instruments_dir(), pack_id)
    if not os.path.isdir(pack_dir):
        raise HTTPException(status_code=404, detail="Pack files missing")
    for f in os.listdir(pack_dir):
        if f == "manifest.json":
            continue
        ext = os.path.splitext(f)[1].lower()
        if ext in (".sf2", ".sf3", ".sfz", ".wav", ".ogg", ".mp3", ".flac", ".m4a"):
            return FileResponse(
                os.path.join(pack_dir, f),
                media_type="application/octet-stream",
                filename=f,
            )
    raise HTTPException(status_code=404, detail="No instrument file found")


@router.delete("/instrument-packs/{pack_id}", status_code=204)
async def delete_instrument_pack(pack_id: str, db: Session = Depends(get_db)):
    """Remove an instrument pack and its files."""
    row = db.query(DBInstrumentPack).filter_by(id=pack_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail=ERR_INVALID_REQUEST)
    pack_dir = os.path.join(_instruments_dir(), pack_id)
    if os.path.isdir(pack_dir):
        shutil.rmtree(pack_dir, ignore_errors=True)
    db.delete(row)
    db.commit()
