"""Tests for the telemetry routes."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routes.telemetry import router as telemetry_router


@pytest.fixture
def client():
    app = FastAPI()
    app.include_router(telemetry_router)
    return TestClient(app)


class TestTelemetryEndpoints:
    def test_telemetry_status_returns_bool(self, client):
        resp = client.get("/telemetry/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "enabled" in data
        assert isinstance(data["enabled"], bool)

    def test_telemetry_toggle_returns_new_state(self, client):
        # Toggle on
        resp = client.post("/telemetry/toggle", json={"enabled": True})
        assert resp.status_code == 200
        data = resp.json()
        assert data["enabled"] is True
        assert "message" in data

        # Toggle off
        resp = client.post("/telemetry/toggle", json={"enabled": False})
        assert resp.status_code == 200
        data = resp.json()
        assert data["enabled"] is False

    def test_telemetry_summary_403_when_disabled(self, client):
        # Ensure telemetry is disabled
        client.post("/telemetry/toggle", json={"enabled": False})
        resp = client.get("/telemetry/summary")
        assert resp.status_code == 403

    def test_telemetry_events_403_when_disabled(self, client):
        client.post("/telemetry/toggle", json={"enabled": False})
        resp = client.get("/telemetry/events")
        assert resp.status_code == 403

    def test_telemetry_timeline_403_when_disabled(self, client):
        client.post("/telemetry/toggle", json={"enabled": False})
        resp = client.get("/telemetry/timeline")
        assert resp.status_code == 403

    def test_telemetry_endpoints_require_enabled_flag(self, client):
        # All endpoints except /status and /toggle should 403 when disabled
        client.post("/telemetry/toggle", json={"enabled": False})
        for endpoint in ["/telemetry/events", "/telemetry/summary", "/telemetry/timeline"]:
            resp = client.get(endpoint)
            assert resp.status_code == 403, f"{endpoint} should return 403 when disabled"
