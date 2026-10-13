"""Dodo Payments integration — checkout sessions + webhook verification.

Dodo is the Merchant of Record: payments, VAT/sales-tax, and compliance
are handled by Dodo. This service only creates checkout sessions, verifies
webhooks, and signs licenses.

Docs: https://docs.dodopayments.com/
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import time

import httpx

from .config import settings

logger = logging.getLogger(__name__)

API_LIVE = "https://live.dodopayments.com"
API_SANDBOX = "https://test.dodopayments.com"

WEBHOOK_MAX_AGE_S = 300


def base_url() -> str:
    """API base URL — sandbox by default so a misconfigured deploy can't charge."""
    return API_SANDBOX if settings.dodo_sandbox else API_LIVE


def is_configured() -> bool:
    """True when a Dodo API key is present (live charging possible)."""
    return bool(settings.dodo_api_key)


def price_id_for(product_id: str) -> str:
    """Dodo product ID for a catalog product (created in the Dodo dashboard)."""
    return settings.dodo_product_map.get(product_id, "")


async def create_transaction(
    *,
    order_ref: str,
    product_id: str,
    device_id: str,
    email: str,
    price_id: str,
) -> dict:
    """Create a Dodo checkout session.

    Returns ``{"transaction_id": ..., "checkout_url": ...}``. Raises
    ``RuntimeError`` with the provider message on failure (route maps it
    to 502 — our bug/config, not the client's).
    """
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                f"{base_url()}/checkouts",
                headers={
                    "Authorization": f"Bearer {settings.dodo_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "product_cart": [{"product_id": price_id, "quantity": 1}],
                    "metadata": {
                        "order_ref": order_ref,
                        "product_id": product_id,
                        "device_id": device_id,
                        "email": email,
                    },
                },
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPError as exc:
            logger.error("Dodo checkout creation failed for %s: %s", order_ref, exc)
            raise RuntimeError(f"Dodo checkout failed: {exc}") from exc
        except ValueError as exc:
            logger.error("Dodo checkout returned invalid JSON for %s: %s", order_ref, exc)
            raise RuntimeError(f"Dodo checkout returned invalid response: {exc}") from exc
    checkout_url = data.get("checkout_url", "")
    session_id = data.get("session_id", "")
    if not session_id or not checkout_url:
        logger.error("Dodo checkout response missing session_id/checkout_url for %s", order_ref)
        raise RuntimeError("Dodo checkout response missing session_id/checkout_url")
    return {"transaction_id": session_id, "checkout_url": checkout_url}


async def create_donation_transaction(
    *,
    order_ref: str,
    device_id: str,
    email: str,
    amount_cents: int,
) -> dict:
    """Create a custom-amount donation payment link.

    Returns ``{"transaction_id", "checkout_url"}`` like
    :func:`create_transaction`. Raises ``RuntimeError`` on provider failure.
    """
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                f"{base_url()}/payments",
                headers={
                    "Authorization": f"Bearer {settings.dodo_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "payment_link": True,
                    "amount": {
                        "currency_code": "USD",
                        "value": f"{amount_cents / 100:.2f}",
                    },
                    "metadata": {
                        "order_ref": order_ref,
                        "product_id": "donation",
                        "device_id": device_id,
                        "email": email,
                    },
                },
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPError as exc:
            logger.error("Dodo donation creation failed for %s: %s", order_ref, exc)
            raise RuntimeError(f"Dodo donation failed: {exc}") from exc
        except ValueError as exc:
            logger.error("Dodo donation returned invalid JSON for %s: %s", order_ref, exc)
            raise RuntimeError(f"Dodo donation returned invalid response: {exc}") from exc
    checkout_url = data.get("payment_link", "") or data.get("checkout_url", "")
    txn_id = data.get("id", "")
    if not txn_id or not checkout_url:
        logger.error("Dodo donation response missing id/payment_link for %s", order_ref)
        raise RuntimeError("Dodo donation response missing id/payment_link")
    return {"transaction_id": txn_id, "checkout_url": checkout_url}


async def get_transaction(transaction_id: str) -> dict:
    """Fetch a Dodo checkout session to retrieve its checkout URL.

    Used by idempotency logic to re-fetch the checkout URL for a pending order.
    Returns ``{"checkout_url": ...}``. Raises ``RuntimeError`` on failure.
    """
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"{base_url()}/checkouts/{transaction_id}",
                headers={
                    "Authorization": f"Bearer {settings.dodo_api_key}",
                },
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPError as exc:
            logger.error("Dodo checkout fetch failed for %s: %s", transaction_id, exc)
            raise RuntimeError(f"Dodo checkout fetch failed: {exc}") from exc
        except ValueError as exc:
            logger.error("Dodo checkout fetch returned invalid JSON for %s: %s", transaction_id, exc)
            raise RuntimeError(f"Dodo checkout fetch returned invalid response: {exc}") from exc
    checkout_url = data.get("checkout_url", "")
    if not checkout_url:
        logger.error("Dodo checkout %s missing checkout_url", transaction_id)
        raise RuntimeError(f"Dodo checkout {transaction_id} missing checkout_url")
    return {"checkout_url": checkout_url}


