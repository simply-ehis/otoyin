"""Catalog API — serves the product catalog to clients."""

from __future__ import annotations

import base64
import datetime as dt
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import dodo
from ..models import Product, Review, Wishlist, async_session
from ..rate_limit import preview_limiter
from ..signing import get_signer

router = APIRouter(prefix="/v1/catalog", tags=["catalog"])


class ProductOut(BaseModel):
    id: str
    name: str
    category: str
    description: str
    long_description: str = ""
    price_usd: float
    paid: bool
    coming_soon: bool = False
    quality_score: int
    avg_rating: float = 0.0
    review_count: int = 0
    size_mb: float = 0
    languages: list[str] = []
    license: str = ""
    use_cases: list[str] = []
    note: str
    special_offer: bool
    offer_discount_pct: int
    baseline_usd: float = 0.0


class CatalogResponse(BaseModel):
    schema_version: int
    signed_at: str
    currency: str
    products: list[ProductOut]
    sig: str


async def get_db():
    async with async_session() as session:
        yield session


@router.get("", response_model=CatalogResponse)
async def get_catalog(db: AsyncSession = Depends(get_db)):
    """Serve the signed product catalog.

    The catalog is fetched from the database and signed fresh each time.
    Clients cache it locally and verify the signature with the embedded public key.
    """
    result = await db.execute(select(Product).where(Product.active))
    products = result.scalars().all()

    now = dt.datetime.now(dt.UTC)
    signer = get_signer()

    product_dicts = [
        {
            "id": p.id,
            "name": p.name,
            "category": p.category,
            "description": p.description,
            "long_description": p.long_description or p.description,
            "price_usd": p.price_usd,
            "paid": p.paid,
            "coming_soon": p.coming_soon,
            "quality_score": p.quality_score,
            "avg_rating": p.avg_rating,
            "review_count": p.review_count,
            "size_mb": p.size_mb,
            "languages": __import__("json").loads(p.languages) if p.languages else [],
            "license": p.license,
            "use_cases": __import__("json").loads(p.use_cases) if getattr(p, "use_cases", None) else [],
            "note": p.note,
            "special_offer": p.special_offer,
            "offer_discount_pct": p.offer_discount_pct,
        }
        for p in products
    ]

    # Sign the FULL response payload (minus sig) so clients verify exactly
    # what they receive. Canonical form: sort_keys + compact separators,
    # matching the client-side verifier in backend/services/licensing.py
    # (verify_license_signature -> _canonical).
    payload = {
        "schema_version": 1,
        "signed_at": now.isoformat(),
        "currency": "usd",
        "products": [ProductOut(**pd).model_dump() for pd in product_dicts],
    }
    canonical = json.dumps(
        {k: v for k, v in payload.items() if k != "sig"},
        sort_keys=True,
        separators=(",", ":"),
    )

    sig_bytes = signer._private_key.sign(canonical.encode())
    sig = f"ed25519:{base64.b64encode(sig_bytes).decode()}"

    return CatalogResponse(**payload, sig=sig)


@router.get("/product/{product_id}", response_model=ProductOut)
async def get_product(product_id: str, db: AsyncSession = Depends(get_db)):
    """Get a single product by ID."""
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if product is None:
        msg = f"Product '{product_id}' not found"
        raise HTTPException(404, detail={"code": "product_not_found", "message": msg})
    # Manually construct to handle JSON string fields
    d = product.__dict__.copy()
    for field in ("languages", "use_cases"):
        try:
            d[field] = __import__("json").loads(d.get(field) or "[]")
        except Exception:
            d[field] = []
    # Include baseline_usd in response
    d["baseline_usd"] = product.baseline_usd
    return ProductOut.model_validate(d)


class PricingPreviewRequest(BaseModel):
    country_code: str
    product_ids: list[str] = []


class PricingPreviewItem(BaseModel):
    product_id: str
    currency: str
    amount: float
    formatted_total: str


class PricingPreviewResponse(BaseModel):
    country_code: str
    currency: str
    prices: list[PricingPreviewItem]


_ZERO_DECIMAL_CURRENCIES = {"JPY", "KRW", "CLP"}


