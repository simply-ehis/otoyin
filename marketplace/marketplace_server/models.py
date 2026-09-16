"""Database models for the marketplace.

Supports both SQLite (local dev) and PostgreSQL (Neon prod).
"""

from __future__ import annotations

import datetime as dt
import hashlib

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.ext.asyncio import AsyncAttrs, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from .config import settings


def hash_email(email: str) -> str:
    """SHA-256 hash of a normalized email for at-rest storage."""
    return hashlib.sha256(email.strip().lower().encode()).hexdigest()


def _create_engine():
    """Create engine — handles both SQLite and PostgreSQL URLs."""
    url = settings.database_url
    kwargs = {"echo": settings.debug}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    return create_async_engine(url, **kwargs)


engine = _create_engine()
async_session = async_sessionmaker(engine, expire_on_commit=False)


class Base(AsyncAttrs, DeclarativeBase):
    pass


class Product(Base):
    """A product listed in the marketplace catalog — complete list, about, ratings."""

    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    name: Mapped[str] = mapped_column(String(256))
    category: Mapped[str] = mapped_column(String(64))
    description: Mapped[str] = mapped_column(Text, default="")
    long_description: Mapped[str] = mapped_column(Text, default="")  # about — what the model does
    price_usd: Mapped[float] = mapped_column(Float)
    paid: Mapped[bool] = mapped_column(Boolean, default=True)
    quality_score: Mapped[int] = mapped_column(Integer, default=5)
    avg_rating: Mapped[float] = mapped_column(Float, default=0.0)  # 0-5, computed from reviews
    review_count: Mapped[int] = mapped_column(Integer, default=0)
    size_mb: Mapped[float] = mapped_column(Float, default=0)  # download size
    languages: Mapped[str] = mapped_column(Text, default="[]")  # JSON list
    license: Mapped[str] = mapped_column(String(64), default="")  # e.g. apache-2.0
    use_cases: Mapped[str] = mapped_column(Text, default="[]")  # JSON list e.g. ["podcast","audiobook"]
    note: Mapped[str] = mapped_column(Text, default="")
    special_offer: Mapped[bool] = mapped_column(Boolean, default=False)
    offer_discount_pct: Mapped[int] = mapped_column(Integer, default=0)
    baseline_usd: Mapped[float] = mapped_column(Float, default=0.0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(dt.UTC), default=lambda: dt.datetime.now(dt.UTC))

    reviews: Mapped[list[Review]] = relationship("Review", back_populates="product", cascade="all, delete-orphan")


class Review(Base):
    """User rating + review for a product."""

    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[str] = mapped_column(String(128), ForeignKey("products.id"), index=True)
    device_id: Mapped[str] = mapped_column(String(128))
    rating: Mapped[int] = mapped_column(Integer)  # 1-5
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(dt.UTC), default=lambda: dt.datetime.now(dt.UTC))

    product: Mapped[Product] = relationship("Product", back_populates="reviews")


class Wishlist(Base):
    """Device wishlist — hearted products."""

    __tablename__ = "wishlists"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(String(128), index=True)
    product_id: Mapped[str] = mapped_column(String(128), ForeignKey("products.id"), index=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(dt.UTC), default=lambda: dt.datetime.now(dt.UTC))


class Order(Base):
    """A checkout session / purchase order."""

    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_ref: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    product_id: Mapped[str] = mapped_column(String(128), ForeignKey("products.id"))
    device_id: Mapped[str] = mapped_column(String(128))
    email: Mapped[str] = mapped_column(String(256), default="")
    status: Mapped[str] = mapped_column(String(32), default="pending")
    amount_usd: Mapped[float] = mapped_column(Float)
    payment_provider: Mapped[str] = mapped_column(String(64), default="paddle")
    payment_session_id: Mapped[str] = mapped_column(String(256), default="")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(dt.UTC), default=lambda: dt.datetime.now(dt.UTC))
    paid_at: Mapped[dt.datetime | None] = mapped_column(DateTime(dt.UTC), nullable=True)

    license: Mapped[License | None] = relationship("License", back_populates="order", uselist=False)


class License(Base):
    """An issued license — the signed entitlement a client stores locally."""

    __tablename__ = "licenses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(Integer, ForeignKey("orders.id"), unique=True)
    product_id: Mapped[str] = mapped_column(String(128), ForeignKey("products.id"))
    device_id: Mapped[str] = mapped_column(String(128))
    purchaser: Mapped[str] = mapped_column(String(256))
    entitlements: Mapped[str] = mapped_column(Text)  # JSON list of entitlement strings
    issued_at: Mapped[dt.datetime] = mapped_column(DateTime(dt.UTC), default=lambda: dt.datetime.now(dt.UTC))
    expires_at: Mapped[dt.datetime | None] = mapped_column(DateTime(dt.UTC), nullable=True)
    signed_license: Mapped[str] = mapped_column(Text)  # Full signed license JSON

    order: Mapped[Order] = relationship("Order", back_populates="license")
    product: Mapped[Product] = relationship("Product")


class Notice(Base):
    """A push-style announcement served to installed desktop apps.

    Independently updatable: notices are created via the admin route and
    polled by the app on launch (no app release required). The response
    shape matches the frontend ``Announcement`` type in
    ``app/src/lib/api/types.ts`` so existing banner/bell UI renders it
    unchanged.
    """

    __tablename__ = "notices"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    title: Mapped[str] = mapped_column(String(256), default="")
    message: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(16), default="info")  # info | success | warning | promo
    cta_label: Mapped[str] = mapped_column(String(128), default="")
    cta_to: Mapped[str] = mapped_column(String(256), default="")
    scope: Mapped[str] = mapped_column(String(32), default="global")  # global | update | promo
    starts_at: Mapped[dt.datetime | None] = mapped_column(DateTime(dt.UTC), nullable=True)
    ends_at: Mapped[dt.datetime | None] = mapped_column(DateTime(dt.UTC), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(dt.UTC), default=lambda: dt.datetime.now(dt.UTC))


class CrashReport(Base):
    """An opt-in crash report forwarded by an installed desktop app.

    Senders redact emails, API keys, and home paths before sending, and the
    payload is stored verbatim — never parsed for anything but display.
    Read access is admin-only (Bearer MARKETPLACE_ADMIN_KEY).
    """

    __tablename__ = "crash_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    report_id: Mapped[str] = mapped_column(String(64), index=True, default="")
    layer: Mapped[str] = mapped_column(String(16), default="")  # backend | frontend | rust
    kind: Mapped[str] = mapped_column(String(128), default="")
    message: Mapped[str] = mapped_column(Text, default="")
    stack: Mapped[str] = mapped_column(Text, default="")
    context: Mapped[str] = mapped_column(Text, default="{}")  # JSON, already scrubbed by sender
    received_at: Mapped[dt.datetime] = mapped_column(DateTime(dt.UTC), default=lambda: dt.datetime.now(dt.UTC))


async def init_db():
    """Create all tables."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
