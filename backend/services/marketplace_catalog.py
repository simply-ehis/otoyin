"""Marketplace catalog — the signed product list shipped with 21labs.

The catalog is the single source of truth for what is paid vs. free and
at what price (docs/PRICING_PLAN.md, locked 2026-08-17). It is signed
with the marketplace private key so a tampered or downgraded catalog is
rejected at load time. Model-product ``id`` values match the
``model_name`` used by the download pipeline so the license gate in
``routes/models/download.py`` can resolve entitlements.

Pricing rule (docs/PRICING_PLAN.md): only models are paid; the app,
instruments, and every procedural item stay free.  Free tier = equation
price < $3.  NC-licensed engines are NOT shipped (removed 2026-09-05 —
non-commercial weights cannot be distributed through a paid marketplace).
"""

from __future__ import annotations

import datetime
import json
import logging
import os
import sys
import threading
import time
import urllib.request
from pathlib import Path
from typing import Any

from .licensing import sign_license, verify_license_signature

logger = logging.getLogger(__name__)

# Optional remote catalog source (07 Part B). When ``OTOYIN_CATALOG_URL`` is
# set, ``refresh_remote_catalog()`` fetches the signed catalog from the
# marketplace service and swaps the bundled ``PRODUCTS`` on success.
# Offline-first: any failure keeps the bundled catalog untouched.
REMOTE_CATALOG_URL = os.environ.get("OTOYIN_CATALOG_URL", "").strip()
REMOTE_CATALOG_TIMEOUT_S = float(os.environ.get("OTOYIN_CATALOG_TIMEOUT_S", "8"))
REMOTE_REFRESH_INTERVAL_S = float(os.environ.get("OTOYIN_CATALOG_REFRESH_S", str(24 * 60 * 60)))
# Background poll tick: how often the startup task checks staleness. The fetch
# itself only runs when remote_catalog_stale() is true (i.e. the last success is
# older than REMOTE_REFRESH_INTERVAL_S, or it never happened / last failed), so
# this is a cheap no-op most ticks and bounds failure retries to once per tick.
REMOTE_CATALOG_POLL_S = float(os.environ.get("OTOYIN_CATALOG_POLL_S", "3600"))

# Product registry. `id` matches the download pipeline `model_name` for
# model products. `paid` drives the license gate. The catalog ships as bundled
# data (backend/data/marketplace_catalog.json, also shipped inside the frozen
# binary) - no products are hardcoded in Python.
_CATALOG_BUNDLE = "marketplace_catalog.json"


def _load_bundled_products() -> list[dict]:
    """Load the product list from the bundled JSON.

    Fail-closed: if the bundle is missing or malformed the module raises at
    import - a silently empty catalog would let every model (including paid
    ones) resolve as "free" and bypass the license gate entirely.
    """
    candidates = []
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        candidates.append(Path(meipass) / "backend" / "data" / _CATALOG_BUNDLE)
    candidates.append(Path(__file__).resolve().parent.parent / "data" / _CATALOG_BUNDLE)
    last_err = None
    for path in candidates:
        try:
            raw = path.read_text(encoding="utf-8")
            data = json.loads(raw)
        except (OSError, json.JSONDecodeError) as exc:
            last_err = exc
            continue
        if not isinstance(data, list) or not data:
            raise RuntimeError(f"marketplace_catalog: bundled catalog {path} is empty or invalid")
        for index, product in enumerate(data):
            if not isinstance(product, dict) or not product.get("id"):
                raise RuntimeError(f"marketplace_catalog: malformed product #{index} in {path}")
        return data
    raise RuntimeError(
        f"marketplace_catalog: bundled catalog {_CATALOG_BUNDLE} not readable ({last_err})"
    ) from last_err


PRODUCTS: list[dict[str, Any]] = _load_bundled_products()
_PRODUCT_INDEX = {p["id"]: p for p in PRODUCTS}


def get_product(product_id: str) -> dict | None:
    """Return a product by id, or None if unknown (treated as free)."""
    return _PRODUCT_INDEX.get(product_id)