@router.post("/pricing/preview", response_model=PricingPreviewResponse)
async def preview_pricing(
    req: PricingPreviewRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    """Return Dodo buyer-facing totals for products in a country.

    This is the source of truth for localized display: Dodo applies
    adaptive currency conversion, so the app does not have to guess
    with FX conversion. Products without a configured Dodo product are
    omitted; free and coming-soon products are never previewed.
    """
    client_ip = request.client.host if request.client else "unknown"
    if not preview_limiter.allow(f"pricing:{client_ip}"):
        raise HTTPException(
            429, detail={"code": "rate_limited", "message": "Too many pricing requests — try again later"}
        )
    country = (req.country_code or "").strip().upper()
    if len(country) != 2 or not country.isalpha():
        raise HTTPException(
            400, detail={"code": "bad_country", "message": "country_code must be a 2-letter country code"}
        )

    result = await db.execute(
        select(Product).where(
            Product.active == True,  # noqa: E712
            Product.paid == True,  # noqa: E712
            Product.coming_soon == False,  # noqa: E712
        )
    )
    products = result.scalars().all()
    if req.product_ids:
        wanted = set(req.product_ids)
        products = [p for p in products if p.id in wanted]

    price_to_product: dict[str, str] = {}
    for product in products:
        price_id = dodo.price_id_for(product.id)
        if price_id and price_id not in price_to_product:
            price_to_product[price_id] = product.id
    if not price_to_product:
        return PricingPreviewResponse(country_code=country, currency="USD", prices=[])

    try:
        preview = await dodo.preview_prices(country_code=country, price_ids=list(price_to_product))
    except RuntimeError as exc:
        message = str(exc)
        if "not configured" in message:
            raise HTTPException(
                503,
                detail={"code": "payment_not_configured", "message": "Payments are not configured on this server"},
            ) from exc
        raise HTTPException(502, detail={"code": "provider_error", "message": message}) from exc

    currency = str(preview.get("currency_code") or "USD").upper()
    details = preview.get("details") or {}
    lines = details.get("line_items") or []
    by_price = {((line.get("price") or {}).get("id")): line for line in lines if isinstance(line, dict)}

    prices: list[PricingPreviewItem] = []
    for price_id, product_id in price_to_product.items():
        line = by_price.get(price_id) or {}
        totals = line.get("totals") or {}
        formatted = line.get("formatted_totals") or {}
        try:
            total_minor = int(str(totals.get("total")))
        except (TypeError, ValueError):
            continue
        amount = (
            float(total_minor)
            if currency in _ZERO_DECIMAL_CURRENCIES
            else round(total_minor / 100, 2)
        )
        prices.append(
            PricingPreviewItem(
                product_id=product_id,
                currency=currency,
                amount=amount,
                formatted_total=str(formatted.get("total") or f"{amount:.2f} {currency}"),
            )
        )
    return PricingPreviewResponse(country_code=country, currency=currency, prices=prices)


class ReviewOut(BaseModel):
    id: int
    rating: int
    comment: str
    created_at: str


class ReviewIn(BaseModel):
    rating: int  # 1-5
    comment: str = ""
    device_id: str = ""


@router.get("/product/{product_id}/reviews", response_model=list[ReviewOut])
async def get_reviews(product_id: str, db: AsyncSession = Depends(get_db)):
    """List reviews for a product."""
    result = await db.execute(select(Product).where(Product.id == product_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(404, detail={"code": "product_not_found", "message": f"Product '{product_id}' not found"})
    result = await db.execute(select(Review).where(Review.product_id == product_id).order_by(Review.created_at.desc()).limit(50))
    reviews = result.scalars().all()
    return [ReviewOut(id=r.id, rating=r.rating, comment=r.comment, created_at=r.created_at.isoformat()) for r in reviews]


@router.post("/product/{product_id}/reviews", response_model=ReviewOut)
async def post_review(product_id: str, body: ReviewIn, db: AsyncSession = Depends(get_db)):
    """Add a rating + review. Updates Product avg_rating/review_count."""
    if not 1 <= body.rating <= 5:
        raise HTTPException(400, detail={"code": "invalid_rating", "message": "rating must be 1-5"})
    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if product is None:
        raise HTTPException(404, detail={"code": "product_not_found", "message": f"Product '{product_id}' not found"})
    review = Review(product_id=product_id, device_id=body.device_id or "anon", rating=body.rating, comment=body.comment[:2000])
    db.add(review)
    # Recompute avg_rating
    result = await db.execute(select(Review).where(Review.product_id == product_id))
    all_reviews = result.scalars().all()
    # include the just-added review (not yet flushed, count it)
    ratings = [r.rating for r in all_reviews] + [body.rating]
    product.review_count = len(ratings)
    product.avg_rating = round(sum(ratings) / len(ratings), 2) if ratings else 0.0
    await db.commit()
    await db.refresh(review)
    return ReviewOut(id=review.id, rating=review.rating, comment=review.comment, created_at=review.created_at.isoformat())


# ── Wishlist ──────────────────────────────────────────────────────────


class WishlistOut(BaseModel):
    product_ids: list[str]


@router.get("/wishlist", response_model=WishlistOut)
async def get_wishlist(device_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Wishlist).where(Wishlist.device_id == device_id))
    items = result.scalars().all()
    return WishlistOut(product_ids=[i.product_id for i in items])


@router.post("/wishlist/{product_id}", response_model=WishlistOut)
async def add_wishlist(product_id: str, device_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Product).where(Product.id == product_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(404, detail={"code": "product_not_found", "message": f"Product '{product_id}' not found"})
    result = await db.execute(select(Wishlist).where((Wishlist.device_id == device_id) & (Wishlist.product_id == product_id)))
    if result.scalar_one_or_none() is None:
        db.add(Wishlist(device_id=device_id, product_id=product_id))
        await db.commit()
    return await get_wishlist(device_id, db)


# ── Offers ────────────────────────────────────────────────────────────


class OfferOut(BaseModel):
    id: str
    name: str
    category: str
    description: str
    price_usd: float
    baseline_usd: float
    discount_pct: int
    special_offer: bool


@router.get("/offers", response_model=list[OfferOut])
async def get_offers(db: AsyncSession = Depends(get_db)):
    """Get active special offers (real discounts only)."""
    result = await db.execute(
        select(Product).where(
            Product.active == True,
            Product.special_offer == True,
            Product.offer_discount_pct > 0,
        )
    )
    offers = result.scalars().all()
    out = []
    for o in offers:
        baseline = getattr(o, "baseline_usd", 0) or o.price_usd
        out.append(
            OfferOut(
                id=o.id,
                name=o.name,
                category=o.category,
                description=o.description,
                price_usd=o.price_usd,
                baseline_usd=baseline,
                discount_pct=o.offer_discount_pct,
                special_offer=o.special_offer,
            )
        )
    return out


@router.delete("/wishlist/{product_id}", response_model=WishlistOut)
async def remove_wishlist(product_id: str, device_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Wishlist).where((Wishlist.device_id == device_id) & (Wishlist.product_id == product_id)))
    item = result.scalar_one_or_none()
    if item:
        await db.delete(item)
        await db.commit()
    return await get_wishlist(device_id, db)
