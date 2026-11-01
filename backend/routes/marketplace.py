"""Marketplace stub — returns real models from the model registry."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/marketplace", tags=["marketplace-stub"])


def _products():
    try:
        from ..backends import get_all_model_configs

        products = []
        for cfg in get_all_model_configs():
            p = {
                "id": cfg.model_name,
                "name": getattr(cfg, "display_name", cfg.model_name),
                "category": getattr(cfg, "category", "other"),
                "description": "",
                "price_usd": 0,
                "paid": getattr(cfg, "paid", False),
                "size_mb": getattr(cfg, "size_mb", 0),
                "languages": getattr(cfg, "languages", []),
            }
            products.append(p)
        # Annotate ratings (best-effort; degrades if DB unavailable)
        try:
            from ..services.marketplace_catalog import get_all_rating_summaries

            summaries = get_all_rating_summaries()
            for p in products:
                avg, count = summaries.get(p["id"], (None, 0))
                if count > 0:
                    p["avg_rating"] = avg
                    p["review_count"] = count
        except Exception:
            pass
        return products
    except Exception:
        return []


def _annotate_local_status(products: list[dict]) -> None:
    """Annotate each product with ``local_status`` ("cached" or "not_downloaded").

    Models with a manifest row are "cached"; models without one need download.
    Non-model products (no config) ship with the app → "cached".
    """
    try:
        from ..backends import get_model_config
        from ..services.model_registry import SessionLocal, is_downloaded

        db = SessionLocal()
        try:
            for p in products:
                cfg = get_model_config(p["id"])
                if cfg is None:
                    # Non-model product — ships with the app by definition.
                    p["local_status"] = "cached"
                    continue
                p["local_status"] = "cached" if is_downloaded(p["id"], cfg.model_size, db=db) else "not_downloaded"
        finally:
            db.close()
    except Exception:
        # Database not initialized or other failure — degrade safely.
        for p in products:
            p.setdefault("local_status", "not_downloaded")


class CatalogRefreshResponse(BaseModel):
    refreshed: bool
    reason: str | None = None


class LicenseInstallRequest(BaseModel):
    license: dict


class LicenseInstallResponse(BaseModel):
    ok: bool


class ReviewRequest(BaseModel):
    rating: int
    comment: str = ""
    device_id: str = ""


@router.get("/catalog")
def catalog():
    products = _products()
    _annotate_local_status(products)
    return {"schema_version": 1, "signed_at": "", "currency": "USD", "products": products, "offline_fallback": True}


@router.get("/catalog/local")
def catalog_local():
    products = _products()
    _annotate_local_status(products)
    return {"schema_version": 1, "signed_at": "", "currency": "USD", "products": products, "offline_fallback": True}


@router.post("/catalog/refresh", response_model=CatalogRefreshResponse)
def catalog_refresh(force: bool = False):
    """Nudge a remote-catalog refresh. Stub: offline-first, no remote URL configured."""
    try:
        from ..services.marketplace_catalog import refresh_remote_catalog_if_stale

        result = refresh_remote_catalog_if_stale(force=force)
        if result == "refreshed":
            return {"refreshed": True, "reason": None}
        return {"refreshed": False, "reason": result or "fresh"}
    except Exception:
        return {"refreshed": False, "reason": "no_remote_configured"}


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


@router.post("/license", response_model=LicenseInstallResponse)
def install_license(req: LicenseInstallRequest):
    """Install a signed marketplace license. Stub: accepts and records as OK."""
    return {"ok": True}


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


# ── Reviews ──────────────────────────────────────────────────────────────


@router.get("/product/{product_id}/reviews")
def product_reviews(product_id: str):
    from ..services.marketplace_catalog import get_product_reviews

    return {"reviews": get_product_reviews(product_id)}


@router.post("/product/{product_id}/reviews")
def add_product_review(product_id: str, req: ReviewRequest):
    from ..services.marketplace_catalog import add_product_review

    try:
        add_product_review(product_id, req.rating, req.comment, req.device_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True}


# ── Plugins (stub) ───────────────────────────────────────────────────────


class Plugin(BaseModel):
    plugin_id: str
    name: str
    version: str = "0.0.0"
    developer: str | None = None
    kind: str | None = None
    verified: bool = False
    enabled: bool = False
    trust_external: bool = False
    install_path: str | None = None


@router.get("/plugins")
def list_plugins():
    return {"plugins": []}


@router.post("/plugins")
def install_plugin(plugin: Plugin):
    return plugin


@router.post("/plugins/{plugin_id}/enable")
def enable_plugin(plugin_id: str):
    return {"plugin_id": plugin_id, "enabled": True}


@router.post("/plugins/{plugin_id}/disable")
def disable_plugin(plugin_id: str):
    return {"plugin_id": plugin_id, "enabled": False}


@router.delete("/plugins/{plugin_id}")
def uninstall_plugin(plugin_id: str):
    return {"plugin_id": plugin_id, "uninstalled": True}


@router.post("/plugins/{plugin_id}/approve-external")
def approve_external(plugin_id: str):
    return {"plugin_id": plugin_id, "trust_external": True, "enabled": True}


@router.post("/plugins/{plugin_id}/launch-external")
def launch_external(plugin_id: str):
    return {"plugin_id": plugin_id, "pid": 0, "status": "stopped"}


@router.post("/plugins/{plugin_id}/stop")
def stop_plugin(plugin_id: str):
    return {"plugin_id": plugin_id, "stopped": True}


@router.get("/plugins/{plugin_id}/status")
def plugin_status(plugin_id: str):
    return {"plugin_id": plugin_id, "running": False, "pid": None}
