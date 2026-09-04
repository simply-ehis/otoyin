"""Marketplace server configuration."""

from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Server settings loaded from environment variables."""

    model_config = {"env_prefix": "MARKETPLACE_"}

    # Server
    host: str = "0.0.0.0"
    port: int = 8420
    debug: bool = False

    # Database — Neon PostgreSQL in prod, SQLite locally
    # Set DATABASE_URL in Neon dashboard or local dev
    # Format: postgresql+asyncpg://user:pass@host/dbname?sslmode=require
    database_url: str = "sqlite+aiosqlite:///marketplace.db"

    # Ed25519 keys (base64-encoded)
    license_private_key: str = ""
    license_public_key: str = ""

    # Paddle Billing (Merchant of Record). Sandbox defaults ON so a
    # misconfigured deploy can never take a live charge.
    paddle_api_key: str = ""
    paddle_webhook_secret: str = ""  # per-notification-destination secret (pdl_ntfset_...)
    paddle_sandbox: bool = True
    # product_id -> Paddle price_id (pri_...), created in the Paddle dashboard.
    # A paid product with no entry here returns 500 misconfigured at checkout.
    paddle_price_map: dict[str, str] = {}

    # Admin API (notices, catalog management) — Bearer token for /v1/admin/*
    admin_key: str = ""

    # App settings
    app_url_scheme: str = "otoyin"  # Deep link scheme for redirect after payment
    catalog_cache_ttl_seconds: int = 300  # 5 min


settings = Settings()