def build_catalog() -> dict:
    """Return a signed catalog document."""
    catalog = {
        "schema_version": "1.0",
        "signed_at": datetime.datetime.now(datetime.UTC).isoformat(),
        "currency": "USD",
        "products": PRODUCTS,
    }
    return sign_license(catalog)


def verify_catalog(catalog: dict) -> bool:
    """Verify the catalog signature (tamper/downgrade protection)."""
    return verify_license_signature(catalog)


# ── Remote catalog (07 Part B) ───────────────────────────────────────────

_LAST_REMOTE_REFRESH: float = 0.0
_refresh_lock = threading.Lock()


def refresh_remote_catalog() -> str:
    """Fetch + verify the signed remote catalog; swap ``PRODUCTS`` on success.

    Trust boundary: the fetched document must verify against the embedded
    marketplace public key (``licensing.verify_license_signature``). The
    marketplace service signs the full response payload (minus ``sig``) with
    its private key — see ``marketplace_server/routes/catalog.py``.

    Offline-first: any failure (no network, timeout, bad signature, malformed
    shape) keeps the bundled catalog untouched and logs at debug level.
    Returns a result code so callers can distinguish the outcome:

    - ``"refreshed"`` — a verified remote catalog was swapped in
    - ``"no_url"`` — no ``OTOYIN_CATALOG_URL`` configured (offline by design)
    - ``"failed"`` — fetch/verify/shape failure (bundled catalog kept)

    Never raises.
    """
    global _LAST_REMOTE_REFRESH, _PRODUCT_INDEX
    if not REMOTE_CATALOG_URL:
        return "no_url"
    if not _refresh_lock.acquire(blocking=False):
        return "failed"
    try:
        from ..utils.ssrf import is_url_safe

        if not is_url_safe(REMOTE_CATALOG_URL):
            logger.warning("Remote catalog URL failed SSRF check: %s", REMOTE_CATALOG_URL)
            return "failed"
        req = urllib.request.Request(
            REMOTE_CATALOG_URL,
            headers={"Accept": "application/json", "User-Agent": "otoyin/0.1"},
        )
        with urllib.request.urlopen(req, timeout=REMOTE_CATALOG_TIMEOUT_S) as resp:
            catalog = json.loads(resp.read().decode("utf-8"))
        if not isinstance(catalog, dict):
            raise ValueError("remote catalog is not an object")
        if not verify_catalog(catalog):
            logger.warning("Remote catalog failed signature verification — keeping bundled catalog")
            return "failed"
        products = catalog.get("products")
        if not isinstance(products, list) or not products:
            raise ValueError("remote catalog has no products list")
        for product in products:
            if not isinstance(product, dict) or not product.get("id"):
                raise ValueError("remote catalog contains a malformed product")
        # Swap in place so existing references to PRODUCTS see the update.
        PRODUCTS[:] = products
        _PRODUCT_INDEX = {p["id"]: p for p in products}
        _LAST_REMOTE_REFRESH = time.monotonic()
        logger.info("Swapped bundled catalog with remote catalog (%d products)", len(products))
        return "refreshed"
    except Exception:
        logger.debug("Remote catalog fetch failed; keeping bundled catalog", exc_info=True)
        return "failed"
    finally:
        _refresh_lock.release()


def remote_catalog_stale(age_s: float = REMOTE_REFRESH_INTERVAL_S) -> bool:
    """True when a configured remote catalog hasn't refreshed within ``age_s``."""
    return bool(REMOTE_CATALOG_URL) and (time.monotonic() - _LAST_REMOTE_REFRESH) > age_s


