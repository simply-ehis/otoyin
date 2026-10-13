"""Marketplace server — serves catalog, handles payments, signs licenses."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .models import init_db
from .routes import catalog, checkout, crashes, notices, webhook
from .signing import get_signer


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create DB tables, initialize signer."""
    if not settings.debug and not settings.license_private_key:
        raise RuntimeError(
            "MARKETPLACE_LICENSE_PRIVATE_KEY must be configured outside debug mode; "
            "an ephemeral key would invalidate signed catalogs and licenses."
        )
    await init_db()
    signer = get_signer()
    print(f"[marketplace] Public key: {signer.public_key_b64[:32]}...")
    yield


app = FastAPI(
    title="Otoyin Marketplace",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "http://localhost:5173",
        "http://localhost:1420",
        "http://localhost:3000",
        "tauri://localhost",
        "https://tauri.localhost",
        "https://marketplace.otoyin.app",
        "https://otoyin-marketplace.pages.dev",
        *settings.allowed_origins,
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(catalog.router)
app.include_router(checkout.router)
app.include_router(webhook.router)
app.include_router(notices.router)
app.include_router(crashes.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "marketplace"}
