"""Minimal marketplace stub — marketplace infra stripped.

Provides empty responses so the frontend store page doesn't crash.
Model downloads go through /models/* instead.
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/marketplace", tags=["marketplace-stub"])


@router.get("/catalog")
def catalog():
    return {"schema_version": 1, "signed_at": "", "currency": "USD", "products": [], "offline_fallback": True}


@router.get("/catalog/local")
def catalog_local():
    return {"schema_version": 1, "signed_at": "", "currency": "USD", "products": [], "offline_fallback": True}


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
    return {"id": product_id, "name": product_id, "category": "other", "price_usd": 0, "paid": False}