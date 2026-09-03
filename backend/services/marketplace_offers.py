"""Special-offer backend — surface time-limited marketplace deals.

A special offer is any catalog product flagged ``special_offer: True``. The
catalog (``marketplace_catalog.PRODUCTS``) is the single source of truth, so
this module never duplicates pricing; it just filters and enriches the active
offers for the storefront banner and any offer-aware surface.
"""

from __future__ import annotations

from typing import Any

from .marketplace_catalog import _PRODUCT_INDEX, PRODUCTS


def get_active_offers() -> list[dict[str, Any]]:
    """Return all catalog products currently marked as special offers.

    Each offer carries its full product record (id, name, price, note) plus a
    derived ``discount_pct`` when a comparable baseline price exists in the
    same category (so the UI can show "was $X").
    """
    offers = [p for p in PRODUCTS if p.get("special_offer")]
    if not offers:
        return offers

    # Baseline = highest non-offer paid price in the same category, used only
    # to render a "limited offer" framing; never affects the real price.
    category_baseline: dict[str, int] = {}
    for p in PRODUCTS:
        if p.get("special_offer") or not p.get("paid"):
            continue
        cat = p.get("category")
        category_baseline[cat] = max(category_baseline.get(cat, 0), int(p.get("price_usd", 0)))

    enriched: list[dict[str, Any]] = []
    for p in offers:
        entry = dict(p)
        baseline = category_baseline.get(p.get("category"))
        if baseline:
            entry["baseline_usd"] = baseline
            entry["discount_pct"] = max(0, round(100 * (baseline - int(p.get("price_usd", 0))) / baseline))
        enriched.append(entry)
    return enriched


def is_offer(product_id: str) -> bool:
    """True if the given product id is an active special offer."""
    product = _PRODUCT_INDEX.get(product_id)
    return bool(product and product.get("special_offer"))
