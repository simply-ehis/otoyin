"""Tests for cloud models route."""

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


def test_cloud_status_requires_subscription_key(client):
    r = client.get("/cloud/status")
    assert r.status_code in (401, 503)


def test_cloud_status_with_key(client):
    r = client.get("/cloud/status", headers={"X-Subscription-Key": "test-key"})
    assert r.status_code in (200, 403, 503)
    if r.status_code == 200:
        data = r.json()
        assert "router_configured" in data
        assert "tiers" in data


def test_cloud_llm_requires_key(client):
    r = client.post("/cloud/llm", json={"messages": [{"role": "user", "content": "hi"}]})
    assert r.status_code in (401, 503)


def test_cloud_tts_requires_key(client):
    r = client.post("/cloud/tts", json={"text": "hello"})
    assert r.status_code in (401, 503)