def refresh_remote_catalog_if_stale(force: bool = False) -> str:
    """Refresh the remote catalog when stale — or immediately when forced.

    Cheap when fresh: no network, no lock, ``"fresh"`` immediately. Fetches via
    ``refresh_remote_catalog()`` only when ``remote_catalog_stale()`` says the
    last successful refresh is older than ``REMOTE_REFRESH_INTERVAL_S`` — or
    never happened / last failed, since the timestamp only advances on success,
    so a failure is retried on the next poll tick rather than after a full
    interval. ``force=True`` (the manual "Check for updates" action) skips the
    staleness gate so the user can pull newly published products on demand;
    still offline-first — no configured ``OTOYIN_CATALOG_URL`` stays a no-op
    and any fetch failure keeps the bundled catalog untouched.
    Returns a result code: ``"refreshed"`` when a fresh catalog was swapped
    in, ``"fresh"`` when the stale gate skipped the fetch, ``"no_url"`` when
    no remote is configured, or ``"failed"`` when the fetch/verify failed.
    """
    if not force and not remote_catalog_stale():
        return "fresh"
    return refresh_remote_catalog()


# ── Reviews (SQLite-backed — survive restarts) ──────────────────────────


def _reviews_db():
    """Open a session for review reads/writes (caller closes)."""
    from ..database.session import SessionLocal

    factory = SessionLocal
    if factory is None:
        raise RuntimeError("Database not initialized (init_db has not run yet)")
    return factory()


def get_product_reviews(product_id: str) -> list[dict]:
    """Reviews for a product, oldest first (matches the pre-DB ordering)."""
    from ..database.models import ProductReview

    db = _reviews_db()
    try:
        rows = (
            db.query(ProductReview)
            .filter(ProductReview.product_id == product_id)
            .order_by(ProductReview.created_at.asc(), ProductReview.id.asc())
            .all()
        )
        return [
            {
                "id": r.id,
                "rating": r.rating,
                "comment": r.comment,
                "device_id": r.device_id,
                "created_at": r.created_at.isoformat() if r.created_at else "",
            }
            for r in rows
        ]
    finally:
        db.close()


def add_product_review(product_id: str, rating: int, comment: str, device_id: str) -> None:
    """Add (or update, per device) a review. One row per (product, device)
    so re-posting corrects instead of ballot-stuffing."""
    from ..database.models import ProductReview

    if not 1 <= int(rating) <= 5:
        raise ValueError("Rating must be 1-5")
    if comment is not None and len(comment) > 2000:
        raise ValueError("Comment must be at most 2000 characters")
    db = _reviews_db()
    try:
        row = (
            db.query(ProductReview)
            .filter(
                ProductReview.product_id == product_id,
                ProductReview.device_id == (device_id or ""),
            )
            .first()
        )
        if row is None:
            row = ProductReview(product_id=product_id, device_id=device_id or "")
            db.add(row)
        row.rating = int(rating)
        row.comment = (comment or "")[:2000]
        db.commit()
    finally:
        db.close()


def get_rating_summary(product_id: str) -> tuple[float | None, int]:
    """(average rating 1-5, review count) for catalog annotation."""
    summaries = get_all_rating_summaries()
    return summaries.get(product_id, (None, 0))


def get_all_rating_summaries() -> dict[str, tuple[float | None, int]]:
    """One GROUP BY query for every product's (average, count)."""
    from sqlalchemy import func

    from ..database.models import ProductReview

    db = _reviews_db()
    try:
        rows = (
            db.query(
                ProductReview.product_id,
                func.avg(ProductReview.rating),
                func.count(ProductReview.id),
            )
            .group_by(ProductReview.product_id)
            .all()
        )
        return {pid: (round(float(avg), 2), count) for pid, avg, count in rows}
    finally:
        db.close()


# ── Wishlist (in-memory, production: use DB) ───────────────────────────

_wishlists: dict[str, list[str]] = {}  # device_id → [product_ids]


def get_device_wishlist(device_id: str) -> list[str]:
    """Get wishlist product IDs for a device."""
    return _wishlists.get(device_id, [])


def add_to_wishlist(product_id: str, device_id: str) -> None:
    """Add a product to a device's wishlist."""
    if device_id not in _wishlists:
        _wishlists[device_id] = []
    if product_id not in _wishlists[device_id]:
        _wishlists[device_id].append(product_id)


def remove_from_wishlist(product_id: str, device_id: str) -> None:
    """Remove a product from a device's wishlist."""
    if device_id in _wishlists:
        _wishlists[device_id] = [pid for pid in _wishlists[device_id] if pid != product_id]
