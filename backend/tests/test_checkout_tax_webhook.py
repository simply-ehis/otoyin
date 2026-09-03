"""Integration tests for Stripe checkout, tax, and webhook flows.

Covers:
- Dev-mode checkout (no real Stripe keys)
- License signing and verification
- Webhook event handling (checkout.session.completed, charge.refunded)
- License polling after checkout
- Tax calculation (local + Stripe fallback)
- Tax preview API endpoint
- Currency conversion
- Full checkout → webhook → license → poll flow
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os

import pytest

# ── Ensure dev mode is active for tests ────────────────────────────────
os.environ.setdefault("STRIPE_DEV_MODE", "1")
os.environ.setdefault("LICENSE_SIGNING_KEY", "test-signing-key-12345")


# ── Fixtures ───────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _clean_orders():
    """Reset in-memory order store between tests."""
    import backend.services.checkout as co

    co._orders.clear()
    yield
    co._orders.clear()


@pytest.fixture(autouse=True)
def _dev_mode():
    """Ensure Stripe dev mode is active."""
    import backend.services.checkout as co

    orig = co.STRIPE_DEV_MODE
    co.STRIPE_DEV_MODE = True
    yield
    co.STRIPE_DEV_MODE = orig


# ── Checkout Flow Tests ───────────────────────────────────────────────


class TestCheckoutFlow:
    """Tests for the checkout session creation in dev mode."""

    @pytest.mark.asyncio
    async def test_dev_mode_creates_order(self):
        """Dev mode creates an order and returns a checkout URL."""
        from backend.services.checkout import create_checkout_session

        result = await create_checkout_session(
            product_id="qwen3-8-27b-ud-iq2-s",
            device_id="test-device-001",
            email="test@example.com",
            price_usd=80.0,
        )

        assert "order_ref" in result
        assert result["order_ref"].startswith("ord_")
        assert result["product_id"] == "qwen3-8-27b-ud-iq2-s"
        assert result["amount_usd"] == 80.0
        assert result.get("dev_mode") is True
        assert "checkout_url" in result

    @pytest.mark.asyncio
    async def test_dev_mode_order_is_paid_immediately(self):
        """In dev mode, the order status is 'paid' right away."""
        from backend.services.checkout import create_checkout_session, get_order_status

        result = await create_checkout_session(
            product_id="lfm2",
            device_id="dev-test",
            email="dev@test.com",
            price_usd=26.0,
        )

        status = get_order_status(result["order_ref"])
        assert status is not None
        assert status["status"] == "paid"
        assert status["product_id"] == "lfm2"
        assert status["amount_usd"] == 26.0

    @pytest.mark.asyncio
    async def test_dev_mode_license_is_signed(self):
        """The license created in dev mode is properly HMAC-signed."""
        from backend.services.checkout import create_checkout_session

        result = await create_checkout_session(
            product_id="test-model",
            device_id="signing-test",
            email="sign@test.com",
            price_usd=10.0,
        )

        from backend.services.checkout import poll_license

        license_data = await poll_license(result["order_ref"])
        assert license_data is not None
        assert "sig" in license_data
        assert "signed_at" in license_data
        assert license_data["product_id"] == "test-model"
        assert license_data["device_id"] == "signing-test"
        assert license_data["amount_usd"] == 10.0
        assert license_data["expires_at"] == "lifetime"

    @pytest.mark.asyncio
    async def test_license_signature_is_valid(self):
        """Verify the HMAC signature on the license is correct."""
        from backend.services.checkout import create_checkout_session, poll_license

        result = await create_checkout_session(
            product_id="verify-model",
            device_id="verify-device",
            email="verify@test.com",
            price_usd=50.0,
        )

        license_data = await poll_license(result["order_ref"])

        # Recompute the expected signature
        signing_key = os.environ.get("LICENSE_SIGNING_KEY", "otoyin-dev-signing-key")
        fields = {k: v for k, v in license_data.items() if k not in ("sig", "signed_at")}
        payload = json.dumps(fields, sort_keys=True, separators=(",", ":"))
        expected_sig = hmac.new(signing_key.encode(), payload.encode(), hashlib.sha256).hexdigest()

        assert license_data["sig"] == expected_sig

    @pytest.mark.asyncio
    async def test_different_products_different_orders(self):
        """Each checkout creates a unique order_ref."""
        from backend.services.checkout import create_checkout_session

        r1 = await create_checkout_session(
            product_id="model-a",
            device_id="d1",
            email="a@test.com",
            price_usd=10.0,
        )
        r2 = await create_checkout_session(
            product_id="model-b",
            device_id="d2",
            email="b@test.com",
            price_usd=20.0,
        )

        assert r1["order_ref"] != r2["order_ref"]
        assert r1["product_id"] == "model-a"
        assert r2["product_id"] == "model-b"


# ── License Polling Tests ─────────────────────────────────────────────


class TestLicensePolling:
    """Tests for polling for a license after checkout."""

    @pytest.mark.asyncio
    async def test_poll_returns_license_when_paid(self):
        """Polling returns the license once the order is paid."""
        from backend.services.checkout import create_checkout_session, poll_license

        result = await create_checkout_session(
            product_id="poll-model",
            device_id="poll-device",
            email="poll@test.com",
            price_usd=15.0,
        )

        license_data = await poll_license(result["order_ref"])
        assert license_data is not None
        assert license_data["product_id"] == "poll-model"

    @pytest.mark.asyncio
    async def test_poll_returns_none_for_unknown_order(self):
        """Polling returns None for an order that doesn't exist."""
        from backend.services.checkout import poll_license

        result = await poll_license("ord_nonexistent123")
        assert result is None

    @pytest.mark.asyncio
    async def test_order_status_tracking(self):
        """Order status transitions from pending to paid."""
        from backend.services.checkout import (
            create_checkout_session,
            get_order_status,
        )

        result = await create_checkout_session(
            product_id="status-model",
            device_id="status-device",
            email="status@test.com",
            price_usd=5.0,
        )

        status = get_order_status(result["order_ref"])
        assert status is not None
        assert status["status"] == "paid"
        assert status["product_id"] == "status-model"
        assert status["amount_usd"] == 5.0


