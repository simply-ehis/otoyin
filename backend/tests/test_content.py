"""Tests for the in-app content layer (what's new, announcements, offers).

Content is bundled offline in ``backend/data/content.json`` and loaded by
``backend.services.announcements``. These tests pin the endpoint shapes and
confirm the bundled file is valid and in sync with the in-code fallback.
"""

import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routes.content import router as content_router
from backend.services import announcements as announcements_service

_BACKEND_ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(content_router)
    return TestClient(app)


class TestContentEndpoints:
    def test_whats_new_returns_launch_entry(self, client):
        resp = client.get("/content/whats-new")
        assert resp.status_code == 200
        entries = resp.json()["entries"]
        assert isinstance(entries, list) and entries
        assert entries[0]["version"] == "1.0.0"
        assert any("offline" in h.lower() for h in entries[0]["highlights"])

    def test_announcements_include_launch_promo(self, client):
        resp = client.get("/content/announcements")
        assert resp.status_code == 200
        items = resp.json()["announcements"]
        ids = {a["id"] for a in items}
        assert {"offline-promise", "launch-week"} <= ids

    def test_offers_include_launch_discount(self, client):
        resp = client.get("/content/offers")
        assert resp.status_code == 200
        offers = resp.json()["offers"]
        assert any(o.get("code") == "LAUNCH20" for o in offers)


class TestContentFile:
    def test_content_json_is_valid_and_in_sync_with_fallback(self):
        path = _BACKEND_ROOT / "data" / "content.json"
        with path.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        assert set(data) == {"whats_new", "announcements", "offers"}
        assert data["whats_new"][0]["version"] == "1.0.0"
        # The bundled file is the source of truth; the fallback must match it so
        # a frozen binary without the file still serves identical content.
        assert data == announcements_service._DEFAULT_CONTENT
