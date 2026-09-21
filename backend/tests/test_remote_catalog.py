"""Tests for the remote signed-catalog fetch (07 Part B).

Hermetic: the marketplace service's HTTP response is faked with
monkeypatched ``urllib``; signatures are produced with the dev keypair that
the client's embedded public key verifies against. No network, no DB.
"""

from __future__ import annotations

import json
import time

import pytest


class _FakeResp:
    """Minimal urllib response: bytes payload, context-manager, .read()."""

    def __init__(self, data: bytes):
        self._data = data

    def read(self) -> bytes:
        return self._data

    def __enter__(self) -> _FakeResp:
        return self

    def __exit__(self, *exc) -> bool:
        return False


@pytest.fixture
def mc(monkeypatch):
    """marketplace_catalog module with PRODUCTS/_PRODUCT_INDEX snapshotted."""
    import backend.services.marketplace_catalog as mod

    products_snapshot = list(mod.PRODUCTS)
    index_snapshot = dict(mod._PRODUCT_INDEX)
    yield mod
    mod.PRODUCTS[:] = products_snapshot
    mod._PRODUCT_INDEX = index_snapshot
    mod._LAST_REMOTE_REFRESH = 0.0
    mod._REFRESHING = False


def _remote_products() -> list[dict]:
    """A remote-shaped product list (ProductOut-style extra fields)."""
    return [
        {
            "id": "remote-engine-alpha",
            "name": "Remote Engine Alpha",
            "category": "tts",
            "description": "Fetched from the remote catalog",
            "long_description": "Fetched from the remote catalog",
            "price_usd": 19.0,
            "paid": True,
            "avg_rating": 4.7,
            "review_count": 3,
            "size_mb": 250,
            "languages": ["en", "fr"],
            "license": "custom",
            "use_cases": ["podcast", "audiobook"],
            "note": "remote-only product",
            "special_offer": False,
            "offer_discount_pct": 0,
            "baseline_usd": 0.0,
        }
    ]


def _signed_catalog(products: list[dict]) -> dict:
    """Sign a remote-shaped catalog with the dev keypair (matches the
    client's embedded dev public key)."""
    from backend.services import licensing

    payload = {
        "schema_version": 1,
        "signed_at": "2026-09-03T00:00:00+00:00",
        "currency": "usd",
        "products": products,
    }
    return licensing.sign_license(payload)


def test_remote_shaped_catalog_verifies(mc):
    """The remote response shape verifies against the embedded public key."""
    catalog = _signed_catalog(_remote_products())
    assert mc.verify_catalog(catalog) is True
    # Tampering with any product breaks the signature (downgrade protection).
    tampered = json.loads(json.dumps(catalog))
    tampered["products"][0]["price_usd"] = 1.0
    assert mc.verify_catalog(tampered) is False


def test_refresh_swaps_products_on_success(mc, monkeypatch):
    """A valid signed remote catalog replaces the bundled PRODUCTS."""
    monkeypatch.setattr(mc, "REMOTE_CATALOG_URL", "https://marketplace.test/v1/catalog")
    # The SSRF gate would reject the fake host — these tests fake urlopen,
    # so bypass the gate to exercise the fetch/verify/swap path for real.
    monkeypatch.setattr("backend.utils.ssrf.is_url_safe", lambda *a, **k: True)
    payload = json.dumps(_signed_catalog(_remote_products())).encode()
    monkeypatch.setattr(mc.urllib.request, "urlopen", lambda *a, **k: _FakeResp(payload))

    assert mc.refresh_remote_catalog() == "refreshed"
    assert [p["id"] for p in mc.PRODUCTS] == ["remote-engine-alpha"]
    assert mc.get_product("remote-engine-alpha")["name"] == "Remote Engine Alpha"
    assert mc.get_product("kokoro-onnx") is None  # bundled ids are gone


def test_refresh_keeps_bundled_on_network_failure(mc, monkeypatch):
    """Offline-first: any fetch failure leaves the bundled catalog intact."""
    bundled_ids = [p["id"] for p in mc.PRODUCTS]
    monkeypatch.setattr(mc, "REMOTE_CATALOG_URL", "https://marketplace.test/v1/catalog")
    monkeypatch.setattr("backend.utils.ssrf.is_url_safe", lambda *a, **k: True)

    def _boom(*a, **k):
        raise OSError("no network")

    monkeypatch.setattr(mc.urllib.request, "urlopen", _boom)

    assert mc.refresh_remote_catalog() == "failed"
    assert [p["id"] for p in mc.PRODUCTS] == bundled_ids