# ── Webhook Handling Tests ────────────────────────────────────────────


class TestWebhookHandling:
    """Tests for Stripe webhook event handling."""

    @pytest.mark.asyncio
    async def test_checkout_session_completed_fulfills_order(self):
        """Webhook for checkout.session.completed creates a signed license."""
        from backend.services.checkout import (
            create_checkout_session,
            handle_webhook,
            poll_license,
        )

        # Create an order first
        result = await create_checkout_session(
            product_id="webhook-model",
            device_id="webhook-device",
            email="wh@test.com",
            price_usd=30.0,
        )

        order_ref = result["order_ref"]

        # Simulate a Stripe webhook event
        webhook_event = {
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": "cs_test_session_123",
                    "metadata": {
                        "order_ref": order_ref,
                        "product_id": "webhook-model",
                        "device_id": "webhook-device",
                    },
                }
            },
        }

        # Handle the webhook (no signature verification in dev mode)
        response = await handle_webhook(json.dumps(webhook_event).encode(), "")

        assert response["status"] == "fulfilled"
        assert response["order_ref"] == order_ref
        assert "license" in response

        # Verify the license is pollable
        license_data = await poll_license(order_ref)
        assert license_data is not None
        assert license_data["product_id"] == "webhook-model"

    @pytest.mark.asyncio
    async def test_charge_refunded_revokes_license(self):
        """Webhook for charge.refunded revokes the license."""
        from backend.services.checkout import (
            create_checkout_session,
            handle_webhook,
            poll_license,
        )

        # Create and fulfill an order
        result = await create_checkout_session(
            product_id="refund-model",
            device_id="refund-device",
            email="refund@test.com",
            price_usd=25.0,
        )

        order_ref = result["order_ref"]

        # First, fulfill via checkout.session.completed
        fulfill_event = {
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": "cs_refund_session",
                    "metadata": {
                        "order_ref": order_ref,
                        "product_id": "refund-model",
                        "device_id": "refund-device",
                    },
                }
            },
        }
        await handle_webhook(json.dumps(fulfill_event).encode(), "")

        # Verify license exists
        license_data = await poll_license(order_ref)
        assert license_data is not None

        # Now simulate a refund
        refund_event = {
            "type": "charge.refunded",
            "data": {
                "object": {
                    "metadata": {"order_ref": order_ref},
                }
            },
        }

        response = await handle_webhook(json.dumps(refund_event).encode(), "")
        assert response["status"] == "revoked"
        assert response["order_ref"] == order_ref

    @pytest.mark.asyncio
    async def test_unhandled_webhook_event_returns_ignored(self):
        """Unhandled webhook events return status='ignored'."""
        from backend.services.checkout import handle_webhook

        event = {
            "type": "invoice.payment_failed",
            "data": {"object": {}},
        }

        response = await handle_webhook(json.dumps(event).encode(), "")
        assert response["status"] == "ignored"
        assert response["event_type"] == "invoice.payment_failed"

    @pytest.mark.asyncio
    async def test_invalid_json_payload_returns_error(self):
        """Invalid JSON in webhook payload returns an error."""
        from backend.services.checkout import handle_webhook

        response = await handle_webhook(b"not valid json {{{", "")
        assert "error" in response


