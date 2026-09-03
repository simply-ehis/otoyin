"""Webhook handler — receives payment confirmations from PayProGlobal and signs licenses."""

from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models import License, Order, Product, async_session
from ..signing import get_signer

router = APIRouter(prefix="/v1/webhook", tags=["webhook"])


async def get_db():
    async with async_session() as session:
        yield session


def _verify_webhook_signature(payload: bytes, signature: str, secret: str) -> bool:
    """Verify PayProGlobal webhook HMAC-SHA256 signature."""
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.post("")
async def handle_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """PayProGlobal webhook — called when a payment completes.

    1. Verify the webhook signature
    2. Find the order by reference
    3. Sign a license with Ed25519
    4. Store the license
    5. Return 200 OK
    """
    body = await request.body()
    signature = request.headers.get("X-Webhook-Signature", "")

    # Verify signature in production
    if settings.payproglobal_webhook_secret and signature:
        if not _verify_webhook_signature(body, signature, settings.payproglobal_webhook_secret):
            raise HTTPException(401, detail={"code": "invalid_signature", "message": "Webhook signature invalid"})

    payload = json.loads(body)

    # Extract order reference from webhook
    order_ref = payload.get("reference", "")
    if not order_ref:
        raise HTTPException(400, detail={"code": "missing_reference", "message": "No order reference in webhook"})

    # Find order
    result = await db.execute(select(Order).where(Order.order_ref == order_ref))
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(404, detail={"code": "order_not_found", "message": f"Order '{order_ref}' not found"})

    # Check if already processed
    if order.status == "paid":
        return {"status": "ok", "message": "Already processed"}

    # Update order status
    order.status = "paid"
    order.paid_at = dt.datetime.now(dt.UTC)

    # Get product for entitlements
    product_result = await db.execute(select(Product).where(Product.id == order.product_id))
    product = product_result.scalar_one_or_none()

    # Build entitlements
    entitlements = [f"models:{order.product_id}"]
    if product and product.category == "extras":
        entitlements.append(f"extras:{order.product_id}")

    # Sign the license
    signer = get_signer()
    signed_license = signer.sign_license(
        product_id=order.product_id,
        device_id=order.device_id,
        purchaser=order.email or order.order_ref,
        entitlements=entitlements,
    )

    # Store the license
    license_record = License(
        order_id=order.id,
        product_id=order.product_id,
        device_id=order.device_id,
        purchaser=order.email or order.order_ref,
        entitlements=json.dumps(entitlements),
        signed_license=signed_license,
    )
    db.add(license_record)
    await db.commit()

    return {"status": "ok", "order_ref": order_ref, "product_id": order.product_id}


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