def test_refresh_rejects_bad_signature(mc, monkeypatch):
    """A catalog that fails signature verification is never swapped in."""
    bundled_ids = [p["id"] for p in mc.PRODUCTS]
    monkeypatch.setattr(mc, "REMOTE_CATALOG_URL", "https://marketplace.test/v1/catalog")
    monkeypatch.setattr("backend.utils.ssrf.is_url_safe", lambda *a, **k: True)

    unsigned = {
        "schema_version": 1,
        "signed_at": "2026-09-03T00:00:00+00:00",
        "currency": "usd",
        "products": _remote_products(),
        "sig": "ed25519:AAAA",  # garbage signature
    }
    monkeypatch.setattr(
        mc.urllib.request,
        "urlopen",
        lambda *a, **k: _FakeResp(json.dumps(unsigned).encode()),
    )

    assert mc.refresh_remote_catalog() == "failed"
    assert [p["id"] for p in mc.PRODUCTS] == bundled_ids


def test_refresh_disabled_when_url_unset(mc, monkeypatch):
    """No configured URL: refresh is a no-op and never touches the network."""
    monkeypatch.setattr(mc, "REMOTE_CATALOG_URL", "")

    def _should_not_be_called(*a, **k):
        raise AssertionError("urlopen must not be called when URL is unset")

    monkeypatch.setattr(mc.urllib.request, "urlopen", _should_not_be_called)

    assert mc.refresh_remote_catalog() == "no_url"


def test_remote_catalog_stale(mc, monkeypatch):
    """Staleness: true before any refresh, false right after a success."""
    monkeypatch.setattr(mc, "REMOTE_CATALOG_URL", "https://marketplace.test/v1/catalog")
    monkeypatch.setattr("backend.utils.ssrf.is_url_safe", lambda *a, **k: True)
    assert mc.remote_catalog_stale(age_s=1) is True  # never refreshed

    payload = json.dumps(_signed_catalog(_remote_products())).encode()
    monkeypatch.setattr(mc.urllib.request, "urlopen", lambda *a, **k: _FakeResp(payload))
    assert mc.refresh_remote_catalog() == "refreshed"
    assert mc.remote_catalog_stale(age_s=3600) is False  # just refreshed


def test_refresh_if_stale_is_a_noop_when_fresh(mc, monkeypatch):
    """Stale-gated poll: a recently refreshed catalog is not re-fetched."""
    monkeypatch.setattr(mc, "REMOTE_CATALOG_URL", "https://marketplace.test/v1/catalog")
    monkeypatch.setattr(mc, "_LAST_REMOTE_REFRESH", time.monotonic())
    calls: list[int] = []
    monkeypatch.setattr(mc, "refresh_remote_catalog", lambda: calls.append(1) or "refreshed")

    assert mc.refresh_remote_catalog_if_stale() == "fresh"
    assert calls == []  # no fetch when fresh


def test_refresh_if_stale_fetches_when_stale(mc, monkeypatch):
    """Stale-gated poll: an expired refresh is retried on the next tick."""
    monkeypatch.setattr(mc, "REMOTE_CATALOG_URL", "https://marketplace.test/v1/catalog")
    # Backdate by ~28h (> default 24h threshold) — deterministic regardless of
    # host uptime, since time.monotonic() is boot-relative.
    monkeypatch.setattr(mc, "_LAST_REMOTE_REFRESH", time.monotonic() - 100_000)
    calls: list[int] = []
    monkeypatch.setattr(mc, "refresh_remote_catalog", lambda: calls.append(1) or "refreshed")

    assert mc.refresh_remote_catalog_if_stale() == "refreshed"
    assert calls == [1]


def test_refresh_if_stale_noop_when_url_unset(mc, monkeypatch):
    """No configured URL: the poll wrapper is a network-free no-op."""
    monkeypatch.setattr(mc, "REMOTE_CATALOG_URL", "")
    calls: list[int] = []
    monkeypatch.setattr(mc, "refresh_remote_catalog", lambda: calls.append(1) or "refreshed")

    assert mc.refresh_remote_catalog_if_stale() == "fresh"
    assert calls == []


def test_refresh_if_stale_force_bypasses_freshness(mc, monkeypatch):
    """Manual check: force=True fetches even when the catalog is fresh."""
    monkeypatch.setattr(mc, "REMOTE_CATALOG_URL", "https://marketplace.test/v1/catalog")
    monkeypatch.setattr(mc, "_LAST_REMOTE_REFRESH", time.monotonic())
    calls: list[int] = []
    monkeypatch.setattr(mc, "refresh_remote_catalog", lambda: calls.append(1) or "refreshed")

    assert mc.refresh_remote_catalog_if_stale(force=True) == "refreshed"
    assert calls == [1]


