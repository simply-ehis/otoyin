"""Marketplace endpoints: license install/verify, catalog, entitlements,
e checkout, currency conversion, and region detection.

Implements docs/MARKETPLACE_PLAN.md §3 (offline licensing) and P1
(in-app marketplace surface + signed catalog).  All verification is
local — no network required.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.licensing import (
    active_entitlements,
    delete_license,
    entitlement_for_product,
    install_license,
    list_licenses,
)
from ..services.marketplace_catalog import build_catalog, get_product, verify_catalog
from ..services.marketplace_offers import get_active_offers

logger = logging.getLogger(__name__)

router = APIRouter()


class LicenseInstallRequest(BaseModel):
    license: dict


class LicenseVerifyRequest(BaseModel):
    product_id: str


def _annotate_local_status(products: list[dict]) -> None:
    """Add per-product ``local_status`` (cached | not_downloaded) in place.

    Response-only enrichment — the signed catalog document itself is never
    mutated, so signatures stay valid. See
    ``services.model_registry.local_status_for`` for the semantics.
    """
    from ..services.model_registry import local_status_for

    for product in products:
        product["local_status"] = local_status_for(product.get("id", ""))


@router.get("/marketplace/catalog")
def get_catalog() -> dict:
    """Return the signed product catalog (prices per docs/PRICING_PLAN.md)."""
    catalog = build_catalog()
    if not verify_catalog(catalog):
        raise HTTPException(status_code=500, detail="Catalog failed self-verification")
    _annotate_local_status(catalog.get("products", []))
    return catalog


@router.get("/marketplace/entitlements")
def get_entitlements(db: Session = Depends(get_db)) -> dict:
    """List all entitlements currently granted by installed licenses."""
    return {"entitlements": sorted(active_entitlements(db))}


@router.get("/marketplace/offers")
def get_offers() -> dict:
    """Return active special offers (products flagged ``special_offer``)."""
    return {"offers": get_active_offers()}


@router.get("/marketplace/licenses")
def get_licenses(db: Session = Depends(get_db)) -> dict:
    """List installed licenses with validity status."""
    return {"licenses": list_licenses(db)}


@router.post("/marketplace/license")
def post_license(request: LicenseInstallRequest, db: Session = Depends(get_db)) -> dict:
    """Install (verify + persist) a signed license document."""
    try:
        row = install_license(db, request.license)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"id": row.id, "product": row.product, "message": "License installed"}


@router.delete("/marketplace/licenses/{license_id}")
def remove_license(license_id: str, db: Session = Depends(get_db)) -> dict:
    """Remove an installed license."""
    if not delete_license(db, license_id):
        raise HTTPException(status_code=404, detail="License not found")
    return {"message": "License removed"}


@router.post("/marketplace/verify")
def verify_product(request: LicenseVerifyRequest, db: Session = Depends(get_db)) -> dict:
    """Check whether a product id is licensed on this device."""
    product = get_product(request.product_id)
    if product is None:
        # Unknown product id: never block an unlisted (free) model.
        return {"product_id": request.product_id, "licensed": True, "known": False}
    if not product.get("paid", False):
        return {"product_id": request.product_id, "licensed": True, "known": True}
    licensed = entitlement_for_product(request.product_id) in active_entitlements(db)
    return {"product_id": request.product_id, "licensed": licensed, "known": True}


# ── Stripe Checkout ────────────────────────────────────────────────────


class CheckoutRequest(BaseModel):
    product_id: str
    device_id: str
    email: str = ""
    currency: str | None = None  # override region currency


@router.post("/marketplace/checkout")
async def create_checkout(request: CheckoutRequest, req: Request) -> dict:
    """Create a Stripe Checkout Session and return the payment URL."""
    from ..services.checkout import (
        STRIPE_DEV_MODE,
        create_checkout_session,
        is_stripe_configured,
    )

    if not STRIPE_DEV_MODE and not is_stripe_configured():
        raise HTTPException(
            status_code=501,
            detail={
                "message": "Stripe is not configured. Set STRIPE_SECRET_KEY.",
                "code": "stripe_not_configured",
            },
        )

    product = get_product(request.product_id)
    if product is None:
        raise HTTPException(status_code=404, detail={"message": "Product not found"})
    if not product.get("paid", False):
        raise HTTPException(status_code=400, detail={"message": "Product is free"})

    price_usd = product.get("price_usd", 0)
    if price_usd <= 0:
        raise HTTPException(status_code=400, detail={"message": "Invalid price"})

    try:
        result = await create_checkout_session(
            product_id=request.product_id,
            device_id=request.device_id,
            email=request.email,
            price_usd=price_usd,
            currency=request.currency or "usd",
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"message": str(e)}) from e


@router.post("/marketplace/webhook/stripe")
async def stripe_webhook(request: Request) -> dict:
    """Handle Stripe webhook for payment fulfillment."""
    from ..services.checkout import handle_webhook

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    return await handle_webhook(payload, sig_header)


@router.get("/marketplace/license/{order_ref}")
async def poll_license(order_ref: str) -> dict:
    """Poll for a signed license after checkout."""
    from ..services.checkout import poll_license as _poll

    license_data = await _poll(order_ref)
    if license_data is None:
        raise HTTPException(status_code=402, detail={"message": "Payment pending"})
    return license_data


# ── Region & Currency ──────────────────────────────────────────────────


@router.get("/marketplace/region")
async def detect_region(request: Request) -> dict:
    """Detect user region via IP geolocation and return local currency."""
    from ..services.currency import detect_region

    client_ip = request.client.host if request.client else None
    return await detect_region(client_ip)


class ConvertPriceRequest(BaseModel):
    amount_usd: float
    currency: str


@router.post("/marketplace/convert-price")
async def convert_price(request: ConvertPriceRequest) -> dict:
    """Convert a USD price to the user's local currency."""
    from ..services.currency import convert_price as _convert

    return await _convert(request.amount_usd, request.currency)


