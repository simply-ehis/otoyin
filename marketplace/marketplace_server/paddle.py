"""Paddle Billing integration — checkout transactions + webhook verification.

Paddle is the Merchant of Record: payments, VAT/sales-tax, and compliance
are handled by Paddle. This service only creates transactions, verifies
webhooks, and signs licenses.

Docs: https://developer.paddle.com/ (Paddle Billing — NOT Paddle Classic,
which uses a different API and webhook scheme).
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import time

import httpx

from .config import settings

logger = logging.getLogger(__name__)

API_LIVE = "https://api.paddle.com"
API_SANDBOX = "https://sandbox-api.paddle.com"

# Webhook timestamps older than this are rejected as replays. Paddle's own
# SDKs default to 5s; 5 minutes tolerates queued/redelivered webhooks while
# still bounding replay risk.
WEBHOOK_MAX_AGE_S = 300


def base_url() -> str:
    """API base URL — sandbox by default so a misconfigured deploy can't charge."""
    return API_SANDBOX if settings.paddle_sandbox else API_LIVE


def is_configured() -> bool:
    """True when a Paddle API key is present (live charging possible)."""
    return bool(settings.paddle_api_key)


def price_id_for(product_id: str) -> str:
    """Paddle price ID for a catalog product (created in the Paddle dashboard)."""
    return settings.paddle_price_map.get(product_id, "")


async def create_transaction(
    *,
    order_ref: str,
    product_id: str,
    device_id: str,
    email: str,
    price_id: str,
) -> dict:
    """Create an automatically-collected Paddle transaction.

    Returns ``{"transaction_id": ..., "checkout_url": ...}``. Raises
    ``RuntimeError`` with the provider message on failure (route maps it
    to 502 — our bug/config, not the client's).
    """
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                f"{base_url()}/transactions",
                headers={
                    "Authorization": f"Bearer {settings.paddle_api_key}",
                    "Content-Type": "application/json",
                    "Paddle-Version": "1",
                },
                json={
                    "items": [{"price_id": price_id, "quantity": 1}],
                    # No customer_id/address: the transaction is created as
                    # `draft` and Paddle collects customer details at checkout.
                    # The API takes no inline customer object — email travels
                    # in custom_data and our own order row instead.
                    "custom_data": {
                        "order_ref": order_ref,
                        "product_id": product_id,
                        "device_id": device_id,
                        "email": email,
                    },
                    "collection_mode": "automatic",
                },
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json().get("data", {})
        except httpx.HTTPError as exc:
            logger.error("Paddle transaction creation failed for %s: %s", order_ref, exc)
            raise RuntimeError(f"Paddle transaction failed: {exc}") from exc
        except ValueError as exc:
            logger.error("Paddle transaction returned invalid JSON for %s: %s", order_ref, exc)
            raise RuntimeError(f"Paddle transaction returned invalid response: {exc}") from exc
    checkout_url = (data.get("checkout") or {}).get("url", "")
    if not data.get("id") or not checkout_url:
        logger.error("Paddle transaction response missing id/checkout url for %s", order_ref)
        raise RuntimeError("Paddle transaction response missing id/checkout url")
    return {"transaction_id": data["id"], "checkout_url": checkout_url}


async def create_donation_transaction(
    *,
    order_ref: str,
    device_id: str,
    email: str,
    amount_cents: int,
) -> dict:
    """Create a custom-amount donation transaction (no catalog price needed).

    Uses a non-catalog price + product inline, so donations need zero
    dashboard setup. Returns ``{"transaction_id", "checkout_url"}`` like
    :func:`create_transaction`. Raises ``RuntimeError`` on provider failure.
    """
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                f"{base_url()}/transactions",
                headers={
                    "Authorization": f"Bearer {settings.paddle_api_key}",
                    "Content-Type": "application/json",
                    "Paddle-Version": "1",
                },
                json={
                    "items": [
                        {
                            "quantity": 1,
                            "price": {
                                "description": "One-time donation to Otoyin",
                                "name": "Otoyin Donation",
                                "billing_cycle": None,
                                "trial_period": None,
                                "tax_mode": "standard",
                                "unit_price": {"amount": str(amount_cents), "currency_code": "USD"},
                            },
                            "product": {
                                "name": "Otoyin Donation",
                                "description": "Voluntary contribution to Otoyin development.",
                                "tax_category": "standard",
                            },
                        }
                    ],
                    "custom_data": {
                        "order_ref": order_ref,
                        "product_id": "donation",
                        "device_id": device_id,
                        "email": email,
                    },
                    "collection_mode": "automatic",
                },
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json().get("data", {})
        except httpx.HTTPError as exc:
            logger.error("Paddle donation creation failed for %s: %s", order_ref, exc)
            raise RuntimeError(f"Paddle donation failed: {exc}") from exc
        except ValueError as exc:
            logger.error("Paddle donation returned invalid JSON for %s: %s", order_ref, exc)
            raise RuntimeError(f"Paddle donation returned invalid response: {exc}") from exc
    checkout_url = (data.get("checkout") or {}).get("url", "")
    if not data.get("id") or not checkout_url:
        logger.error("Paddle donation response missing id/checkout url for %s", order_ref)
        raise RuntimeError("Paddle donation response missing id/checkout url")
    return {"transaction_id": data["id"], "checkout_url": checkout_url}


async def get_transaction(transaction_id: str) -> dict:
    """Fetch a Paddle transaction to retrieve its checkout URL.

    Used by idempotency logic to re-fetch the checkout URL for a pending order.
    Returns ``{"checkout_url": ...}``. Raises ``RuntimeError`` on failure.
    """
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"{base_url()}/transactions/{transaction_id}",
                headers={
                    "Authorization": f"Bearer {settings.paddle_api_key}",
                    "Paddle-Version": "1",
                },
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json().get("data", {})
        except httpx.HTTPError as exc:
            logger.error("Paddle transaction fetch failed for %s: %s", transaction_id, exc)
            raise RuntimeError(f"Paddle transaction fetch failed: {exc}") from exc
        except ValueError as exc:
            logger.error("Paddle transaction fetch returned invalid JSON for %s: %s", transaction_id, exc)
            raise RuntimeError(f"Paddle transaction fetch returned invalid response: {exc}") from exc
    checkout_url = (data.get("checkout") or {}).get("url", "")
    if not checkout_url:
        logger.error("Paddle transaction %s missing checkout url", transaction_id)
        raise RuntimeError(f"Paddle transaction {transaction_id} missing checkout url")
    return {"checkout_url": checkout_url}


def verify_signature(raw_body: bytes, header: str) -> bool:
    """Verify a ``Paddle-Signature: ts=...;h1=...[;h1=...]`` header.

    Signed payload is ``{ts}:{raw_body}`` (raw bytes — never re-serialize).
    Multiple ``h1`` values appear during secret rotation; any match passes.
    """
    parts = (header or "").split(";")
    ts = next((p[3:] for p in parts if p.startswith("ts=")), "")
    signatures = [p[3:] for p in parts if p.startswith("h1=")]
    if not ts or not signatures or not ts.isdigit():
        return False
    if abs(int(time.time()) - int(ts)) > WEBHOOK_MAX_AGE_S:
        return False
    expected = hmac.new(
        settings.paddle_webhook_secret.encode(), f"{ts}:".encode() + raw_body, hashlib.sha256
    ).hexdigest()
    return any(hmac.compare_digest(sig, expected) for sig in signatures)
