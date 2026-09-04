"""Tests for the catalog ``local_status`` annotation (06 report §3).

Hermetic: uses a temp-file SQLite DB (same pattern as test_model_gate.py);
no real models, torch, or network required.
"""

from __future__ import annotations

import os
import tempfile


def _make_session_factory():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from backend.database.models import Base, ModelDownload

    fd, path = tempfile.mkstemp(suffix=".status_test.db")
    os.close(fd)
    eng = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(
        eng, tables=[ModelDownload.__table__], checkfirst=True
    )
    return sessionmaker(bind=eng)


def test_not_downloaded_when_no_manifest():
    """No DB / no manifest row -> not_downloaded (safe direction)."""
    from backend.services.model_registry import local_status_for

    assert local_status_for("kokoro-onnx") == "not_downloaded"
    assert local_status_for("whisper-large-v3-turbo") == "not_downloaded"


def test_cached_when_manifest_row_exists(monkeypatch):
    """A real manifest row (seeded via record_download) -> cached."""
    import backend.services.model_registry as mr

    sess = _make_session_factory()
    monkeypatch.setattr(mr, "SessionLocal", sess)

    from backend.backends import get_model_config

    cfg = get_model_config("kokoro-onnx")
    assert cfg is not None, "kokoro-onnx must resolve to a model config"
    mr.record_download(
        sess(),
        cfg.model_name,
        cfg.model_size,
        cfg.engine,
        None,
        None,
    )
    assert mr.local_status_for("kokoro-onnx") == "cached"


def test_no_config_product_is_cached(monkeypatch):
    """Products with no model config ship with the app -> cached."""
    import backend.backends as backends
    import backend.services.model_registry as mr

    monkeypatch.setattr(backends, "get_model_config", lambda name: None)
    assert mr.local_status_for("future-non-model-product") == "cached"


def test_db_failure_falls_back_safe(monkeypatch):
    """Any DB error falls back to not_downloaded, never a wrong 'cached'."""
    import backend.services.model_registry as mr

    def _boom(*_args, **_kwargs):
        raise RuntimeError("db not initialized")

    monkeypatch.setattr(mr, "is_downloaded", _boom)
    assert mr.local_status_for("kokoro-onnx") == "not_downloaded"


def test_size_resolution_uses_config(monkeypatch):
    """Without an explicit size, the helper resolves it from the config so
    sized manifest rows match (bare is_downloaded(name, None) would miss)."""
    import backend.services.model_registry as mr

    sess = _make_session_factory()
    monkeypatch.setattr(mr, "SessionLocal", sess)

    from backend.backends import get_model_config

    cfg = get_model_config("whisper-large-v3-turbo")
    assert cfg is not None and cfg.model_size is not None
    mr.record_download(
        sess(),
        cfg.model_name,
        cfg.model_size,
        cfg.engine,
        None,
        None,
    )
    assert mr.local_status_for("whisper-large-v3-turbo") == "cached"


def test_catalog_annotation_covers_every_product():
    """Every product gets a valid local_status; signature verifies before
    the annotation is applied (response-only enrichment)."""
    from backend.routes.marketplace import _annotate_local_status
    from backend.services.marketplace_catalog import build_catalog, verify_catalog

    catalog = build_catalog()
    assert verify_catalog(catalog), "catalog must self-verify before annotation"
    products = catalog.get("products", [])
    assert len(products) > 0

    _annotate_local_status(products)
    for product in products:
        assert product.get("local_status") in (
            "cached",
            "not_downloaded",
        ), product.get("id")