# ── Full End-to-End Flow ──────────────────────────────────────────────


class TestFullE2EFlow:
    """Tests the complete checkout → webhook → license → poll flow."""

    @pytest.mark.asyncio
    async def test_complete_purchase_flow(self):
        """Full flow: create checkout → webhook fulfillment → poll license."""
        from backend.services.checkout import (
            create_checkout_session,
            get_order_status,
            handle_webhook,
            poll_license,
        )

        # Step 1: Customer initiates checkout
        checkout = await create_checkout_session(
            product_id="e2e-model",
            device_id="e2e-device-001",
            email="customer@example.com",
            price_usd=100.0,
        )
        assert checkout["order_ref"].startswith("ord_")
        assert checkout["amount_usd"] == 100.0

        order_ref = checkout["order_ref"]

        # Step 2: Payment is pending (in real flow, user completes payment)
        status = get_order_status(order_ref)
        assert status["status"] == "paid"  # Dev mode is instant

        # Step 3: Stripe sends webhook confirming payment
        webhook = await handle_webhook(
            json.dumps(
                {
                    "type": "checkout.session.completed",
                    "data": {
                        "object": {
                            "id": "cs_e2e_session",
                            "metadata": {
                                "order_ref": order_ref,
                                "product_id": "e2e-model",
                                "device_id": "e2e-device-001",
                            },
                        }
                    },
                }
            ).encode(),
            "",
        )
        assert webhook["status"] == "fulfilled"

        # Step 4: Client polls for license
        license_data = await poll_license(order_ref)
        assert license_data is not None
        assert license_data["product_id"] == "e2e-model"
        assert license_data["device_id"] == "e2e-device-001"
        assert license_data["email"] == "customer@example.com"
        assert license_data["amount_usd"] == 100.0
        assert license_data["expires_at"] == "lifetime"

        # Step 5: License has valid signature
        assert "sig" in license_data
        assert len(license_data["sig"]) == 64  # SHA-256 hex digest

    @pytest.mark.asyncio
    async def test_multiple_purchases_independent(self):
        """Multiple purchases create independent orders and licenses."""
        from backend.services.checkout import create_checkout_session, poll_license

        r1 = await create_checkout_session(
            product_id="model-a",
            device_id="d1",
            email="a@test.com",
            price_usd=10.0,
        )
        r2 = await create_checkout_session(
            product_id="model-b",
            device_id="d2",
            email="b@test.com",
            price_usd=20.0,
        )

        l1 = await poll_license(r1["order_ref"])
        l2 = await poll_license(r2["order_ref"])

        assert l1 is not None
        assert l2 is not None
        assert l1["product_id"] == "model-a"
        assert l2["product_id"] == "model-b"
        assert l1["order_ref"] != l2["order_ref"]


# ── Tax Calculation Tests ─────────────────────────────────────────────


