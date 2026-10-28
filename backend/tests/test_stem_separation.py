"""Tests for stem separation route."""

import time

import pytest
from fastapi.testclient import TestClient

from backend.app import create_app


@pytest.fixture
def client():
    app = create_app()
    c = TestClient(app)
    for _ in range(120):
        r = c.get("/health/ready")
        if r.status_code == 200 and r.json().get("ready"):
            break
        time.sleep(1)
    return c


def test_stem_status_returns_demucs_flag(client):
    r = client.get("/stems/status")
    assert r.status_code in (200, 503)
    if r.status_code == 200:
        data = r.json()
        assert "onnx_available" in data
        assert "model_cached" in data
        assert "stems" in data
        assert "vocals" in data["stems"]


def test_stem_separate_requires_file(client):
    r = client.post("/stems/separate")
    assert r.status_code in (400, 422, 503)
