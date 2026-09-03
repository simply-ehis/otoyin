"""Region-specific pricing API endpoints.

Allows administrators to set different prices for products in different
countries/regions. Used by the pricing admin page.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()


class SetRegionPriceRequest(BaseModel):
    product_id: str
    country_code: str
    price_usd: float
    note: str = ""


class BulkSetPricesRequest(BaseModel):
    prices: list[SetRegionPriceRequest]


@router.get("/marketplace/pricing/summary")
def get_pricing_summary() -> dict:
    """Get a summary of all region-specific pricing."""
    from ..services.region_pricing import get_pricing_summary as _summary

    return _summary()


@router.get("/marketplace/pricing/{product_id}")
def get_product_region_prices(product_id: str) -> dict:
    """Get all region prices for a specific product."""
    from ..services.region_pricing import get_all_prices_for_product

    prices = get_all_prices_for_product(product_id)
    return {
        "product_id": product_id,
        "region_prices": prices,
    }


@router.get("/marketplace/pricing")
def list_all_region_prices(product_id: str | None = None) -> dict:
    """List all region-specific price overrides."""
    from ..services.region_pricing import list_region_prices

    prices = list_region_prices(product_id)
    return {"prices": prices, "count": len(prices)}


@router.post("/marketplace/pricing")
def set_region_price(request: SetRegionPriceRequest) -> dict:
    """Set a region-specific price for a product."""
    from ..services.region_pricing import set_region_price

    if request.price_usd < 0:
        raise HTTPException(status_code=400, detail="Price cannot be negative")

    result = set_region_price(
        product_id=request.product_id,
        country_code=request.country_code,
        price_usd=request.price_usd,
        note=request.note,
    )
    return {"message": "Price set", "price": result}


@router.post("/marketplace/pricing/bulk")
def bulk_set_prices(request: BulkSetPricesRequest) -> dict:
    """Bulk set region-specific prices."""
    from ..services.region_pricing import bulk_set_prices

    prices_data = [
        {
            "product_id": p.product_id,
            "country_code": p.country_code,
            "price_usd": p.price_usd,
            "note": p.note,
        }
        for p in request.prices
    ]

    count = bulk_set_prices(prices_data)
    return {"message": f"Set {count} prices", "count": count}


@router.delete("/marketplace/pricing/{product_id}/{country_code}")
def delete_region_price(product_id: str, country_code: str) -> dict:
    """Delete a region-specific price override."""
    from ..services.region_pricing import delete_region_price

    deleted = delete_region_price(product_id, country_code)
    if not deleted:
        raise HTTPException(status_code=404, detail="Price override not found")

    return {"message": "Price deleted"}


@router.get("/marketplace/pricing/countries")
def list_countries() -> dict:
    """List all countries that have price overrides."""
    from ..services.region_pricing import get_pricing_summary

    summary = get_pricing_summary()
    return {"countries": summary["countries"]}


@router.get("/marketplace/pricing/products")
def list_products_with_overrides() -> dict:
    """List all products that have price overrides."""
    from ..services.region_pricing import get_pricing_summary

    summary = get_pricing_summary()
    return {"products": summary["products"]}
