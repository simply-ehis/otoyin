"""Stripe checkout service — session creation, webhook handling, license fulfillment.

Uses Stripe Checkout Sessions for one-time payments. After payment,
the webhook handler creates a signed license and makes it available
for the client to poll and install.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import time
import uuid
from typing import Any

logger = logging.getLogger(__name__)

# ── Stripe config (from environment) ───────────────────────────────────
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRICE_MAP: dict[str, str] = json.loads(os.environ.get("STRIPE_PRICE_MAP", "{}"))  # product_id → Stripe price ID
STRIPE_DEV_MODE = os.environ.get("STRIPE_DEV_MODE", "") in ("1", "true", "yes")

# ── In-memory order store (production: use DB) ─────────────────────────
_orders: dict[str, dict[str, Any]] = {}


def _generate_order_ref() -> str:
    return f"ord_{uuid.uuid4().hex[:16]}"


def _sign_license(license_data: dict[str, Any]) -> dict[str, Any]:
    """Sign a license document for offline verification."""
    payload = json.dumps(license_data, sort_keys=True, separators=(",", ":"))
    # HMAC-SHA256 with a secret key
    signing_key = os.environ.get("LICENSE_SIGNING_KEY", "otoyin-dev-signing-key")
    sig = hmac.new(signing_key.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return {
        **license_data,
        "sig": sig,
        "signed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def is_stripe_configured() -> bool:
    """Check if Stripe is properly configured."""
    return bool(STRIPE_SECRET_KEY)


async def create_checkout_session(
    product_id: str,
    device_id: str,
    email: str,
    price_usd: float,
    currency: str = "usd",
    success_url: str | None = None,
    cancel_url: str | None = None,
) -> dict[str, Any]:
    """Create a Stripe Checkout Session.

    Returns a dict with checkout_url and order_ref for the client to redirect to.
    """
    order_ref = _generate_order_ref()

    # Store order for webhook fulfillment
    _orders[order_ref] = {
        "product_id": product_id,
        "device_id": device_id,
        "email": email,
        "price_usd": price_usd,
        "status": "pending",
        "created_at": time.time(),
    }

    # ── Dev mode: simulate checkout without real Stripe ──────────────
    if STRIPE_DEV_MODE or not is_stripe_configured():
        logger.info("[DEV MODE] Simulating checkout for product %s (order %s)", product_id, order_ref)
        _orders[order_ref]["status"] = "paid"
        _orders[order_ref]["paid_at"] = time.time()
        license_data = {
            "product_id": product_id,
            "device_id": device_id,
            "order_ref": order_ref,
            "email": email,
            "amount_usd": price_usd,
            "issued_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "expires_at": "lifetime",
        }
        _orders[order_ref]["license"] = _sign_license(license_data)
        return {
            "order_ref": order_ref,
            "checkout_url": f"https://app.21labs.app/checkout/dev-success?order={order_ref}",
            "product_id": product_id,
            "amount_usd": price_usd,
            "dev_mode": True,
        }

    import stripe

    stripe.api_key = STRIPE_SECRET_KEY

    # Check if we have a pre-configured Stripe Price ID
    stripe_price_id = STRIPE_PRICE_MAP.get(product_id)

    # Build line items
    line_items: list[dict] = []
    if stripe_price_id:
        line_items.append(
            {
                "price": stripe_price_id,
                "quantity": 1,
            }
        )
    else:
        # Dynamic price (for products without pre-configured prices)
        line_items.append(
            {
                "price_data": {
                    "currency": currency,
                    "product_data": {
                        "name": product_id,
                        "metadata": {"product_id": product_id, "order_ref": order_ref},
                    },
                    "unit_amount": int(price_usd * 100),  # Stripe uses cents
                },
                "quantity": 1,
            }
        )

    # Default URLs if not provided
    if not success_url:
        success_url = f"https://app.21labs.app/checkout/success?order={order_ref}"
    if not cancel_url:
        cancel_url = f"https://app.21labs.app/checkout/cancel?order={order_ref}"

    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            line_items=line_items,
            success_url=success_url,
            cancel_url=cancel_url,
            customer_email=email if email else None,
            # Enable Stripe Tax for automatic VAT/GST calculation
            automatic_tax={"enabled": True},
            # Collect customer address for tax determination
            consent_collection={
                "promotions": "auto",
                "terms": "required",
            },
            customer_creation="always",
            metadata={
                "order_ref": order_ref,
                "product_id": product_id,
                "device_id": device_id,
            },
            expires_at=int(time.time()) + 30 * 60,  # 30 min expiry
        )

        _orders[order_ref]["stripe_session_id"] = session.id

        # Extract tax info from session if available
        tax_amount = 0.0
        if hasattr(session, "total_details") and session.total_details:
            tax_amount = getattr(session.total_details, "amount_tax", 0) / 100

        return {
            "order_ref": order_ref,
            "checkout_url": session.url,
            "product_id": product_id,
            "amount_usd": price_usd,
            "tax_amount": round(tax_amount, 2),
            "total_usd": round(price_usd + tax_amount, 2),
            "tax_included": tax_amount > 0,
            "expires_at": session.expires_at,
        }
    except Exception as e:
        logger.error("Stripe session creation failed: %s", e)
        raise ValueError(f"Payment session creation failed: {e}") from e


async def handle_webhook(payload: bytes, sig_header: str) -> dict[str, Any]:
    """Handle a Stripe webhook event.

    Returns the fulfilled license if payment succeeded.
    """
    if not STRIPE_WEBHOOK_SECRET:
        logger.warning("Stripe webhook received but STRIPE_WEBHOOK_SECRET not set")
        # In dev mode, try to parse without verification
        try:
            event = json.loads(payload)
        except json.JSONDecodeError:
            return {"error": "Invalid payload"}
    else:
        import stripe

        stripe.api_key = STRIPE_SECRET_KEY
        try:
            event = stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
        except stripe.error.SignatureVerificationError:
            return {"error": "Invalid signature"}

    event_type = event.get("type", "")
    data = event.get("data", {}).get("object", {})

    if event_type == "checkout.session.completed":
        return await _fulfill_payment(data)
    if event_type == "charge.refunded":
        return await _handle_refund(data)
    logger.debug("Unhandled webhook event: %s", event_type)
    return {"status": "ignored", "event_type": event_type}


async def _fulfill_payment(session_data: dict[str, Any]) -> dict[str, Any]:
    """Fulfill a completed payment by creating a signed license."""
    metadata = session_data.get("metadata", {})
    order_ref = metadata.get("order_ref", "")
    product_id = metadata.get("product_id", "")
    device_id = metadata.get("device_id", "")

    order = _orders.get(order_ref)
    if order is None:
        # Try to find by Stripe session ID
        stripe_session_id = session_data.get("id", "")
        for ref, o in _orders.items():
            if o.get("stripe_session_id") == stripe_session_id:
                order = o
                order_ref = ref
                break

    if order is None:
        logger.error("Order not found for session: %s", session_data.get("id"))
        return {"error": "Order not found"}

    # Update order status
    order["status"] = "paid"
    order["paid_at"] = time.time()
    order["stripe_session_id"] = session_data.get("id")

    # Create signed license
    license_data = {
        "product_id": product_id,
        "device_id": device_id,
        "order_ref": order_ref,
        "email": order.get("email", ""),
        "amount_usd": order.get("price_usd", 0),
        "issued_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "expires_at": "lifetime",  # Perpetual license
    }
    signed_license = _sign_license(license_data)

    # Store the license for client polling
    order["license"] = signed_license

    logger.info("License fulfilled for order %s (product: %s)", order_ref, product_id)

    return {
        "status": "fulfilled",
        "order_ref": order_ref,
        "license": signed_license,
    }


async def _handle_refund(charge_data: dict[str, Any]) -> dict[str, Any]:
    """Handle a refund by revoking the license."""
    metadata = charge_data.get("metadata", {})
    order_ref = metadata.get("order_ref", "")

    order = _orders.get(order_ref)
    if order:
        order["status"] = "refunded"
        order["license"] = None
        logger.info("License revoked for order %s (refund)", order_ref)

    return {"status": "revoked", "order_ref": order_ref}


async def poll_license(order_ref: str) -> dict[str, Any] | None:
    """Poll for a license after checkout.

    Returns the signed license if ready, None if still pending.
    """
    order = _orders.get(order_ref)
    if order is None:
        return None

    if order["status"] == "paid" and "license" in order:
        return order["license"]

    return None


def get_order_status(order_ref: str) -> dict[str, Any] | None:
    """Get the current status of an order."""
    order = _orders.get(order_ref)
    if order is None:
        return None
    return {
        "order_ref": order_ref,
        "status": order["status"],
        "product_id": order.get("product_id"),
        "amount_usd": order.get("price_usd"),
    }
