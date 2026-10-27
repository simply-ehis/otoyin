"""Marketplace stub — returns real models from the model registry."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/marketplace", tags=["marketplace-stub"])


def _products():
    try:
        from ..backends import get_all_model_configs

        products = []
        for cfg in get_all_model_configs():
            products.append({
                "id": cfg.model_name,
                "name": getattr(cfg, "display_name", cfg.model_name),
                "category": getattr(cfg, "category", "other"),
                "description": "",
                "price_usd": 0,
                "paid": getattr(cfg, "paid", False),
                "size_mb": getattr(cfg, "size_mb", 0),
                "languages": getattr(cfg, "languages", []),
            })
        return products
    except Exception:
        return []


@router.get("/catalog")
def catalog():
    return {"schema_version": 1, "signed_at": "", "currency": "USD", "products": _products(), "offline_fallback": True}


@router.get("/catalog/local")
def catalog_local():
    return {"schema_version": 1, "signed_at": "", "currency": "USD", "products": _products(), "offline_fallback": True}


@router.get("/entitlements")
def entitlements():
    return {"entitlements": []}


@router.get("/device-id")
def device_id():
    return {"device_id": "local"}


@router.get("/offers")
def offers():
    return {"offers": []}


@router.get("/licenses")
def licenses():
    return {"licenses": []}


@router.get("/region")
def region():
    return {"region": "US", "currency": "USD"}


@router.get("/wishlist")
def wishlist():
    return {"product_ids": []}


@router.get("/product/{product_id}")
def product(product_id: str):
    for p in _products():
        if p["id"] == product_id:
            return p
    return {"id": product_id, "name": product_id, "category": "other", "price_usd": 0, "paid": False}