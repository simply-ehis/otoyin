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

    # PayProGlobal
    payproglobal_shop_id: str = ""
    payproglobal_api_key: str = ""
    payproglobal_webhook_secret: str = ""

    # App settings
    app_url_scheme: str = "otoyin"  # Deep link scheme for redirect after payment
    catalog_cache_ttl_seconds: int = 300  # 5 min


settings = Settings()