# Dodo checkout carts hold at most 20 items — preview in chunks of that size.
_PREVIEW_CART_LIMIT = 20

_ZERO_DECIMAL_CURRENCIES = {"JPY", "KRW", "CLP"}


def _fmt_minor(minor: int, currency: str) -> str:
    """Format a minor-unit amount for display (e.g. ``3.78 GBP``)."""
    value = float(minor) if currency in _ZERO_DECIMAL_CURRENCIES else minor / 100
    return f"{value:.2f} {currency}"


async def _preview_chunk(
    client: httpx.AsyncClient, price_ids: list[str], country_code: str
) -> dict:
    """POST /checkouts/preview for one cart chunk (raw CalculateSessionResponse)."""
    try:
        resp = await client.post(
            f"{base_url()}/checkouts/preview",
            headers={
                "Authorization": f"Bearer {settings.dodo_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "product_cart": [{"product_id": pid, "quantity": 1} for pid in price_ids],
                "billing_address": {"country": country_code},
            },
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPError as exc:
        logger.error("Dodo preview failed for %s: %s", country_code, exc)
        raise RuntimeError(f"Dodo preview failed: {exc}") from exc
    except ValueError as exc:
        logger.error("Dodo preview returned invalid JSON: %s", exc)
        raise RuntimeError(f"Dodo preview returned invalid response: {exc}") from exc


async def preview_prices(*, country_code: str, price_ids: list[str]) -> dict:
    """Buyer-facing totals via Dodo's preview endpoint.

    Calls ``POST /checkouts/preview`` with the billing country so Dodo
    computes the adaptive currency, discounts, and tax the buyer would
    actually pay — the same math the hosted checkout applies. Carts hold at
    most 20 items, so larger sets are chunked and merged. Returns the
    ``{currency_code, details.line_items[]}`` shape the catalog route
    parses. Raises ``RuntimeError`` when unconfigured or on failure (the
    route maps it to 503/502).
    """
    if not is_configured():
        raise RuntimeError("Dodo API key is not configured")
    if not price_ids:
        return {"currency_code": "USD", "details": {"line_items": []}}
    currency = "USD"
    line_items: list[dict] = []
    async with httpx.AsyncClient() as client:
        for start in range(0, len(price_ids), _PREVIEW_CART_LIMIT):
            data = await _preview_chunk(
                client, price_ids[start : start + _PREVIEW_CART_LIMIT], country_code
            )
            currency = str(data.get("currency") or currency).upper()
            for item in data.get("product_cart") or []:
                pid = str((item or {}).get("product_id") or "")
                if not pid:
                    continue
                total = item.get("discounted_price", item.get("og_price", 0))
                line_items.append(
                    {
                        "price": {"id": pid},
                        "totals": {"total": str(int(total or 0))},
                        "formatted_totals": {"total": _fmt_minor(int(total or 0), currency)},
                    }
                )
    return {"currency_code": currency, "details": {"line_items": line_items}}


def verify_signature(raw_body: bytes, headers: dict) -> bool:
    """Verify a Dodo webhook signature (Standard Webhooks spec).

    Dodo uses the Standard Webhooks spec: three headers (webhook-id,
    webhook-signature, webhook-timestamp). The signed payload is
    ``{webhook-id}.{webhook-timestamp}.{raw_body}`` and the signature is
    HMAC-SHA256, base64-encoded, prefixed with ``v1,``.
    """
    webhook_id = headers.get("webhook-id", "")
    timestamp = headers.get("webhook-timestamp", "")
    signature_header = headers.get("webhook-signature", "")

    if not webhook_id or not timestamp or not signature_header:
        return False
    if not timestamp.isdigit():
        return False
    if abs(int(time.time()) - int(timestamp)) > WEBHOOK_MAX_AGE_S:
        return False

    signed_payload = f"{webhook_id}.{timestamp}.".encode() + raw_body
    expected = hmac.new(
        settings.dodo_webhook_secret.encode(),
        signed_payload,
        hashlib.sha256,
    ).digest()
    expected_b64 = base64.b64encode(expected).decode()

    for sig in signature_header.split(" "):
        parts = sig.split(",", 1)
        if len(parts) == 2 and parts[0] == "v1":
            if hmac.compare_digest(parts[1], expected_b64):
                return True
    return False