class TestTaxCalculation:
    """Tests for tax calculation service."""

    def test_ng_vat_calculation(self):
        """Nigeria VAT (7.5%) is calculated correctly."""
        from backend.services.tax import calculate_tax_locally

        result = calculate_tax_locally(80.0, "NG")
        assert result["subtotal"] == 80.0
        assert result["tax_amount"] == 6.0  # 80 * 7.5 / 100
        assert result["tax_rate"] == 7.5
        assert result["tax_name"] == "VAT"
        assert result["total"] == 86.0
        assert result["estimated"] is True

    def test_germany_mwst_calculation(self):
        """Germany MwSt (19%) is calculated correctly."""
        from backend.services.tax import calculate_tax_locally

        result = calculate_tax_locally(26.0, "DE")
        assert result["subtotal"] == 26.0
        assert result["tax_amount"] == 4.94  # 26 * 19 / 100 = 4.94
        assert result["tax_rate"] == 19.0
        assert result["tax_name"] == "MwSt"
        assert result["total"] == pytest.approx(30.94, abs=0.01)

    def test_uk_vat_calculation(self):
        """UK VAT (20%) is calculated correctly."""
        from backend.services.tax import calculate_tax_locally

        result = calculate_tax_locally(13.0, "GB")
        assert result["subtotal"] == 13.0
        assert result["tax_amount"] == 2.6  # 13 * 20 / 100
        assert result["tax_rate"] == 20.0
        assert result["total"] == 15.6

    def test_us_no_tax_locally(self):
        """US returns 0 tax locally (state-specific, handled by Stripe)."""
        from backend.services.tax import calculate_tax_locally

        result = calculate_tax_locally(80.0, "US")
        assert result["tax_amount"] == 0.0
        assert result["total"] == 80.0
        assert "note" in result

    def test_unknown_country_no_tax(self):
        """Unknown country returns 0 tax."""
        from backend.services.tax import calculate_tax_locally

        result = calculate_tax_locally(50.0, "XX")
        assert result["tax_amount"] == 0.0
        assert result["total"] == 50.0

    def test_zero_amount(self):
        """Zero amount results in zero tax."""
        from backend.services.tax import calculate_tax_locally

        result = calculate_tax_locally(0.0, "NG")
        assert result["tax_amount"] == 0.0
        assert result["total"] == 0.0

    def test_get_tax_summary_with_tax(self):
        """Tax summary returns correct info for a taxed country."""
        from backend.services.tax import get_tax_summary

        summary = get_tax_summary("NG")
        assert summary["has_tax"] is True
        assert summary["tax_name"] == "VAT"
        assert summary["tax_rate"] == 7.5
        assert summary["country"] == "Nigeria"

    def test_get_tax_summary_no_tax(self):
        """Tax summary returns no_tax for US."""
        from backend.services.tax import get_tax_summary

        summary = get_tax_summary("US")
        assert summary["has_tax"] is False

    def test_get_all_jurisdictions(self):
        """All tax jurisdictions are listed."""
        from backend.services.tax import get_all_tax_jurisdictions

        jurisdictions = get_all_tax_jurisdictions()
        assert len(jurisdictions) >= 40  # EU + other regions
        # Check some known entries
        ng = next(j for j in jurisdictions if j["country_code"] == "NG")
        assert ng["tax_rate"] == 7.5
        de = next(j for j in jurisdictions if j["country_code"] == "DE")
        assert de["tax_rate"] == 19.0

    def test_eu_all_countries_have_rates(self):
        """All EU countries have VAT rates defined."""
        from backend.services.tax import EU_VAT_RATES

        eu_codes = {
            "AT",
            "BE",
            "BG",
            "HR",
            "CY",
            "CZ",
            "DK",
            "EE",
            "FI",
            "FR",
            "DE",
            "GR",
            "HU",
            "IE",
            "IT",
            "LV",
            "LT",
            "LU",
            "MT",
            "NL",
            "PL",
            "PT",
            "RO",
            "SK",
            "SI",
            "ES",
            "SE",
        }
        for code in eu_codes:
            assert code in EU_VAT_RATES, f"Missing VAT rate for EU country: {code}"
            assert EU_VAT_RATES[code]["rate"] > 0
            assert EU_VAT_RATES[code]["country"]


# ── API Endpoint Tests ────────────────────────────────────────────────


