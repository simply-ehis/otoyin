"""Basic marketplace server tests."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from marketplace_server.app import app
from marketplace_server.models import init_db


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


async def test_catalog_empty(client):
    resp = await client.get("/v1/catalog")
    assert resp.status_code == 200
    data = resp.json()
    assert data["schema_version"] == 1
    assert data["currency"] == "usd"
    assert isinstance(data["products"], list)
    assert "sig" in data


async def test_checkout_free_product(client):
    resp = await client.post(
        "/v1/checkout",
        json={"product_id": "nonexistent", "device_id": "test", "email": "test@example.com"},
    )
    assert resp.status_code == 404
