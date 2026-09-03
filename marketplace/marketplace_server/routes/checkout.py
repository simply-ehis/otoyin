"""Checkout API — initiates payment sessions with PayProGlobal."""

from __future__ import annotations

import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
    """Create a checkout session and return the PayProGlobal payment URL.

    Flow:
    1. Client calls POST /v1/checkout with product_id + device_id
    2. Server creates an Order row and a PayProGlobal checkout session
    3. Server returns the checkout_url — client opens it in system browser
    4. User pays → PayProGlobal calls our webhook → server signs license
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
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)

    # Create PayProGlobal checkout session
    checkout_url = await _create_payproglobal_session(order, product)

    return CheckoutResponse(
        order_ref=order_ref,
        checkout_url=checkout_url,
        product_id=req.product_id,
        amount_usd=product.price_usd,
    )


async def _create_payproglobal_session(order: Order, product: Product) -> str:
    """Create a checkout session with PayProGlobal and return the payment URL.

    PayProGlobal API: https://docs.payproglobal.com/
    """
    if not settings.payproglobal_shop_id or not settings.payproglobal_api_key:
        # Dev mode — return a mock checkout URL
        return f"https://checkout.payproglobal.com/dev?order={order.order_ref}"

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.payproglobal.com/v1/orders",
            auth=(settings.payproglobal_shop_id, settings.payproglobal_api_key),
            json={
                "reference": order.order_ref,
                "currency": "USD",
                "amount": int(order.amount_usd * 100),  # cents
                "email": order.email,
                "product_name": product.name,
                "return_url": f"{settings.app_url_scheme}://payment/success?ref={order.order_ref}",
                "cancel_url": f"{settings.app_url_scheme}://payment/cancel?ref={order.order_ref}",
                "webhook_url": "https://marketplace.21labs.app/v1/webhook",
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        order.payment_session_id = data.get("id", "")
        return data.get("checkout_url", f"https://checkout.payproglobal.com/{order.order_ref}")
