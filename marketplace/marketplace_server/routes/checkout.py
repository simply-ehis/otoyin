"""Checkout API — initiates Paddle Billing payment sessions."""

from __future__ import annotations

import datetime as dt
import logging
import uuid
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import paddle
from ..config import settings
from ..models import Order, Product, async_session, hash_email
from ..rate_limit import checkout_limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/checkout", tags=["checkout"])


class CheckoutRequest(BaseModel):
    product_id: str = Field(min_length=1, max_length=128)
    device_id: str = Field(min_length=1, max_length=128)
    email: str = Field(default="", max_length=256)


class CheckoutResponse(BaseModel):
    order_ref: str
    checkout_url: str
    product_id: str
    amount_usd: float


async def get_db():
    async with async_session() as session:
        yield session


@router.post("", response_model=CheckoutResponse)
async def create_checkout(req: CheckoutRequest, request: Request, db: AsyncSession = Depends(get_db)):
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
    # Rate limit: 10 requests/min per IP (see rate_limit.checkout_limiter)
    client_ip = request.client.host if request.client else "unknown"
    if not checkout_limiter.allow(f"checkout:{client_ip}"):
        raise HTTPException(
            429, detail={"code": "rate_limited", "message": "Too many checkout requests — try again later"}
        )
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

    # Idempotency: reuse a recent pending order for the same product+device
    cutoff = dt.datetime.now(dt.UTC) - dt.timedelta(minutes=10)
    result = await db.execute(
        select(Order).where(
            and_(
                Order.product_id == req.product_id,
                Order.device_id == req.device_id,
                Order.status == "pending",
                Order.created_at >= cutoff,
            )
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None:
        if not paddle.is_configured():
            if settings.debug:
                # Dev mode fulfills immediately (same as the create branch
                # below) — otherwise a retried checkout would poll a
                # pending order forever.
                from .webhook import fulfill_order

                await fulfill_order(existing, db, provider_txn_id="dev")
            return CheckoutResponse(
                order_ref=existing.order_ref,
                checkout_url=f"{settings.app_url_scheme}://payment/success?ref={existing.order_ref}",
                product_id=req.product_id,
                amount_usd=product.price_usd,
            )
        # Re-fetch from Paddle to get the checkout URL
        try:
            txn = await paddle.get_transaction(existing.payment_session_id)
            return CheckoutResponse(
                order_ref=existing.order_ref,
                checkout_url=txn["checkout_url"],
                product_id=req.product_id,
                amount_usd=product.price_usd,
            )
        except RuntimeError as exc:
            logger.debug("Idempotent checkout re-fetch failed for %s: %s", existing.order_ref, exc)
            pass  # Fall through and create a new order

    # Create order — new refs use the otoyin_ namespace. Rows created under
    # the legacy 21labs_ prefix stay valid: lookups match the full string.
    order_ref = f"otoyin_{uuid.uuid4().hex[:16]}"
    order = Order(
        order_ref=order_ref,
        product_id=req.product_id,
        device_id=req.device_id,
        email=hash_email(req.email),
        status="pending",
        amount_usd=product.price_usd,
        payment_provider="paddle",
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)

    if not paddle.is_configured():
        if not settings.debug:
            raise HTTPException(
                503,
                detail={"code": "payment_not_configured", "message": "Payments are not configured on this server"},
            )
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
    device_id: str = Field(min_length=1, max_length=128)
    email: str = Field(default="", max_length=256)
    amount_usd: Decimal = Field(gt=0, le=10000)


class DonateResponse(BaseModel):
    order_ref: str
    checkout_url: str
    amount_usd: float
    donation: bool = True


@router.post("/donate", response_model=DonateResponse)
async def create_donation(req: DonateRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Start a custom-amount donation. Same browser→poll loop as checkout,
    but fulfillment records the gift without minting a license."""
    # Rate limit: 10 requests/min per IP (see rate_limit.checkout_limiter)
    client_ip = request.client.host if request.client else "unknown"
    if not checkout_limiter.allow(f"checkout:{client_ip}"):
        raise HTTPException(
            429, detail={"code": "rate_limited", "message": "Too many checkout requests — try again later"}
        )
    try:
        amount = Decimal(str(req.amount_usd)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        raise HTTPException(400, detail={"code": "bad_amount", "message": "amount_usd must be a number"})
    if not (MIN_DONATION_USD <= amount <= MAX_DONATION_USD):
        raise HTTPException(
            400,
            detail={
                "code": "bad_amount",
                "message": f"Donations must be between ${MIN_DONATION_USD:.0f} and ${MAX_DONATION_USD:.0f}.",
            },
        )
    amount_cents = int((amount * 100).to_integral_value(rounding=ROUND_HALF_UP))

    order_ref = f"otoyin_{uuid.uuid4().hex[:16]}"
    order = Order(
        order_ref=order_ref,
        product_id=DONATION_PRODUCT_ID,
        device_id=req.device_id,
        email=hash_email(req.email),
        status="pending",
        amount_usd=amount_cents / 100,
        payment_provider="paddle",
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)

    if not paddle.is_configured():
        if not settings.debug:
            raise HTTPException(
                503,
                detail={"code": "payment_not_configured", "message": "Payments are not configured on this server"},
            )
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
