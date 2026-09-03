"""Tests for the startup readiness middleware and /health/ready endpoint."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import backend.app as _app_mod
from backend.app import (
    _init_ready_event,
    _is_ready,
    _signal_ready,
)


@pytest.fixture(autouse=True)
def _reset_ready_event():
    """Reset the readiness event between tests."""
    _app_mod._ready_event = None
    yield
    _app_mod._ready_event = None


class TestReadinessEvent:
    """Unit tests for the readiness event lifecycle."""

    def test_init_creates_event(self):
        _init_ready_event()
        assert _app_mod._ready_event is not None
        assert not _is_ready()

    def test_signal_ready_sets_event(self):
        _init_ready_event()
        _signal_ready()
        assert _is_ready()

    def test_signal_ready_noop_without_init(self):
        # Should not crash if called before init
        _signal_ready()
        assert not _is_ready()

    def test_signal_ready_idempotent(self):
        _init_ready_event()
        _signal_ready()
        _signal_ready()  # second call should not crash
        assert _is_ready()


class TestReadinessMiddlewareBehavior:
    """Integration tests using a minimal FastAPI app with the readiness middleware."""

    def _make_app(self):
        """Create a minimal app with the readiness middleware for testing."""
        import starlette.middleware.base
        import starlette.responses

        from backend import app as app_mod

        application = FastAPI()

        _HEALTH_PATHS = ("/health", "/health/filesystem")

        class ReadinessMiddleware(starlette.middleware.base.BaseHTTPMiddleware):
            async def dispatch(self, request, call_next):
                path = request.url.path
                if any(path == hp or path.startswith(hp + "/") for hp in _HEALTH_PATHS):
                    return await call_next(request)
                if path in ("/docs", "/redoc", "/openapi.json"):
                    return await call_next(request)
                if not app_mod._is_ready():
                    return starlette.responses.JSONResponse(
                        status_code=503,
                        content={"detail": "Server is initializing"},
                        headers={"Retry-After": "2"},
                    )
                return await call_next(request)

        application.add_middleware(ReadinessMiddleware)

        @application.get("/api/test")
        async def test_route():
            return {"ok": True}

        @application.get("/health")
        async def health():
            return {"status": "healthy"}

        @application.get("/health/filesystem")
        async def fs_health():
            return {"healthy": True}

        return application

    def test_non_health_returns_503_when_not_ready(self):
        _init_ready_event()
        app = self._make_app()
        client = TestClient(app, raise_server_exceptions=False)

        resp = client.get("/api/test")
        assert resp.status_code == 503
        assert resp.json()["detail"] == "Server is initializing"
        assert resp.headers.get("retry-after") == "2"

    def test_non_health_returns_200_when_ready(self):
        _init_ready_event()
        _signal_ready()
        app = self._make_app()
        client = TestClient(app, raise_server_exceptions=False)

        resp = client.get("/api/test")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_health_always_200_when_not_ready(self):
        _init_ready_event()
        app = self._make_app()
        client = TestClient(app, raise_server_exceptions=False)

        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "healthy"

    def test_health_filesystem_always_200_when_not_ready(self):
        _init_ready_event()
        app = self._make_app()
        client = TestClient(app, raise_server_exceptions=False)

        resp = client.get("/health/filesystem")
        assert resp.status_code == 200
        assert resp.json()["healthy"] is True

    def test_docs_always_200_when_not_ready(self):
        _init_ready_event()
        app = self._make_app()
        client = TestClient(app, raise_server_exceptions=False)

        resp = client.get("/docs")
        # docs returns HTML
        assert resp.status_code == 200

    def test_becomes_available_after_signal(self):
        _init_ready_event()
        app = self._make_app()
        client = TestClient(app, raise_server_exceptions=False)

        # Initially 503
        resp = client.get("/api/test")
        assert resp.status_code == 503

        # Signal ready
        _signal_ready()

        # Now 200
        resp = client.get("/api/test")
        assert resp.status_code == 200

    def test_openapi_always_200_when_not_ready(self):
        _init_ready_event()
        app = self._make_app()
        client = TestClient(app, raise_server_exceptions=False)

        resp = client.get("/openapi.json")
        assert resp.status_code == 200


class TestHealthReadyEndpoint:
    """Test the /health/ready endpoint."""

    def test_returns_503_when_not_ready(self):
        _init_ready_event()
        # Use the real app's health endpoint
        from backend.app import app

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/health/ready")
        assert resp.status_code == 200  # endpoint itself returns 200
        body = resp.json()
        assert body["ready"] is False
        assert body["status"] == "initializing"

    def test_returns_ready_when_signaled(self):
        _init_ready_event()
        _signal_ready()
        from backend.app import app

        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/health/ready")
        assert resp.status_code == 200
        body = resp.json()
        assert body["ready"] is True
        assert body["status"] == "ok"
