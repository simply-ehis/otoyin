"""Downloadable SoundFont banks for the marketplace instrument shelf.

Mirrors the translation-pack flow: a catalog product maps 1:1 to a download
that lands in the instruments library (``data/instruments/<pack-id>/``) and
registers an ``InstrumentPack`` row, so the Store shows Installed and the
/instruments page lists it immediately. No new pip dependencies — stdlib
urllib only. ``file://`` URLs work too (used by tests).
"""

from __future__ import annotations

import contextlib
import logging
import os
import urllib.request
from collections.abc import Callable
from datetime import UTC, datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from ..database.misc import InstrumentPack

logger = logging.getLogger(__name__)

# Cap single-bank downloads at 1 GB (largest shipped bank is ~142 MB).
MAX_PACK_BYTES = 1024 * 1024 * 1024


def instruments_dir() -> str:
    """Library root for installed instrument packs (created on demand)."""
    from .. import config

    d = config.get_data_dir() / "instruments"
    d.mkdir(parents=True, exist_ok=True)
    return str(d)


def pack_dir(pack_id: str) -> str:
    return os.path.join(instruments_dir(), pack_id)


def index_instruments(path: str, fmt: str, pack_id: str) -> list[dict]:
    """Best-effort instrument indexing for a SoundFont file on disk."""
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


def download_soundfont_pack(
    model_name: str,
    url: str,
    display_name: str,
    progress_cb: Callable[[int, int], None] | None = None,
) -> str:
    """Fetch a SoundFont bank into the instruments library. Returns pack dir.

    ``progress_cb(downloaded_bytes, total_bytes)`` is invoked per chunk
    (total 0 when the server omits Content-Length). Raises RuntimeError on
    HTTP errors, oversize payloads, or non-SoundFont content. Idempotent:
    re-downloads overwrite the same pack dir.
    """
    if not url or not url.startswith(("https://", "http://", "file://")):
        raise RuntimeError(f"Refusing to download soundfont from non-HTTP URL for {model_name}")

    dest_dir = pack_dir(model_name)
    os.makedirs(dest_dir, exist_ok=True)

    if url.startswith("file://"):
        from urllib.request import url2pathname

        src = url2pathname(url[len("file://") :])
        size = os.path.getsize(src)
        if size > MAX_PACK_BYTES:
            raise RuntimeError(f"Soundfont file too large ({size} bytes)")
        dest = os.path.join(dest_dir, os.path.basename(src))
        with open(src, "rb") as fin, open(dest, "wb") as fout:
            fout.write(fin.read())
        if progress_cb is not None:
            progress_cb(size, size)
        _assert_soundfont(dest)
        return dest_dir

    dest = os.path.join(dest_dir, os.path.basename(url.split("?", 1)[0]) or f"{model_name}.sf2")
    req = urllib.request.Request(url, headers={"User-Agent": "otoyin-marketplace/1.0"})
    try:
        resp = urllib.request.urlopen(req, timeout=60)
    except Exception as exc:
        raise RuntimeError(f"Could not reach soundfont URL for {model_name}: {exc}") from exc
    total = int(resp.headers.get("Content-Length", 0) or 0)
    if total > MAX_PACK_BYTES:
        raise RuntimeError(f"Soundfont too large ({total} bytes)")
    downloaded = 0
    try:
        with open(dest, "wb") as fout:
            while True:
                chunk = resp.read(1024 * 256)
                if not chunk:
                    break
                downloaded += len(chunk)
                if downloaded > MAX_PACK_BYTES:
                    raise RuntimeError("Soundfont exceeded size cap during download")
                fout.write(chunk)
                if progress_cb is not None:
                    progress_cb(downloaded, total)
    except Exception:
        with contextlib.suppress(OSError):
            os.unlink(dest)
        raise
    _assert_soundfont(dest)
    return dest_dir


def _assert_soundfont(path: str) -> None:
    """Refuse HTML error pages saved as .sf2 (wrong URL, expired CDN token)."""
    with open(path, "rb") as f:
        magic = f.read(12)
    if len(magic) < 12 or magic[:4] != b"RIFF" or magic[8:12] != b"sfbk":
        with contextlib.suppress(OSError):
            os.unlink(path)
        raise RuntimeError(f"Downloaded file is not a SoundFont (bad magic): {path}")


def register_soundfont_pack(db: Session, model_name: str, display_name: str, source_url: str) -> InstrumentPack:
    """Create/refresh the InstrumentPack row for a downloaded bank.

    Pack id == catalog model_name, so reinstalls overwrite instead of
    duplicating and status checks are a single row lookup.
    """
    from ..database.misc import InstrumentPack

    dest_dir = pack_dir(model_name)
    sf2_files = sorted(
        f
        for f in os.listdir(dest_dir)
        if f.lower().endswith((".sf2", ".sf3")) and os.path.isfile(os.path.join(dest_dir, f))
    )
    if not sf2_files:
        raise RuntimeError(f"No SoundFont file found in {dest_dir}")
    dest = os.path.join(dest_dir, sf2_files[0])
    instruments = index_instruments(dest, "soundfont", model_name)
    row = db.query(InstrumentPack).filter_by(id=model_name).first()
    if row is None:
        row = InstrumentPack(id=model_name)
        db.add(row)
    row.name = display_name
    row.version = "1.0.0"
    row.format = "soundfont"
    row.bytes = os.path.getsize(dest)
    row.source = source_url
    row.instruments_json = instruments
    row.installed_at = datetime.now(UTC)
    db.commit()
    db.refresh(row)
    return row


def is_soundfont_pack_installed(db: Session, model_name: str) -> bool:
    """True when the pack row exists AND its SoundFont file is on disk."""
    from ..database.misc import InstrumentPack

    row = db.query(InstrumentPack).filter_by(id=model_name).first()
    if row is None:
        return False
    dest_dir = os.path.join(instruments_dir(), model_name)
    try:
        return any(
            f.lower().endswith((".sf2", ".sf3")) and os.path.isfile(os.path.join(dest_dir, f))
            for f in os.listdir(dest_dir)
        )
    except OSError:
        return False


def delete_soundfont_pack(db: Session, model_name: str) -> bool:
    """Remove a marketplace SoundFont pack (files + DB row). Returns row-existed."""
    from ..database.misc import InstrumentPack

    row = db.query(InstrumentPack).filter_by(id=model_name).first()
    existed = row is not None
    if row is not None:
        db.delete(row)
        db.commit()
    delete_soundfont_pack_files_only(model_name)
    return existed


def delete_soundfont_pack_files_only(model_name: str) -> None:
    """Remove a pack's files, leaving any DB row alone (DB-unavailable path)."""
    import shutil

    dest_dir = os.path.join(instruments_dir(), model_name)
    if os.path.isdir(dest_dir):
        shutil.rmtree(dest_dir, ignore_errors=True)
