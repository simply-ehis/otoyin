"""Unit tests for the cloud-subscription gate (fail closed).

These never boot the app; the gate is a pure function of env + HTTP, so each
branch is pinned directly. The pre-existing app-level tests in
test_cloud_models.py cover the wired behavior with no env configured (503).
"""

import asyncio

import pytest
from fastapi import HTTPException

from backend.routes import cloud_models


@pytest.fixture(autouse=True)
def isolated_gate(monkeypatch):
    for name in (
        "CLOUD_ROUTER_URL",
        "CLOUD_ROUTER_API_KEY",
        "CLOUD_SUBSCRIPTION_KEY",
        "CLOUD_ALLOWED_KEYS",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(cloud_models, "ROUTER_URL", "")
    monkeypatch.setattr(cloud_models, "ROUTER_KEY", "")
    monkeypatch.setattr(cloud_models, "DEV_SUBSCRIPTION_KEY", "")
    monkeypatch.setattr(cloud_models, "ALLOWED_KEYS", [])
    cloud_models._VALIDATION_CACHE.clear()
    yield
    cloud_models._VALIDATION_CACHE.clear()


def gate(key):
    return asyncio.run(cloud_models.require_subscription(x_subscription_key=key))


def test_missing_key_is_401():
    with pytest.raises(HTTPException) as exc:
        gate(None)
    assert exc.value.status_code == 401


def test_dev_key_is_explicit_escape_hatch(monkeypatch):
    monkeypatch.setattr(cloud_models, "DEV_SUBSCRIPTION_KEY", "devkey")
    assert gate("devkey") == "devkey"


def test_allowlist_accepts_and_rejects(monkeypatch):
    monkeypatch.setattr(cloud_models, "ALLOWED_KEYS", ["good-key"])
    assert gate("good-key") == "good-key"
    with pytest.raises(HTTPException) as exc:
        gate("bad-key")
    assert exc.value.status_code == 403


def test_router_unreachable_means_503_not_accept(monkeypatch):
    monkeypatch.setattr(cloud_models, "ROUTER_URL", "http://127.0.0.1:9/down")
    with pytest.raises(HTTPException) as exc:
        gate("any-key")
    assert exc.value.status_code == 503


def test_no_router_configured_means_503(monkeypatch):
    # Nothing set at all: deny rather than accept (the pre-fix behavior).
    with pytest.raises(HTTPException) as exc:
        gate("any-key")
    assert exc.value.status_code == 503


def test_router_403_means_invalid_key(monkeypatch):
    class _Resp:
        status_code = 403

    class _Client:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, *a, **k):
            return _Resp()

    monkeypatch.setattr(cloud_models, "ROUTER_URL", "https://router.example")
    monkeypatch.setattr(cloud_models.httpx, "AsyncClient", _Client)
    with pytest.raises(HTTPException) as exc:
        gate("any-key")
    assert exc.value.status_code == 403


def test_router_200_means_valid_and_cached(monkeypatch):
    class _Resp:
        status_code = 200

    calls = 0

    class _Client:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def get(self, *a, **k):
            nonlocal calls
            calls += 1
            return _Resp()

    monkeypatch.setattr(cloud_models, "ROUTER_URL", "https://router.example")
    monkeypatch.setattr(cloud_models.httpx, "AsyncClient", _Client)
    assert gate("good-key") == "good-key"
    assert gate("good-key") == "good-key"  # cached, no second HTTP call
    assert calls == 1
