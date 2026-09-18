"""Tests for marketplace SoundFont banks (engine="soundfont").

Covers the translation-pack-style flow: config registry entries, URL
download into the instruments library (file:// URLs stand in for https so
no network is needed), pack registration, installed-state detection, and
deletion. The live-URL proof (real 31 MB GeneralUser download) is a manual
pre-release step, not part of this suite.
"""

import os

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.backends.configs import get_all_model_configs
from backend.database.base import Base
from backend.database.misc import InstrumentPack
from backend.services import soundfont_packs as sf_packs


def _sf2_bytes(extra: bytes = b"\0" * 64) -> bytes:
    """Minimal bytes with a valid SoundFont magic header."""
    return b"RIFF" + len(extra).to_bytes(4, "little") + b"sfbk" + extra


@pytest.fixture
def workdir(tmp_path, monkeypatch):
    lib = tmp_path / "instruments"
    lib.mkdir()
    monkeypatch.setattr(sf_packs, "instruments_dir", lambda: str(lib))
    src = tmp_path / "bank.sf2"
    src.write_bytes(_sf2_bytes())
    bad = tmp_path / "notes.txt"
    bad.write_text("not a soundfont")
    return tmp_path


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()


def _cfg(model_name="sf2-test-bank"):
    return {"model_name": model_name, "display_name": "Test Bank"}


def test_registry_contains_marketplace_banks():
    by_name = {c.model_name: c for c in get_all_model_configs()}
    for model_name in ("sf2-generaluser-gs", "sf2-fluid-gm"):
        cfg = by_name[model_name]
        assert cfg.engine == "soundfont"
        assert cfg.download_url.startswith("https://")
        assert cfg.category == "instruments"


def test_desktop_catalog_lists_banks_free():
    from backend.services import marketplace_catalog

    for model_name in ("sf2-generaluser-gs", "sf2-fluid-gm"):
        product = marketplace_catalog.get_product(model_name)
        assert product is not None
        assert product.get("paid") is False


def test_download_register_status_delete(workdir, db):
    src = workdir / "bank.sf2"
    url = src.as_uri()
    calls = []
    dest_dir = sf_packs.download_soundfont_pack("sf2-test-bank", url, "Test Bank", lambda d, t: calls.append((d, t)))
    assert os.path.isdir(dest_dir)
    assert calls and calls[-1][0] == calls[-1][1] > 0

    row = sf_packs.register_soundfont_pack(db, "sf2-test-bank", "Test Bank", url)
    assert row.id == "sf2-test-bank"
    assert row.format == "soundfont"
    assert row.bytes > 0
    assert sf_packs.is_soundfont_pack_installed(db, "sf2-test-bank") is True

    # Re-registering overwrites instead of duplicating.
    sf_packs.register_soundfont_pack(db, "sf2-test-bank", "Test Bank", url)
    assert db.query(InstrumentPack).filter_by(id="sf2-test-bank").count() == 1

    assert sf_packs.delete_soundfont_pack(db, "sf2-test-bank") is True
    assert sf_packs.is_soundfont_pack_installed(db, "sf2-test-bank") is False
    assert not os.path.isdir(dest_dir)
    assert sf_packs.delete_soundfont_pack(db, "sf2-test-bank") is False


def test_rejects_non_soundfont(workdir):
    url = (workdir / "notes.txt").as_uri()
    with pytest.raises(RuntimeError, match="not a SoundFont"):
        sf_packs.download_soundfont_pack("sf2-test-bad", url, "Bad")


def test_rejects_non_http_url():
    with pytest.raises(RuntimeError, match="non-HTTP"):
        sf_packs.download_soundfont_pack("sf2-test-bad", "ftp://example.com/x.sf2", "Bad")


def test_missing_pack_is_not_installed(db):
    assert sf_packs.is_soundfont_pack_installed(db, "sf2-nope") is False
