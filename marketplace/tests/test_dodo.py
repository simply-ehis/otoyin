"""Dodo Payments tests — signature verification + checkout/webhook flow.

Runs against a throwaway SQLite DB (dev mode: no provider account needed).
Async mode is set in marketplace/pyproject.toml (asyncio_mode = "auto").
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from marketplace_server import dodo
from marketplace_server.app import app
from marketplace_server.config import settings
from marketplace_server.models import License, Order, Product, async_session, init_db


def _sig_headers(raw: bytes, secret: str, ts: int | None = None) -> dict:
    ts = ts if ts is not None else int(time.time())
    webhook_id = "msg_test_123"
    signed_payload = f"{webhook_id}.{ts}.".encode() + raw
    digest = hmac.new(secret.encode(), signed_payload, hashlib.sha256).digest()
    signature = base64.b64encode(digest).decode()
    return {
        "webhook-id": webhook_id,
        "webhook-timestamp": str(ts),
        "webhook-signature": f"v1,{signature}",
    }


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


async def _seed_product(
    product_id: str = "test-voice", price: float = 19.0, coming_soon: bool = False
) -> None:
    async with async_session() as db:
        await db.execute(delete(Product).where(Product.id == product_id))
        db.add(
            Product(
                id=product_id,
                name="Test Voice",
                category="tts",
                price_usd=price,
                paid=True,
                coming_soon=coming_soon,
            )
        )
        await db.commit()


# ── Signature verification ──────────────────────────────────────────


def test_verify_valid_signature():
    secret, raw = "whsec_test", b'{"event_type":"ping"}'
    old = settings.dodo_webhook_secret
    settings.dodo_webhook_secret = secret
    try:
        assert dodo.verify_signature(raw, _sig_headers(raw, secret)) is True
    finally:
        settings.dodo_webhook_secret = old


def test_verify_rejects_tampered_body():
    old = settings.dodo_webhook_secret
    settings.dodo_webhook_secret = "whsec_test"
    try:
        raw = b'{"type":"payment.succeeded"}'
        headers = _sig_headers(raw, "whsec_test")
        tampered = b'{"type":"payment.succeeded","x":1}'
        assert dodo.verify_signature(tampered, headers) is False
    finally:
        settings.dodo_webhook_secret = old


def test_verify_rejects_stale_timestamp():
    old = settings.dodo_webhook_secret
    settings.dodo_webhook_secret = "whsec_test"
    try:
        raw = b"{}"
        headers = _sig_headers(raw, "whsec_test", ts=int(time.time()) - 3600)
        assert dodo.verify_signature(raw, headers) is False
    finally:
        settings.dodo_webhook_secret = old


def test_verify_rejects_missing_headers():
    old = settings.dodo_webhook_secret
    settings.dodo_webhook_secret = "whsec_test"
    try:
        raw = b"{}"
        assert dodo.verify_signature(raw, {}) is False
        assert dodo.verify_signature(raw, {"webhook-id": "x"}) is False
        assert dodo.verify_signature(raw, {"webhook-id": "x", "webhook-timestamp": "1"}) is False
    finally:
        settings.dodo_webhook_secret = old


# ── Dev-mode checkout (no API key) ──────────────────────────────────


async def test_dev_checkout_fulfills_immediately(client, monkeypatch):
    monkeypatch.setattr(settings, "dodo_api_key", "")
    monkeypatch.setattr(settings, "debug", True)
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
    monkeypatch.setattr(settings, "dodo_api_key", "")
    resp = await client.post("/v1/checkout", json={"product_id": "nope", "device_id": "d", "email": ""})
    assert resp.status_code == 404


async def test_checkout_coming_soon_product_blocked(client, monkeypatch):
    monkeypatch.setattr(settings, "dodo_api_key", "live_key")
    await _seed_product("test-coming-soon", price=10.0, coming_soon=True)
    resp = await client.post(
        "/v1/checkout",
        json={"product_id": "test-coming-soon", "device_id": "d", "email": ""},
    )
    assert resp.status_code == 409
    assert resp.json()["detail"]["code"] == "product_coming_soon"


async def test_pricing_preview_returns_localized_totals(client, monkeypatch):
    await _seed_product("test-preview", price=5.0)
    monkeypatch.setattr(settings, "dodo_product_map", {"test-preview": "pdt_test"})

    async def _fake_preview(*, country_code: str, price_ids: list[str]):
        assert country_code == "GB"
        assert price_ids == ["pdt_test"]
        return {
            "currency_code": "GBP",
            "details": {
                "line_items": [
                    {
                        "price": {"id": "pdt_test"},
                        "totals": {"total": "378"},
                        "formatted_totals": {"total": "£3.78"},
                    }
                ]
            },
        }

    monkeypatch.setattr(
        "marketplace_server.routes.catalog.dodo.preview_prices", _fake_preview
    )
    resp = await client.post(
        "/v1/catalog/pricing/preview",
        json={"country_code": "gb", "product_ids": ["test-preview"]},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["country_code"] == "GB"
    assert body["currency"] == "GBP"
    assert body["prices"] == [
        {
            "product_id": "test-preview",
            "currency": "GBP",
            "amount": 3.78,
            "formatted_total": "£3.78",
        }
    ]


async def test_preview_prices_not_configured_raises(monkeypatch):
    monkeypatch.setattr(settings, "dodo_api_key", "")
    with pytest.raises(RuntimeError, match="not configured"):
        await dodo.preview_prices(country_code="US", price_ids=["pdt_a"])


async def test_preview_prices_chunks_merges_and_formats(monkeypatch):
    monkeypatch.setattr(settings, "dodo_api_key", "key")
    calls: list[list[str]] = []

    async def _fake_chunk(client, price_ids, country_code):
        assert country_code == "DE"
        calls.append(list(price_ids))
        return {
            "currency": "EUR",
            "product_cart": [
                {"product_id": pid, "discounted_price": 378, "currency": "EUR"}
                for pid in price_ids
            ],
        }

    monkeypatch.setattr(dodo, "_preview_chunk", _fake_chunk)
    price_ids = [f"pdt_{i:02d}" for i in range(25)]
    result = await dodo.preview_prices(country_code="DE", price_ids=price_ids)

    # 25 items exceed the 20-item Dodo cart limit -> two chunks, merged.
    assert [len(c) for c in calls] == [20, 5]
    assert result["currency_code"] == "EUR"
    items = result["details"]["line_items"]
    assert len(items) == 25
    assert items[0] == {
        "price": {"id": "pdt_00"},
        "totals": {"total": "378"},
        "formatted_totals": {"total": "3.78 EUR"},
    }


async def test_preview_prices_zero_decimal_currency(monkeypatch):
    monkeypatch.setattr(settings, "dodo_api_key", "key")

    async def _fake_chunk(client, price_ids, country_code):
        return {
            "currency": "JPY",
            "product_cart": [
                {"product_id": pid, "discounted_price": 500} for pid in price_ids
            ],
        }

    monkeypatch.setattr(dodo, "_preview_chunk", _fake_chunk)
    result = await dodo.preview_prices(country_code="JP", price_ids=["pdt_jpy"])
    item = result["details"]["line_items"][0]
    assert item["totals"] == {"total": "500"}
    assert item["formatted_totals"] == {"total": "500.00 JPY"}


async def test_checkout_missing_price_id_is_500(client, monkeypatch):
    monkeypatch.setattr(settings, "dodo_api_key", "live_key_but_no_prices")
    await _seed_product()
    resp = await client.post("/v1/checkout", json={"product_id": "test-voice", "device_id": "d", "email": ""})
    assert resp.status_code == 500
    assert resp.json()["detail"]["code"] == "price_not_configured"


# ── Webhook fulfill ─────────────────────────────────────────────────


async def test_webhook_fulfills_payment_succeeded(client, monkeypatch):
    monkeypatch.setattr(settings, "dodo_api_key", "key")
    monkeypatch.setattr(settings, "dodo_webhook_secret", "whsec_test")
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
                payment_provider="dodo",
            )
        )
        await db.commit()

    payload = {
        "type": "payment.succeeded",
        "data": {
            "id": "pay_test_123",
            "metadata": {"order_ref": order_ref, "product_id": "test-voice", "device_id": "dev-9"},
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
    monkeypatch.setattr(settings, "dodo_webhook_secret", "whsec_test")
    resp = await client.post(
        "/v1/webhook",
        content=b"{}",
        headers={"webhook-id": "x", "webhook-timestamp": "1", "webhook-signature": "v1,deadbeef"},
    )
    assert resp.status_code == 401


async def test_webhook_ignores_unknown_events(client, monkeypatch):
    monkeypatch.setattr(settings, "dodo_webhook_secret", "")
    monkeypatch.setattr(settings, "debug", True)
    resp = await client.post("/v1/webhook", content=json.dumps({"type": "ping", "data": {}}).encode())
    assert resp.status_code == 200
    assert resp.json()["status"] == "ignored"


async def test_refund_reached_via_payment_id(client, monkeypatch):
    """refund.succeeded without metadata still revokes via payment link."""
    monkeypatch.setattr(settings, "dodo_api_key", "key")
    monkeypatch.setattr(settings, "dodo_webhook_secret", "whsec_test")
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
                payment_provider="dodo",
                payment_session_id="pay_test_999",
            )
        )
        await db.commit()
    payload = {
        "type": "refund.succeeded",
        "data": {"id": "ref_1", "payment_id": "pay_test_999"},
    }
    raw = json.dumps(payload).encode()
    resp = await client.post("/v1/webhook", content=raw, headers=_sig_headers(raw, "whsec_test"))
    assert resp.status_code == 200, resp.text
    lic = await client.get(f"/v1/webhook/license/{order_ref}")
    assert lic.status_code == 402


async def test_donate_dev_fulfills_without_license(client, monkeypatch):
    monkeypatch.setattr(settings, "dodo_api_key", "")
    monkeypatch.setattr(settings, "debug", True)
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
    async with async_session() as db:
        from marketplace_server.models import License

        assert (await db.execute(select(License))).scalars().all() == []


async def test_donate_rejects_bad_amounts(client, monkeypatch):
    monkeypatch.setattr(settings, "dodo_api_key", "")
    for bad in (0, -5, 10000.01):
        resp = await client.post(
            "/v1/checkout/donate",
            json={"device_id": "d", "email": "", "amount_usd": bad},
        )
        assert resp.status_code == 422, bad
    resp = await client.post(
        "/v1/checkout/donate",
        json={"device_id": "d", "email": "", "amount_usd": 0.5},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["code"] == "bad_amount"


async def test_donate_pending_is_402(client, monkeypatch):
    monkeypatch.setattr(settings, "dodo_api_key", "key")
    order_ref = f"otoyin_{uuid.uuid4().hex[:16]}"
    async with async_session() as db:
        db.add(
            Order(
                order_ref=order_ref,
                product_id="donation",
                device_id="d",
                status="pending",
                amount_usd=10.0,
                payment_provider="dodo",
            )
        )
        await db.commit()
    lic = await client.get(f"/v1/webhook/license/{order_ref}")
    assert lic.status_code == 402


async def test_webhook_fulfills_donation_without_license(client, monkeypatch):
    monkeypatch.setattr(settings, "dodo_api_key", "key")
    monkeypatch.setattr(settings, "dodo_webhook_secret", "whsec_test")
    order_ref = f"otoyin_{uuid.uuid4().hex[:16]}"
    async with async_session() as db:
        db.add(
            Order(
                order_ref=order_ref,
                product_id="donation",
                device_id="dev-2",
                status="pending",
                amount_usd=10.0,
                payment_provider="dodo",
            )
        )
        await db.commit()
    payload = {
        "type": "payment.succeeded",
        "data": {
            "id": "pay_donate_1",
            "metadata": {"order_ref": order_ref, "product_id": "donation", "device_id": "dev-2"},
        },
    }
    raw = json.dumps(payload).encode()
    resp = await client.post("/v1/webhook", content=raw, headers=_sig_headers(raw, "whsec_test"))
    assert resp.status_code == 200, resp.text
    lic = await client.get(f"/v1/webhook/license/{order_ref}")
    assert lic.status_code == 200
    assert lic.json() == {"donated": True, "order_ref": order_ref, "amount_usd": 10.0}


async def test_license_pending_is_402(client, monkeypatch):
    monkeypatch.setattr(settings, "dodo_api_key", "key")
    monkeypatch.setattr(settings, "dodo_product_map", {"test-voice": "pdt_test"})
    await _seed_product()
    order_ref = f"otoyin_{uuid.uuid4().hex[:16]}"
    async with async_session() as db:
        db.add(Order(order_ref=order_ref, product_id="test-voice", device_id="d", status="pending", amount_usd=19.0))
        await db.commit()
    lic = await client.get(f"/v1/webhook/license/{order_ref}")
    assert lic.status_code == 402
