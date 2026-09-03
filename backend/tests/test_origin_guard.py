"""Tests for the OriginGuardMiddleware (drive-by CSRF protection).

A malicious webpage can send "simple" cross-site POSTs at 127.0.0.1 with
no CORS preflight. Browsers attach an Origin header on those; non-browser
clients (curl, MCP) do not. The guard must reject only requests that
carry a present-but-untrusted Origin, leaving every legitimate client
untouched.

Uses a minimal FastAPI app with the REAL middleware from
backend.utils.origin_guard — no heavy ML imports required.
"""

import pytest
from fastapi import FastAPI
from starlette.testclient import TestClient

from backend.utils.origin_guard import OriginGuardMiddleware

TRUSTED_ORIGINS = [
    "http://localhost:21132",
    "http://127.0.0.1:21132",
    "http://127.0.0.1:17493",
    "tauri://localhost",
    "https://tauri.localhost",
    "http://tauri.localhost",
]


def _build_app() -> FastAPI:
    """Minimal app: one mutating route + one read route behind the guard."""
    app = FastAPI()
    app.add_middleware(OriginGuardMiddleware, allowed_origins=TRUSTED_ORIGINS)

    @app.post("/shutdown")
    async def shutdown():
        return {"detail": "Shutting down"}

    @app.put("/things/1")
    async def put_thing():
        return {"ok": True}

    @app.delete("/things/1")
    async def delete_thing():
        return {"ok": True}

    @app.patch("/things/1")
    async def patch_thing():
        return {"ok": True}

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    return app


@pytest.fixture
def client():
    return TestClient(_build_app())


class TestOriginGuard:
    def test_cross_site_post_rejected(self, client):
        """The drive-by attack: foreign Origin on a bodiless POST -> 403."""
        r = client.post("/shutdown", headers={"Origin": "https://evil.example"})
        assert r.status_code == 403
        assert "untrusted origin" in r.json()["detail"]

    @pytest.mark.parametrize("method", ["put", "delete", "patch"])
    def test_all_unsafe_methods_guarded(self, client, method):
        r = getattr(client, method)("/things/1", headers={"Origin": "https://evil.example"})
        assert r.status_code == 403

    @pytest.mark.parametrize(
        "origin",
        [
            "http://localhost:21132",
            "tauri://localhost",
            "https://tauri.localhost",
            "http://tauri.localhost",
        ],
    )
    def test_trusted_origin_post_allowed(self, client, origin):
        r = client.get("/health", headers={"Origin": origin})  # sanity: trusted reads fine
        assert r.status_code == 200
        r = client.post("/shutdown", headers={"Origin": origin})
        assert r.status_code == 200

    def test_no_origin_post_allowed(self, client):
        """curl / MCP clients / Tauri IPC send no Origin header."""
        r = client.post("/shutdown")
        assert r.status_code == 200

    def test_get_with_foreign_origin_allowed(self, client):
        """Only mutating methods are guarded — GETs pass regardless."""
        r = client.get("/health", headers={"Origin": "https://evil.example"})
        assert r.status_code == 200

    def test_self_served_spa_origin_allowed(self, client):
        """The SPA served by FastAPI itself posts to its own origin."""
        r = client.post("/shutdown", headers={"Origin": "http://127.0.0.1:17493"})
        assert r.status_code == 200

    def test_origin_match_is_exact_not_prefix(self, client):
        """https://tauri.localhost.evil.example must NOT pass as tauri."""
        r = client.post("/shutdown", headers={"Origin": "https://tauri.localhost.evil.example"})
        assert r.status_code == 403
