"""Paddle Billing tests — signature verification + checkout/webhook flow.

Runs against a throwaway SQLite DB (dev mode: no provider account needed).
Async mode is set in marketplace/pyproject.toml (asyncio_mode = "auto").
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from marketplace_server import paddle
from marketplace_server.app import app
from marketplace_server.config import settings
from marketplace_server.models import License, Order, Product, async_session, init_db


def _sig_headers(raw: bytes, secret: str, ts: int | None = None) -> dict:
    ts = ts if ts is not None else int(time.time())
    digest = hmac.new(secret.encode(), f"{ts}:".encode() + raw, hashlib.sha256).hexdigest()
    return {"Paddle-Signature": f"ts={ts};h1={digest}"}


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()
    yield
    async with async_session() as db:
        await db.execute(delete(License))
        await db.execute(delete(Order))
        await db.execute(delete(Product).where(Product.id.like("test-%")))
        await db.commit()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def _seed_product(product_id: str = "test-voice", price: float = 19.0) -> None:
    async with async_session() as db:
        db.add(Product(id=product_id, name="Test Voice", category="tts", price_usd=price, paid=True))
        await db.commit()


# ── Signature verification ──────────────────────────────────────────


def test_verify_valid_signature():
    secret, raw = "whsec_test", b'{"event_type":"ping"}'
    old = settings.paddle_webhook_secret
    settings.paddle_webhook_secret = secret
    try:
        assert paddle.verify_signature(raw, _sig_headers(raw, secret)["Paddle-Signature"]) is True
    finally:
        settings.paddle_webhook_secret = old


def test_verify_rejects_tampered_body():
    old = settings.paddle_webhook_secret
    settings.paddle_webhook_secret = "whsec_test"
    try:
        raw = b'{"event_type":"transaction.completed"}'
        headers = _sig_headers(raw, "whsec_test")
        tampered = b'{"event_type":"transaction.completed","x":1}'
        assert paddle.verify_signature(tampered, headers["Paddle-Signature"]) is False
    finally:
        settings.paddle_webhook_secret = old


def test_verify_rejects_stale_timestamp():
    old = settings.paddle_webhook_secret
    settings.paddle_webhook_secret = "whsec_test"
    try:
        raw = b"{}"
        headers = _sig_headers(raw, "whsec_test", ts=int(time.time()) - 3600)
        assert paddle.verify_signature(raw, headers["Paddle-Signature"]) is False
    finally:
        settings.paddle_webhook_secret = old


def test_verify_accepts_rotation_second_h1():
    old = settings.paddle_webhook_secret
    settings.paddle_webhook_secret = "whsec_new"
    try:
        raw = b"{}"
        ts = int(time.time())
        stale = hmac.new(b"whsec_old", f"{ts}:".encode() + raw, hashlib.sha256).hexdigest()
        fresh = hmac.new(b"whsec_new", f"{ts}:".encode() + raw, hashlib.sha256).hexdigest()
        assert paddle.verify_signature(raw, f"ts={ts};h1={stale};h1={fresh}") is True
    finally:
        settings.paddle_webhook_secret = old


# ── Dev-mode checkout (no API key) ──────────────────────────────────


async def test_dev_checkout_fulfills_immediately(client, monkeypatch):
    monkeypatch.setattr(settings, "paddle_api_key", "")
    await _seed_product()
    resp = await client.post(
        "/v1/checkout",
        json={"product_id": "test-voice", "device_id": "dev-1", "email": "buyer@example.com"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["order_ref"].startswith("otoyin_")
    assert body["checkout_url"].startswith("otoyin://payment/success")

    lic = await client.get(f"/v1/webhook/license/{body['order_ref']}")
    assert lic.status_code == 200, lic.text
    assert lic.json()["product"] == "test-voice"


async def test_checkout_unknown_product(client, monkeypatch):
    monkeypatch.setattr(settings, "paddle_api_key", "")
    resp = await client.post("/v1/checkout", json={"product_id": "nope", "device_id": "d", "email": ""})
    assert resp.status_code == 404


async def test_checkout_missing_price_id_is_500(client, monkeypatch):
    monkeypatch.setattr(settings, "paddle_api_key", "live_key_but_no_prices")
    await _seed_product()
    resp = await client.post("/v1/checkout", json={"product_id": "test-voice", "device_id": "d", "email": ""})
    assert resp.status_code == 500
    assert resp.json()["detail"]["code"] == "price_not_configured"


# ── Webhook fulfill ─────────────────────────────────────────────────


async def test_webhook_fulfills_transaction_completed(client, monkeypatch):
    monkeypatch.setattr(settings, "paddle_api_key", "key")
    monkeypatch.setattr(settings, "paddle_webhook_secret", "whsec_test")
    await _seed_product()
    order_ref = f"otoyin_{uuid.uuid4().hex[:16]}"
    async with async_session() as db:
        db.add(
            Order(
                order_ref=order_ref,
                product_id="test-voice",
                device_id="dev-9",
                email="buyer@example.com",
                status="pending",
                amount_usd=19.0,
                payment_provider="paddle",
            )
        )
        await db.commit()

    payload = {
        "event_type": "transaction.completed",
        "data": {
            "id": "txn_test_123",
            "custom_data": {"order_ref": order_ref, "product_id": "test-voice", "device_id": "dev-9"},
        },
    }
    raw = json.dumps(payload).encode()
    resp = await client.post("/v1/webhook", content=raw, headers=_sig_headers(raw, "whsec_test"))
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "ok"

    lic = await client.get(f"/v1/webhook/license/{order_ref}")
    assert lic.status_code == 200
    assert lic.json()["device_id"] == "dev-9"


async def test_webhook_rejects_bad_signature(client, monkeypatch):
    monkeypatch.setattr(settings, "paddle_webhook_secret", "whsec_test")
    resp = await client.post("/v1/webhook", content=b"{}", headers={"Paddle-Signature": "ts=1;h1=deadbeef"})
    assert resp.status_code == 401


async def test_webhook_ignores_unknown_events(client, monkeypatch):
    monkeypatch.setattr(settings, "paddle_webhook_secret", "")
    resp = await client.post("/v1/webhook", content=json.dumps({"event_type": "ping", "data": {}}).encode())
    assert resp.status_code == 200
    assert resp.json()["status"] == "ignored"


async def test_refund_reached_via_transaction_id(client, monkeypatch):
    """adjustment.created without custom_data still revokes via transaction link."""
    monkeypatch.setattr(settings, "paddle_api_key", "key")
    monkeypatch.setattr(settings, "paddle_webhook_secret", "whsec_test")
    await _seed_product()
    order_ref = f"otoyin_{uuid.uuid4().hex[:16]}"
    async with async_session() as db:
        db.add(
            Order(
                order_ref=order_ref,
                product_id="test-voice",
                device_id="dev-9",
                status="paid",
                amount_usd=19.0,
                payment_provider="paddle",
                payment_session_id="txn_test_999",
            )
        )
        await db.commit()
    payload = {
        "event_type": "adjustment.created",
        "data": {"id": "adj_1", "action": "refund", "transaction_id": "txn_test_999"},
    }
    raw = json.dumps(payload).encode()
    resp = await client.post("/v1/webhook", content=raw, headers=_sig_headers(raw, "whsec_test"))
    assert resp.status_code == 200, resp.text
    lic = await client.get(f"/v1/webhook/license/{order_ref}")
    assert lic.status_code == 402


async def test_donate_dev_fulfills_without_license(client, monkeypatch):
    monkeypatch.setattr(settings, "paddle_api_key", "")
    resp = await client.post(
        "/v1/checkout/donate",
        json={"device_id": "dev-1", "email": "", "amount_usd": 25},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["donation"] is True
    assert body["amount_usd"] == 25.0
    assert body["order_ref"].startswith("otoyin_")

    lic = await client.get(f"/v1/webhook/license/{body['order_ref']}")
    assert lic.status_code == 200, lic.text
    assert lic.json()["donated"] is True
    # No license row minted for a donation.
    async with async_session() as db:
        from marketplace_server.models import License

        assert (await db.execute(select(License))).scalars().all() == []


async def test_donate_rejects_bad_amounts(client, monkeypatch):
    monkeypatch.setattr(settings, "paddle_api_key", "")
    for bad in (0, -5, 0.5, 10000.01):
        resp = await client.post(
            "/v1/checkout/donate",
            json={"device_id": "d", "email": "", "amount_usd": bad},
        )
        assert resp.status_code == 400, bad
        assert resp.json()["detail"]["code"] == "bad_amount"


async def test_donate_pending_is_402(client, monkeypatch):
    monkeypatch.setattr(settings, "paddle_api_key", "key")
    order_ref = f"otoyin_{uuid.uuid4().hex[:16]}"
    async with async_session() as db:
        db.add(
            Order(
                order_ref=order_ref,
                product_id="donation",
                device_id="d",
                status="pending",
                amount_usd=10.0,
                payment_provider="paddle",
            )
        )
        await db.commit()
    lic = await client.get(f"/v1/webhook/license/{order_ref}")
    assert lic.status_code == 402


async def test_webhook_fulfills_donation_without_license(client, monkeypatch):
    monkeypatch.setattr(settings, "paddle_api_key", "key")
    monkeypatch.setattr(settings, "paddle_webhook_secret", "whsec_test")
    order_ref = f"otoyin_{uuid.uuid4().hex[:16]}"
    async with async_session() as db:
        db.add(
            Order(
                order_ref=order_ref,
                product_id="donation",
                device_id="dev-2",
                status="pending",
                amount_usd=10.0,
                payment_provider="paddle",
            )
        )
        await db.commit()
    payload = {
        "event_type": "transaction.completed",
        "data": {
            "id": "txn_donate_1",
            "custom_data": {"order_ref": order_ref, "product_id": "donation", "device_id": "dev-2"},
        },
    }
    raw = json.dumps(payload).encode()
    resp = await client.post("/v1/webhook", content=raw, headers=_sig_headers(raw, "whsec_test"))
    assert resp.status_code == 200, resp.text
    lic = await client.get(f"/v1/webhook/license/{order_ref}")
    assert lic.status_code == 200
    assert lic.json() == {"donated": True, "order_ref": order_ref, "amount_usd": 10.0}


async def test_license_pending_is_402(client, monkeypatch):
    monkeypatch.setattr(settings, "paddle_api_key", "key")
    monkeypatch.setattr(settings, "paddle_price_map", {"test-voice": "pri_test"})
    await _seed_product()
    # Live path without network would 502 — instead seed a pending order directly.
    order_ref = f"otoyin_{uuid.uuid4().hex[:16]}"
    async with async_session() as db:
        db.add(Order(order_ref=order_ref, product_id="test-voice", device_id="d", status="pending", amount_usd=19.0))
        await db.commit()
    lic = await client.get(f"/v1/webhook/license/{order_ref}")
    assert lic.status_code == 402
