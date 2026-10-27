"""Region-specific pricing service.

Allows setting different prices for products in different countries/regions.
Uses a JSON file for storage (production: use database).

Pricing hierarchy:
1. Region-specific price (if set for product + country)
2. Global price (product.price_usd)
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ── Storage ────────────────────────────────────────────────────────────
_data_dir = Path(os.environ.get("TWENTYLABS_DATA_DIR", "data"))
_pricing_file = _data_dir / "region_pricing.json"

# ── In-memory cache ────────────────────────────────────────────────────
_cache: dict[str, Any] = {}
_cache_loaded = False


def _ensure_data_dir():
    """Ensure data directory exists."""
    _data_dir.mkdir(parents=True, exist_ok=True)


def _load_cache():
    """Load pricing data from file."""
    global _cache, _cache_loaded
    if _cache_loaded:
        return

    _ensure_data_dir()
    if _pricing_file.exists():
        try:
            with open(_pricing_file, encoding="utf-8") as f:
                _cache = json.load(f)
        except (OSError, json.JSONDecodeError) as e:
            logger.warning("Failed to load region pricing: %s", e)
            _cache = {}
    else:
        _cache = {}

    _cache_loaded = True


def _save_cache():
    """Save pricing data to file."""
    _ensure_data_dir()
    try:
        with open(_pricing_file, "w", encoding="utf-8") as f:
            json.dump(_cache, f, indent=2)
    except OSError as e:
        logger.error("Failed to save region pricing: %s", e)


def get_region_price(product_id: str, country_code: str) -> dict[str, Any] | None:
    """Get the region-specific price for a product in a country.

    Returns dict with price info, or None if no override exists.
    """
    _load_cache()

    key = f"{product_id}:{country_code.upper()}"
    return _cache.get(key)


def set_region_price(
    product_id: str,
    country_code: str,
    price_usd: float,
    note: str = "",
) -> dict[str, Any]:
    """Set a region-specific price for a product in a country."""
    _load_cache()

    key = f"{product_id}:{country_code.upper()}"
    _cache[key] = {
        "product_id": product_id,
        "country_code": country_code.upper(),
        "price_usd": price_usd,
        "note": note,
    }
    _save_cache()

    logger.info("Set region price: %s = $%.2f", key, price_usd)
    return _cache[key]


def delete_region_price(product_id: str, country_code: str) -> bool:
    """Delete a region-specific price override."""
    _load_cache()

    key = f"{product_id}:{country_code.upper()}"
    if key in _cache:
        del _cache[key]
        _save_cache()
        logger.info("Deleted region price: %s", key)
        return True
    return False


def list_region_prices(product_id: str | None = None) -> list[dict[str, Any]]:
    """List all region-specific prices, optionally filtered by product."""
    _load_cache()

    results = []
    for _key, value in _cache.items():
        if product_id and value.get("product_id") != product_id:
            continue
        results.append(value)

    return sorted(results, key=lambda x: (x["product_id"], x["country_code"]))


def get_all_prices_for_product(product_id: str) -> dict[str, dict[str, float]]:
    """Get all region prices for a product, keyed by country code.

    Returns: {"US": {"price_usd": 5.0}, "NG": {"price_usd": 3.5}, ...}
    """
    _load_cache()

    result = {}
    for _key, value in _cache.items():
        if value.get("product_id") == product_id:
            country = value["country_code"]
            result[country] = {"price_usd": value["price_usd"]}

    return result


def bulk_set_prices(prices: list[dict[str, Any]]) -> int:
    """Bulk set region prices.

    Each item should have: product_id, country_code, price_usd, (optional) note.
    Returns number of prices set.
    """
    _load_cache()

    count = 0
    for item in prices:
        product_id = item.get("product_id", "")
        country_code = item.get("country_code", "").upper()
        price_usd = item.get("price_usd", 0)
        note = item.get("note", "")

        if not product_id or not country_code:
            continue

        key = f"{product_id}:{country_code}"
        _cache[key] = {
            "product_id": product_id,
            "country_code": country_code,
            "price_usd": price_usd,
            "note": note,
        }
        count += 1

    if count > 0:
        _save_cache()

    return count


def get_pricing_summary() -> dict[str, Any]:
    """Get a summary of all region pricing."""
    _load_cache()

    products = set()
    countries = set()
    for _key, value in _cache.items():
        products.add(value.get("product_id", ""))
        countries.add(value.get("country_code", ""))

    return {
        "total_overrides": len(_cache),
        "products_with_overrides": len(products),
        "countries_with_overrides": len(countries),
        "products": sorted(products),
        "countries": sorted(countries),
    }
