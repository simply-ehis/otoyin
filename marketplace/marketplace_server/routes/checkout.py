"""Checkout API — initiates Paddle Billing payment sessions."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import paddle
from ..config import settings
from ..models import Order, Product, async_session

router = APIRouter(prefix="/v1/checkout", tags=["checkout"])


class CheckoutRequest(BaseModel):
    product_id: str
    device_id: str
    email: str = ""


class CheckoutResponse(BaseModel):
    order_ref: str
    checkout_url: str
    product_id: str
    amount_usd: float


async def get_db():
    async with async_session() as session:
        yield session


@router.post("", response_model=CheckoutResponse)
async def create_checkout(req: CheckoutRequest, db: AsyncSession = Depends(get_db)):
    """Create a Paddle transaction and return its checkout URL.

    Flow:
    1. Client calls POST /v1/checkout with product_id + device_id
    2. Server creates an Order row and a Paddle transaction
    3. Server returns the checkout_url — client opens it in system browser
    4. User pays → Paddle calls our webhook → server signs license

    Dev mode (no ``MARKETPLACE_PADDLE_API_KEY``): the order is fulfilled
    immediately and the checkout URL deep-links back into the app, so the
    full buy → poll → install loop works with no provider account.
    """
    # Verify product exists and is paid
    result = await db.execute(select(Product).where(Product.id == req.product_id))
    product = result.scalar_one_or_none()
    if product is None:
        raise HTTPException(
            404, detail={"code": "product_not_found", "message": f"Product '{req.product_id}' not found"}
        )
    if not product.paid:
        raise HTTPException(
            400, detail={"code": "product_free", "message": f"Product '{req.product_id}' is free — no checkout needed"}
        )

    # Create order — new refs use the otoyin_ namespace. Rows created under
    # the legacy 21labs_ prefix stay valid: lookups match the full string.
    order_ref = f"otoyin_{uuid.uuid4().hex[:16]}"
    order = Order(
        order_ref=order_ref,
        product_id=req.product_id,
        device_id=req.device_id,
        email=req.email,
        status="pending",
        amount_usd=product.price_usd,
        payment_provider="paddle",
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)

    if not paddle.is_configured():
        from .webhook import fulfill_order

        await fulfill_order(order, db, provider_txn_id="dev")
        return CheckoutResponse(
            order_ref=order_ref,
            checkout_url=f"{settings.app_url_scheme}://payment/success?ref={order_ref}",
            product_id=req.product_id,
            amount_usd=product.price_usd,
        )

    price_id = paddle.price_id_for(req.product_id)
    if not price_id:
        raise HTTPException(
            500,
            detail={
                "code": "price_not_configured",
                "message": (
                    f"Product '{req.product_id}' has no Paddle price — create it in the "
                    "Paddle dashboard and set MARKETPLACE_PADDLE_PRICE_MAP."
                ),
            },
        )
    try:
        txn = await paddle.create_transaction(
            order_ref=order_ref,
            product_id=req.product_id,
            device_id=req.device_id,
            email=req.email,
            price_id=price_id,
        )
    except RuntimeError as exc:
        raise HTTPException(502, detail={"code": "provider_error", "message": str(exc)}) from exc

    order.payment_session_id = txn["transaction_id"]
    await db.commit()
    return CheckoutResponse(
        order_ref=order_ref,
        checkout_url=txn["checkout_url"],
        product_id=req.product_id,
        amount_usd=product.price_usd,
    )


# ── Donations ────────────────────────────────────────────────────────
# Deliberate scope call: donations are NOT catalog products. A fixed-price
# catalog row can't express "pay what you want", and stuffing a magic
# $0/$1 product into the catalog would confuse pricing, offers, and the
# store grid. Donations use non-catalog Paddle pricing inline (zero
# dashboard setup) and mint NO license — the thank-you is the product.

DONATION_PRODUCT_ID = "donation"
MIN_DONATION_USD = 1.0
MAX_DONATION_USD = 10000.0


class DonateRequest(BaseModel):
    device_id: str
    email: str = ""
    amount_usd: float


class DonateResponse(BaseModel):
    order_ref: str
    checkout_url: str
    amount_usd: float
    donation: bool = True


@router.post("/donate", response_model=DonateResponse)
async def create_donation(req: DonateRequest, db: AsyncSession = Depends(get_db)):
    """Start a custom-amount donation. Same browser→poll loop as checkout,
    but fulfillment records the gift without minting a license."""
    try:
        amount = float(req.amount_usd)
    except (TypeError, ValueError):
        raise HTTPException(400, detail={"code": "bad_amount", "message": "amount_usd must be a number"})
    if not (MIN_DONATION_USD <= amount <= MAX_DONATION_USD):
        raise HTTPException(
            400,
            detail={
                "code": "bad_amount",
                "message": f"Donations must be between ${MIN_DONATION_USD:.0f} and ${MAX_DONATION_USD:.0f}.",
            },
        )
    amount_cents = int(round(amount * 100))

    order_ref = f"otoyin_{uuid.uuid4().hex[:16]}"
    order = Order(
        order_ref=order_ref,
        product_id=DONATION_PRODUCT_ID,
        device_id=req.device_id,
        email=req.email,
        status="pending",
        amount_usd=amount_cents / 100,
        payment_provider="paddle",
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)

    if not paddle.is_configured():
        from .webhook import fulfill_order

        await fulfill_order(order, db, provider_txn_id="dev")
        return DonateResponse(
            order_ref=order_ref,
            checkout_url=f"{settings.app_url_scheme}://payment/success?ref={order_ref}",
            amount_usd=order.amount_usd,
        )

    try:
        txn = await paddle.create_donation_transaction(
            order_ref=order_ref,
            device_id=req.device_id,
            email=req.email,
            amount_cents=amount_cents,
        )
    except RuntimeError as exc:
        raise HTTPException(502, detail={"code": "provider_error", "message": str(exc)}) from exc

    order.payment_session_id = txn["transaction_id"]
    await db.commit()
    return DonateResponse(
        order_ref=order_ref,
        checkout_url=txn["checkout_url"],
        amount_usd=order.amount_usd,
    )
