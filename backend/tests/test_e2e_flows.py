"""End-to-end flows across real HTTP boundaries (no inference, no network).

- Story portability: seed → GET /stories/{id}/export → POST
  /stories/import → GET the copy (new IDs, same content).
- Buy → install: marketplace dev checkout → license fetch → backend
  license install → entitlements (keypairs wired so both sides agree,
  device bound to the REAL machine fingerprint — the production path).
- Crash loop: toggle on → report → list → clear.

Backend runs on a temp SQLite DB + temp data dir; marketplace uses its
dev SQLite file with per-test row cleanup (same pattern as its suite).
"""

from __future__ import annotations

import base64
import io
import json

# marketplace_server is a separate package (own pyproject); make it
# importable so this cross-service flow test can drive both apps.
import sys
import tempfile
import wave
import zipfile
from pathlib import Path

_MARKETPLACE_DIR = Path(__file__).resolve().parents[2] / "marketplace"
sys.path.insert(0, str(_MARKETPLACE_DIR))
_MARKETPLACE_AVAILABLE = (_MARKETPLACE_DIR / "marketplace_server").is_dir()


def _marketplace_missing() -> bool:
    return not _MARKETPLACE_AVAILABLE


import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete
from sqlalchemy.orm import sessionmaker

import backend.app as app_module
import backend.config as cfg
from backend.app import create_app
from backend.database import get_db
from backend.database.models import (
    Base,
    Generation as DBGeneration,
    GenerationVersion as DBGenerationVersion,
    ProfileSample as DBProfileSample,
    Story as DBStory,
    StoryItem as DBStoryItem,
    VoiceProfile as DBVoiceProfile,
)


def _wav(path: Path) -> Path:
    import numpy as np

    rate, n = 16000, 16000
    t = np.arange(n) / rate
    audio = (0.5 * np.sin(2 * np.pi * 440 * t) * 32767).astype("<i2")
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(audio.tobytes())
    return path


@pytest.fixture(autouse=True)
def _ready(monkeypatch):
    """Bypass the background-startup readiness gate (TestClient skips lifespan)."""
    monkeypatch.setattr(app_module, "_is_ready", lambda: True)


@pytest.fixture
def backend_client(tmp_path, monkeypatch):
    monkeypatch.setattr(cfg, "_data_dir", tmp_path / "data")
    fd, db_path = tempfile.mkstemp(suffix=".db")
    import os

    os.close(fd)
    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(bind=engine)

    app = create_app()

    def _override():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override
    client = TestClient(app, raise_server_exceptions=False)
    yield client, factory
    engine.dispose()
    Path(db_path).unlink(missing_ok=True)


def _seed_e2e_story(factory, data_dir: Path) -> str:
    db = factory()
    try:
        gens = data_dir / "generations"
        db.add(DBVoiceProfile(id="e2e-prof", name="E2E Ada", language="en", voice_type="cloned"))
        db.commit()
        sample = _wav(gens / "e2e-sample.wav")
        db.add(DBProfileSample(id="e2e-samp", profile_id="e2e-prof", audio_path=str(sample), reference_text="hi"))
        audio = _wav(data_dir / "generations" / "e2e-gen.wav")
        db.add(
            DBGeneration(
                id="e2e-gen",
                profile_id="e2e-prof",
                text="hello",
                language="en",
                audio_path=str(audio),
                duration=1.0,
                engine="kokoro",
            )
        )
        ver_audio = _wav(data_dir / "generations" / "e2e-ver.wav")
        db.add(
            DBGenerationVersion(
                id="e2e-ver", generation_id="e2e-gen", label="take", audio_path=str(ver_audio), is_default=True
            )
        )
        db.add(DBStory(id="e2e-story", name="E2E Trip", description="d"))
        db.add(
            DBStoryItem(
                id="e2e-item",
                story_id="e2e-story",
                generation_id="e2e-gen",
                version_id="e2e-ver",
                start_time_ms=0,
                track=0,
                volume=1.0,
            )
        )
        db.commit()
        return "e2e-story"
    finally:
        db.close()


class TestStoryPortabilityFlow:
    def test_export_then_import_roundtrip(self, backend_client, tmp_path):
        client, factory = backend_client
        data_dir = tmp_path / "data"
        story_id = _seed_e2e_story(factory, data_dir)

        exp = client.get(f"/stories/{story_id}/export")
        assert exp.status_code == 200, exp.text
        assert exp.headers["content-type"] == "application/zip"
        with zipfile.ZipFile(io.BytesIO(exp.content)) as zf:
            manifest = json.loads(zf.read("manifest.json"))
        assert manifest["story"]["name"] == "E2E Trip"
        assert len(manifest["items"]) == 1

        imp = client.post(
            "/stories/import",
            files={"file": ("story-e2e-trip.dstf.zip", exp.content, "application/zip")},
        )
        assert imp.status_code == 200, imp.text
        body = imp.json()
        assert body["id"] != story_id
        assert body["items"] == 1 and body["generations"] == 1

        detail = client.get(f"/stories/{body['id']}")
        assert detail.status_code == 200
        assert detail.json()["name"] == "E2E Trip"

    def test_export_missing_story_is_404(self, backend_client):
        client, _ = backend_client
        assert client.get("/stories/nope/export").status_code == 404

    def test_import_garbage_is_400(self, backend_client):
        client, _ = backend_client
        resp = client.post(
            "/stories/import",
            files={"file": ("x.zip", b"not a zip", "application/zip")},
        )
        assert resp.status_code == 400