# ── Tax Calculation ─────────────────────────────────────────────────


class TaxPreviewRequest(BaseModel):
    amount_usd: float
    country_code: str
    product_id: str = ""


@router.post("/marketplace/tax/preview")
async def tax_preview(request: TaxPreviewRequest) -> dict:
    """Preview tax calculation for a product before checkout.

    Returns tax amount, rate, and total. Used by the frontend to show
    the customer what tax they'll pay before they commit to checkout.
    """
    from ..services.tax import calculate_tax_locally

    return calculate_tax_locally(request.amount_usd, request.country_code)


@router.get("/marketplace/tax/jurisdictions")
def tax_jurisdictions() -> dict:
    """List all supported tax jurisdictions with their rates."""
    from ..services.tax import get_all_tax_jurisdictions

    return {"jurisdictions": get_all_tax_jurisdictions()}


@router.get("/marketplace/tax/summary/{country_code}")
def tax_summary(country_code: str) -> dict:
    """Get tax summary for a specific country."""
    from ..services.tax import get_tax_summary

    return get_tax_summary(country_code)


# ── Reviews ────────────────────────────────────────────────────────


@router.get("/marketplace/product/{product_id}/reviews")
def get_reviews(product_id: str) -> dict:
    """Get reviews for a product."""
    from ..services.marketplace_catalog import get_product_reviews

    return {"reviews": get_product_reviews(product_id)}


class ReviewRequest(BaseModel):
    rating: int
    comment: str = ""
    device_id: str = ""


@router.post("/marketplace/product/{product_id}/reviews")
async def post_review(product_id: str, data: ReviewRequest) -> dict:
    """Submit a review for a product."""
    from ..services.marketplace_catalog import add_product_review

    if not (1 <= data.rating <= 5):
        raise HTTPException(status_code=400, detail="Rating must be 1-5")

    add_product_review(product_id, data.rating, data.comment, data.device_id)
    return {"message": "Review submitted"}


# ── Wishlist ───────────────────────────────────────────────────────────


@router.get("/marketplace/wishlist")
def get_wishlist(device_id: str = "") -> dict:
    """Get wishlist for a device."""
    from ..services.marketplace_catalog import get_device_wishlist

    return {"product_ids": get_device_wishlist(device_id)}


@router.post("/marketplace/wishlist/{product_id}")
def add_wishlist(product_id: str, device_id: str = "") -> dict:
    """Add a product to wishlist."""
    from ..services.marketplace_catalog import add_to_wishlist

    add_to_wishlist(product_id, device_id)
    return {"message": "Added to wishlist"}


@router.delete("/marketplace/wishlist/{product_id}")
def remove_wishlist(product_id: str, device_id: str = "") -> dict:
    """Remove a product from wishlist."""
    from ..services.marketplace_catalog import remove_from_wishlist

    remove_from_wishlist(product_id, device_id)
    return {"message": "Removed from wishlist"}


# ── Catalog with local prices ──────────────────────────────────────────


@router.get("/marketplace/catalog/local")
async def get_local_catalog(request: Request) -> dict:
    """Return the catalog with region-aware local prices."""
    from ..services.currency import convert_price as _convert, detect_region

    client_ip = request.client.host if request.client else None
    region = await detect_region(client_ip)
    target_currency = region["currency"]

    catalog = build_catalog()
    if not verify_catalog(catalog):
        raise HTTPException(status_code=500, detail="Catalog failed self-verification")

    _annotate_local_status(catalog.get("products", []))

    # Add local prices to each product
    products = catalog.get("products", [])
    for product in products:
        price_usd = product.get("price_usd", 0)
        if price_usd > 0 and target_currency != "USD":
            local = await _convert(price_usd, target_currency)
            product["local_price"] = local["amount"]
            product["local_currency"] = local["currency"]
            product["local_formatted"] = local["formatted"]
            # Also convert offer price if applicable
            if product.get("offer_discount_pct", 0) > 0:
                offer_usd = price_usd * (1 - product["offer_discount_pct"] / 100)
                offer_local = await _convert(offer_usd, target_currency)
                product["offer_local_price"] = offer_local["amount"]
                product["offer_local_formatted"] = offer_local["formatted"]
        else:
            product["local_price"] = price_usd
            product["local_currency"] = "USD"
            product["local_formatted"] = f"${price_usd:.2f}"

    catalog["region"] = region
    return catalog
