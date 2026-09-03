"""Tests for BYOK model-provider storage (service layer + secret encryption)."""

import contextlib
import os
import tempfile

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database.models import Base, ModelProvider
from backend.services import model_providers as svc
from backend.utils import secret_store


def _make_db():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.remove(path)
    engine = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    return Session(), path, engine


def _cleanup(db, engine, path):
    db.close()
    engine.dispose()
    with contextlib.suppress(OSError):
        os.remove(path)


def test_api_key_encrypted_at_rest():
    ct = secret_store.encrypt_secret("sk-secret-value")
    assert ct != "sk-secret-value"
    assert secret_store.decrypt_secret(ct) == "sk-secret-value"
    assert secret_store.decrypt_secret("") == ""


def test_provider_crud_roundtrip():
    db, path, engine = _make_db()
    try:
        created = svc.create_provider(
            db,
            domain="tts",
            name="My Cloud TTS",
            base_url="https://tts.example.com/v1",
            api_key="sk-test-123",
            model="big-tts-1",
            is_default=True,
        )
        assert created["id"]
        assert created["has_api_key"] is True
        assert "api_key" not in created  # never echoed in plaintext

        # ciphertext in DB is not the plaintext
        row = db.query(ModelProvider).filter(ModelProvider.id == created["id"]).first()
        assert row.encrypted_api_key != "sk-test-123"
        creds = svc.provider_credentials(row)
        assert creds["api_key"] == "sk-test-123"
        assert creds["base_url"] == "https://tts.example.com/v1"

        # default scoping
        assert svc.get_default_provider(db, "tts").id == created["id"]

        # update key
        updated = svc.update_provider(db, created["id"], {"api_key": "sk-rotated"})
        assert updated["has_api_key"] is True
        creds2 = svc.provider_credentials(db.query(ModelProvider).filter(ModelProvider.id == created["id"]).first())
        assert creds2["api_key"] == "sk-rotated"

        # list + delete
        assert any(p["id"] == created["id"] for p in svc.list_providers(db, domain="tts"))
        assert svc.delete_provider(db, created["id"]) is True
        assert svc.get_provider(db, created["id"]) is None
    finally:
        _cleanup(db, engine, path)


def test_only_one_default_per_domain():
    db, path, engine = _make_db()
    try:
        a = svc.create_provider(db, domain="sfx", name="A", base_url="https://a", is_default=True)
        b = svc.create_provider(db, domain="sfx", name="B", base_url="https://b", is_default=True)
        # b becomes default, a cleared
        assert svc.get_default_provider(db, "sfx").id == b["id"]
        a_row = db.query(ModelProvider).filter(ModelProvider.id == a["id"]).first()
        assert a_row.is_default is False
        svc.delete_provider(db, b["id"])
    finally:
        _cleanup(db, engine, path)