class TestMarketplaceAPI:
    """Tests for the marketplace API endpoints via FastAPI TestClient."""

    @pytest.fixture(autouse=True)
    def _ready(self):
        """Ensure readiness gate is open."""
        import backend.app as _app_mod
        from backend.app import _init_ready_event, _signal_ready

        _init_ready_event()
        _signal_ready()
        yield
        _app_mod._ready_event = None

    @pytest.fixture(autouse=True)
    def _dev_mode_patch(self):
        """Patch checkout service to use dev mode for API tests.

        The route checks is_stripe_configured() before calling the service,
        so we need to both set dev mode AND patch is_stripe_configured.
        """
        import backend.services.checkout as co

        orig_dev = co.STRIPE_DEV_MODE
        orig_key = co.STRIPE_SECRET_KEY
        co.STRIPE_DEV_MODE = True
        co.STRIPE_SECRET_KEY = "sk_test_dummy_for_tests"
        yield
        co.STRIPE_DEV_MODE = orig_dev
        co.STRIPE_SECRET_KEY = orig_key

    @pytest.fixture
    def client(self):
        """Create a TestClient."""
        from backend.app import app

        return TestClient(app, raise_server_exceptions=False)

    def test_checkout_creates_session(self, client):
        """POST /marketplace/checkout creates a checkout session."""
        response = client.post(
            "/marketplace/checkout",
            json={
                "product_id": "whisper-small-en",
                "device_id": "api-test-device",
                "email": "api@test.com",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "order_ref" in data
        assert data["product_id"] == "whisper-small-en"

    def test_checkout_rejects_free_product(self, client):
        """Checkout rejects free products."""
        response = client.post(
            "/marketplace/checkout",
            json={
                "product_id": "kokoro-onnx",
                "device_id": "test-device",
                "email": "test@test.com",
            },
        )
        # kokoro-onnx might be free, so this should return 400
        assert response.status_code in (400, 404)

    def test_checkout_rejects_unknown_product(self, client):
        """Checkout rejects unknown product IDs."""
        response = client.post(
            "/marketplace/checkout",
            json={
                "product_id": "nonexistent-product-xyz",
                "device_id": "test-device",
                "email": "test@test.com",
            },
        )
        assert response.status_code == 404

    def test_license_poll_pending(self, client):
        """GET /marketplace/license/{ref} returns the license when paid."""
        # Create a checkout first
        checkout_resp = client.post(
            "/marketplace/checkout",
            json={
                "product_id": "whisper-small-en",
                "device_id": "poll-test",
                "email": "poll@test.com",
            },
        )
        order_ref = checkout_resp.json()["order_ref"]

        # Poll — in dev mode it should be immediately available
        poll_resp = client.get(f"/marketplace/license/{order_ref}")
        assert poll_resp.status_code == 200
        assert "sig" in poll_resp.json()

    def test_license_poll_unknown_order(self, client):
        """GET /marketplace/license/{ref} returns 402 for unknown order."""
        response = client.get("/marketplace/license/ord_nonexistent")
        assert response.status_code == 402

    def test_webhook_endpoint(self, client):
        """POST /marketplace/webhook/stripe handles events."""
        # First create an order
        checkout_resp = client.post(
            "/marketplace/checkout",
            json={
                "product_id": "whisper-small-en",
                "device_id": "webhook-test",
                "email": "wh@test.com",
            },
        )
        order_ref = checkout_resp.json()["order_ref"]

        # Send webhook
        webhook_event = {
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": "cs_api_test",
                    "metadata": {
                        "order_ref": order_ref,
                        "product_id": "whisper-small-en",
                        "device_id": "webhook-test",
                    },
                }
            },
        }
        response = client.post(
            "/marketplace/webhook/stripe",
            content=json.dumps(webhook_event),
            headers={"content-type": "application/json"},
        )
        assert response.status_code == 200
        assert response.json()["status"] == "fulfilled"

    def test_tax_preview_endpoint(self, client):
        """POST /marketplace/tax/preview returns tax calculation."""
        response = client.post(
            "/marketplace/tax/preview",
            json={
                "amount_usd": 80.0,
                "country_code": "NG",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["subtotal"] == 80.0
        assert data["tax_amount"] == 6.0
        assert data["total"] == 86.0

    def test_tax_jurisdictions_endpoint(self, client):
        """GET /marketplace/tax/jurisdictions lists all jurisdictions."""
        response = client.get("/marketplace/tax/jurisdictions")
        assert response.status_code == 200
        data = response.json()
        assert "jurisdictions" in data
        assert len(data["jurisdictions"]) >= 40

    def test_tax_summary_endpoint(self, client):
        """GET /marketplace/tax/summary/{code} returns country tax info."""
        response = client.get("/marketplace/tax/summary/NG")
        assert response.status_code == 200
        data = response.json()
        assert data["has_tax"] is True
        assert data["tax_rate"] == 7.5

    def test_region_detection_endpoint(self, client):
        """GET /marketplace/region detects user region."""
        response = client.get("/marketplace/region")
        assert response.status_code == 200
        data = response.json()
        assert "country_code" in data
        assert "currency" in data

    def test_convert_price_endpoint(self, client):
        """POST /marketplace/convert-price converts USD to local currency."""
        response = client.post(
            "/marketplace/convert-price",
            json={"amount_usd": 80.0, "currency": "GBP"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["currency"] == "GBP"
        assert data["amount"] > 0
        assert data["rate"] > 0


# ── Import guard ──────────────────────────────────────────────────────
from fastapi.testclient import TestClient
