"""Crash ingest tests — open POST, truncation caps, admin-gated reads."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from marketplace_server.app import app
from marketplace_server.config import settings
from marketplace_server.models import CrashReport, async_session, init_db


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()
    yield
    async with async_session() as db:
        await db.execute(delete(CrashReport))
        await db.commit()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def _report(**over):
    base = {
        "id": "abc123",
        "layer": "frontend",
        "kind": "TypeError",
        "message": "x is undefined",
        "stack": "at f (a.js:1)",
        "context": {"route": "/voices"},
    }
    base.update(over)
    return {"report": base}


async def test_ingest_stores_report(client):
    resp = await client.post("/v1/crashes", json=_report())
    assert resp.status_code == 201, resp.text
    assert resp.json()["status"] == "ok"
    async with async_session() as db:
        rows = (await db.execute(select(CrashReport))).scalars().all()
        assert len(rows) == 1
        assert rows[0].kind == "TypeError" and rows[0].layer == "frontend"


async def test_ingest_coerces_unknown_layer(client):
    resp = await client.post("/v1/crashes", json=_report(layer="exploit"))
    assert resp.status_code == 201
    async with async_session() as db:
        row = (await db.execute(select(CrashReport))).scalars().first()
        assert row is not None and row.layer == "frontend"


async def test_ingest_truncates_oversize_fields(client):
    resp = await client.post("/v1/crashes", json=_report(message="m" * 5000, stack="s" * 50000))
    assert resp.status_code == 201
    async with async_session() as db:
        row = (await db.execute(select(CrashReport))).scalars().first()
        assert row is not None
        assert len(row.message) == 2000 and len(row.stack) == 20000


async def test_ingest_rejects_huge_payload(client):
    resp = await client.post("/v1/crashes", json=_report(stack="s" * 100000))
    assert resp.status_code == 413


async def test_admin_list_requires_key(client, monkeypatch):
    await client.post("/v1/crashes", json=_report())
    monkeypatch.setattr(settings, "admin_key", "secret-admin")
    denied = await client.get("/v1/crashes/admin")
    assert denied.status_code == 401
    denied2 = await client.get("/v1/crashes/admin", headers={"Authorization": "Bearer wrong"})
    assert denied2.status_code == 401
    ok = await client.get("/v1/crashes/admin", headers={"Authorization": "Bearer secret-admin"})
    assert ok.status_code == 200
    assert len(ok.json()["crashes"]) == 1
    assert ok.json()["crashes"][0]["message"] == "x is undefined"