def test_refresh_if_stale_force_noop_when_url_unset(mc, monkeypatch):
    """Manual check without a configured URL stays offline (no network)."""
    monkeypatch.setattr(mc, "REMOTE_CATALOG_URL", "")

    def _should_not_be_called(*a, **k):
        raise AssertionError("urlopen must not be called when URL is unset")

    monkeypatch.setattr(mc.urllib.request, "urlopen", _should_not_be_called)

    assert mc.refresh_remote_catalog_if_stale(force=True) == "no_url"


class TestCatalogRefreshRoute:
    """POST /marketplace/catalog/refresh — the Store-open nudge."""

    @pytest.fixture
    def client(self):
        from fastapi import FastAPI
        from fastapi.testclient import TestClient

        from backend.routes.marketplace import router

        app = FastAPI()
        app.include_router(router)
        return TestClient(app)

    def test_refresh_route_returns_refreshed_when_stale(self, client, mc, monkeypatch):
        """Stale (backdated >24h): the route performs the swap and reports it."""
        monkeypatch.setattr(mc, "REMOTE_CATALOG_URL", "https://marketplace.test/v1/catalog")
        monkeypatch.setattr(mc, "_LAST_REMOTE_REFRESH", time.monotonic() - 100_000)
        calls: list[int] = []
        monkeypatch.setattr(mc, "refresh_remote_catalog", lambda: calls.append(1) or "refreshed")

        resp = client.post("/marketplace/catalog/refresh")
        assert resp.status_code == 200
        assert resp.json() == {"refreshed": True, "reason": None}
        assert calls == [1]

    def test_refresh_route_is_noop_when_fresh(self, client, mc, monkeypatch):
        """Fresh: the route returns without any fetch (cheap on every open)."""
        monkeypatch.setattr(mc, "REMOTE_CATALOG_URL", "https://marketplace.test/v1/catalog")
        monkeypatch.setattr(mc, "_LAST_REMOTE_REFRESH", time.monotonic())
        calls: list[int] = []
        monkeypatch.setattr(mc, "refresh_remote_catalog", lambda: calls.append(1) or "refreshed")

        resp = client.post("/marketplace/catalog/refresh")
        assert resp.status_code == 200
        assert resp.json() == {"refreshed": False, "reason": "fresh"}
        assert calls == []

    def test_refresh_route_noop_when_url_unset(self, client, mc, monkeypatch):
        """No configured URL: the nudge never touches the network."""
        monkeypatch.setattr(mc, "REMOTE_CATALOG_URL", "")
        calls: list[int] = []
        monkeypatch.setattr(mc, "refresh_remote_catalog", lambda: calls.append(1) or "refreshed")

        resp = client.post("/marketplace/catalog/refresh")
        assert resp.status_code == 200
        assert resp.json() == {"refreshed": False, "reason": "fresh"}
        assert calls == []

    def test_refresh_route_force_fetches_when_fresh(self, client, mc, monkeypatch):
        """force=true bypasses the stale gate (manual Check for updates)."""
        monkeypatch.setattr(mc, "REMOTE_CATALOG_URL", "https://marketplace.test/v1/catalog")
        monkeypatch.setattr(mc, "_LAST_REMOTE_REFRESH", time.monotonic())
        calls: list[int] = []
        monkeypatch.setattr(mc, "refresh_remote_catalog", lambda: calls.append(1) or "refreshed")

        resp = client.post("/marketplace/catalog/refresh?force=true")
        assert resp.status_code == 200
        assert resp.json() == {"refreshed": True, "reason": None}
        assert calls == [1]

    def test_refresh_route_without_force_still_gated(self, client, mc, monkeypatch):
        """Default (no force) keeps the cheap stale-gated behavior."""
        monkeypatch.setattr(mc, "REMOTE_CATALOG_URL", "https://marketplace.test/v1/catalog")
        monkeypatch.setattr(mc, "_LAST_REMOTE_REFRESH", time.monotonic())
        calls: list[int] = []
        monkeypatch.setattr(mc, "refresh_remote_catalog", lambda: calls.append(1) or "refreshed")

        resp = client.post("/marketplace/catalog/refresh")
        assert resp.status_code == 200
        assert resp.json() == {"refreshed": False, "reason": "fresh"}
        assert calls == []

    def test_refresh_route_reports_fetch_failure(self, client, mc, monkeypatch):
        """A failed fetch surfaces as reason="failed" so the Store can hint."""
        monkeypatch.setattr(mc, "REMOTE_CATALOG_URL", "https://marketplace.test/v1/catalog")
        monkeypatch.setattr(mc, "_LAST_REMOTE_REFRESH", time.monotonic() - 100_000)
        calls: list[int] = []
        monkeypatch.setattr(mc, "refresh_remote_catalog", lambda: calls.append(1) or "failed")

        resp = client.post("/marketplace/catalog/refresh")
        assert resp.status_code == 200
        assert resp.json() == {"refreshed": False, "reason": "failed"}
        assert calls == [1]