def _wire_marketplace_keys(monkeypatch):
    """One keypair both sides agree on; marketplace signer reset to use it."""
    from marketplace_server import signing

    import backend.services.licensing as licensing

    private = Ed25519PrivateKey.generate()
    priv_b64 = base64.b64encode(
        private.private_bytes(
            serialization.Encoding.Raw,
            serialization.PrivateFormat.Raw,
            serialization.NoEncryption(),
        )
    ).decode()
    pub_b64 = base64.b64encode(
        private.public_key().public_bytes(
            serialization.Encoding.Raw,
            serialization.PublicFormat.Raw,
        )
    ).decode()
    monkeypatch.setattr(signing, "_signer", signing.LicenseSigner(priv_b64))
    monkeypatch.setattr(licensing, "MARKETPLACE_PUBLIC_KEY", pub_b64)


class TestBuyInstallFlow:
    @pytest.mark.skipif(_marketplace_missing(), reason="marketplace package not checked out")
    def test_dev_checkout_to_entitlement(self, backend_client, monkeypatch):
        from httpx import ASGITransport, AsyncClient
        from marketplace_server.app import app as mp_app
        from marketplace_server.config import settings as mp_settings
        from marketplace_server.models import (
            License as MPLicense,
            Order as MPOrder,
            Product as MPProduct,
            async_session,
            init_db,
        )

        _wire_marketplace_keys(monkeypatch)
        monkeypatch.setattr(mp_settings, "dodo_api_key", "")
        # Dev auto-fulfill requires debug mode (fail-closed otherwise —
        # MARKETPLACE_DEBUG=true, no keys).
        monkeypatch.setattr(mp_settings, "debug", True)

        import asyncio

        from backend.services import licensing

        # Production path: checkout carries the same machine fingerprint the
        # backend verifies at install time (what GET /marketplace/device-id
        # hands the frontend) — not the "*" wildcard.
        device_id = licensing.get_device_id()

        async def _flow():
            await init_db()
            async with async_session() as db:
                # Idempotent: a previous interrupted run may have left the row
                # behind in the file-backed marketplace DB (UNIQUE products.id).
                await db.execute(delete(MPProduct).where(MPProduct.id == "e2e-voice"))
                db.add(MPProduct(id="e2e-voice", name="E2E Voice", category="tts", price_usd=19.0, paid=True))
                await db.commit()
            transport = ASGITransport(app=mp_app)
            async with AsyncClient(transport=transport, base_url="http://test") as mp:
                co = await mp.post(
                    "/v1/checkout",
                    json={"product_id": "e2e-voice", "device_id": device_id, "email": ""},
                )
                assert co.status_code == 200, co.text
                order_ref = co.json()["order_ref"]
                lic = await mp.get(f"/v1/webhook/license/{order_ref}")
                assert lic.status_code == 200, lic.text
                signed = lic.json()
            async with async_session() as db:
                await db.execute(delete(MPLicense))
                await db.execute(delete(MPOrder))
                await db.execute(delete(MPProduct).where(MPProduct.id == "e2e-voice"))
                await db.commit()
            return signed

        signed = asyncio.run(_flow())
        assert signed["device_id"] == device_id

        client, _ = backend_client
        inst = client.post("/marketplace/license", json={"license": signed})
        assert inst.status_code == 200, inst.text
        ent = client.get("/marketplace/entitlements")
        assert ent.status_code == 200
        assert "models:e2e-voice" in ent.json()["entitlements"]


class TestDeviceIdEndpoint:
    @pytest.mark.skipif(_marketplace_missing(), reason="marketplace package not checked out")
    def test_device_id_matches_machine_fingerprint(self, backend_client):
        """GET /marketplace/device-id returns what licensing verifies against."""
        import re

        from backend.services import licensing

        client, _ = backend_client
        resp = client.get("/marketplace/device-id")
        assert resp.status_code == 200
        device_id = resp.json()["device_id"]
        assert device_id == licensing.get_device_id()
        assert re.fullmatch(r"[0-9a-f]{64}", device_id), device_id


class TestCrashLoopFlow:
    def test_toggle_report_list_clear(self, backend_client):
        client, _ = backend_client
        assert client.get("/crashes/status").json()["enabled"] is False
        assert client.post("/crashes/toggle", json={"enabled": True}).json()["enabled"] is True
        rep = client.post(
            "/crashes/report",
            json={"layer": "frontend", "kind": "Error", "message": "e2e boom buyer@example.com"},
        )
        assert rep.json()["stored"] is True
        events = client.get("/crashes/events").json()["reports"]
        assert len(events) == 1
        assert "buyer@example.com" not in events[0]["message"]
        assert client.delete("/crashes/events").json()["removed"] == 1
        assert client.get("/crashes/events").json()["reports"] == []
        assert client.post("/crashes/toggle", json={"enabled": False}).json()["enabled"] is False
