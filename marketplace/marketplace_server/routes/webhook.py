"""Webhook handler — receives Paddle Billing events and signs licenses."""

from __future__ import annotations

import datetime as dt
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import paddle
from ..config import settings
from ..models import License, Order, Product, async_session
from ..signing import get_signer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/webhook", tags=["webhook"])


async def get_db():
    async with async_session() as session:
        yield session


async def fulfill_order(order: Order, db: AsyncSession, provider_txn_id: str) -> dict:
    """Mark an order paid, sign its license, store it. Idempotent."""
    if order.status == "paid":
        return {"status": "ok", "message": "Already processed"}

    order.status = "paid"
    order.paid_at = dt.datetime.now(dt.UTC)
    if provider_txn_id and provider_txn_id != "dev":
        order.payment_session_id = provider_txn_id

    product_result = await db.execute(select(Product).where(Product.id == order.product_id))
    product = product_result.scalar_one_or_none()

    entitlements = [f"models:{order.product_id}"]
    if product and product.category == "extras":
        entitlements.append(f"extras:{order.product_id}")

    signer = get_signer()
    signed_license = signer.sign_license(
        product_id=order.product_id,
        device_id=order.device_id,
        purchaser=order.email or order.order_ref,
        entitlements=entitlements,
    )
    db.add(
        License(
            order_id=order.id,
            product_id=order.product_id,
            device_id=order.device_id,
            purchaser=order.email or order.order_ref,
            entitlements=json.dumps(entitlements),
            signed_license=signed_license,
        )
    )
    await db.commit()
    logger.info("License fulfilled for order %s (product: %s)", order.order_ref, order.product_id)
    return {"status": "ok", "order_ref": order.order_ref, "product_id": order.product_id}


@router.post("")
async def handle_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Paddle Billing webhook.

    Verifies ``Paddle-Signature`` against the RAW body, then dispatches:
    ``transaction.completed`` → fulfill; ``transaction.canceled`` /
    ``transaction.payment_failed`` → mark; ``adjustment.created`` with a
    refund action → revoke. Anything else is acknowledged and ignored.
    Responds 2xx fast — Paddle treats anything else as delivery failure.
    """
    raw_body = await request.body()
    signature = request.headers.get("Paddle-Signature", "")

    if settings.paddle_webhook_secret:
        if not paddle.verify_signature(raw_body, signature):
            raise HTTPException(401, detail={"code": "invalid_signature", "message": "Webhook signature invalid"})
    else:
        logger.warning("Paddle webhook accepted without signature (no webhook secret configured)")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(400, detail={"code": "invalid_payload", "message": "Invalid JSON payload"}) from None

    event_type = event.get("event_type", "")
    data = event.get("data", {})
    custom = data.get("custom_data") or {}

    if event_type == "transaction.completed":
        order = await _find_order(db, custom.get("order_ref", ""), data.get("id", ""))
        if order is None:
            raise HTTPException(404, detail={"code": "order_not_found", "message": "Order not found for transaction"})
        return await fulfill_order(order, db, provider_txn_id=data.get("id", ""))

    if event_type in ("transaction.canceled", "transaction.payment_failed"):
        order = await _find_order(db, custom.get("order_ref", ""), data.get("id", ""))
        if order is not None and order.status == "pending":
            order.status = "canceled" if event_type == "transaction.canceled" else "failed"
            await db.commit()
        return {"status": "ok", "message": f"Order marked {order.status if order else 'unknown'}"}

    if event_type == "adjustment.created" and (data.get("action") or "") == "refund":
        order = await _find_order(db, (data.get("custom_data") or {}).get("order_ref", ""), "")
        if order is None and data.get("transaction_id"):
            # Adjustments don't always echo custom_data — fall back to the
            # original transaction link.
            order = await _find_order(db, "", data["transaction_id"])
        if order is not None:
            order.status = "refunded"
            await db.commit()
            logger.info("License revoked for order %s (refund)", order.order_ref)
            return {"status": "ok", "message": "License revoked"}
        return {"status": "ok", "message": "Refund for unknown order"}

    logger.debug("Unhandled Paddle event: %s", event_type)
    return {"status": "ignored", "event_type": event_type}


async def _find_order(db: AsyncSession, order_ref: str, txn_id: str) -> Order | None:
    if order_ref:
        result = await db.execute(select(Order).where(Order.order_ref == order_ref))
        order = result.scalar_one_or_none()
        if order is not None:
            return order
    if txn_id:
        result = await db.execute(select(Order).where(Order.payment_session_id == txn_id))
        return result.scalar_one_or_none()
    return None


@router.get("/license/{order_ref}")
async def get_license(order_ref: str, db: AsyncSession = Depends(get_db)):
    """Fetch a signed license by order reference.

    Clients call this after payment to retrieve their license.
    """
    result = await db.execute(select(Order).where(Order.order_ref == order_ref))
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(404, detail={"code": "order_not_found", "message": f"Order '{order_ref}' not found"})
    if order.status != "paid":
        raise HTTPException(402, detail={"code": "not_paid", "message": f"Order '{order_ref}' has not been paid yet"})

    license_result = await db.execute(select(License).where(License.order_id == order.id))
    license_record = license_result.scalar_one_or_none()
    if license_record is None:
        raise HTTPException(500, detail={"code": "license_missing", "message": "License not found for paid order"})

    return json.loads(license_record.signed_license)
