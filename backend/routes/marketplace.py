"""Marketplace endpoints: license install/verify, catalog, entitlements,
e checkout, currency conversion, and region detection.

Implements docs/MARKETPLACE_PLAN.md §3 (offline licensing) and P1
(in-app marketplace surface + signed catalog).  All verification is
local — no network required.
"""

from __future__ import annotations

import asyncio
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
async def get_catalog() -> dict:
    """Return the signed product catalog (prices per docs/PRICING_PLAN.md)."""
    from ..utils.startup_defer import ensure_catalog_started

    await ensure_catalog_started()
    catalog = build_catalog()
    if not verify_catalog(catalog):
        raise HTTPException(status_code=500, detail="Catalog failed self-verification")
    _annotate_local_status(catalog.get("products", []))
    return catalog


@router.post("/marketplace/catalog/refresh")
async def refresh_catalog(force: bool = False) -> dict:
    """Nudge a remote-catalog refresh; ``force=true`` bypasses the stale gate.

    The Store calls this when it opens so newly published models appear
    without an app restart. It is cheap when fresh: the fetch runs in a
    worker thread only when ``refresh_remote_catalog_if_stale`` decides the
    last successful refresh is older than ``OTOYIN_CATALOG_REFRESH_S``
    (default 24h) — otherwise it returns immediately with no network I/O.
    The manual "Check for updates" action in the Store hero sends
    ``force=true`` to fetch regardless of staleness; still offline-first,
    so a missing ``OTOYIN_CATALOG_URL`` or any failure keeps the bundled
    catalog and reports ``refreshed: false``.

    Returns ``refreshed`` so the caller can refetch the catalog when new
    products actually arrived, plus ``reason`` (``None`` on success,
    otherwise ``fresh`` | ``no_url`` | ``failed``) so the Store can surface
    genuine fetch failures with a subtle hint instead of failing silently.
    """
    from ..services.marketplace_catalog import refresh_remote_catalog_if_stale

    code = await asyncio.to_thread(refresh_remote_catalog_if_stale, force)
    return {"refreshed": code == "refreshed", "reason": None if code == "refreshed" else code}


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


# ── Payments live in the standalone marketplace service ──────────────
# Checkout + fulfillment moved to marketplace/marketplace_server (Paddle
# Billing). This backend keeps offline licensing only (install/verify).
# The old Stripe checkout/webhook/poll endpoints and local tax preview
# were removed 2026-09-04 — Paddle is the Merchant of Record, so tax is
# calculated by Paddle at checkout, not here.


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
