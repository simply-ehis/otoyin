"""Marketplace server — serves catalog, handles payments, signs licenses."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .models import init_db
from .routes import catalog, checkout, crashes, notices, webhook
from .signing import get_signer


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create DB tables, initialize signer."""
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
        "tauri://localhost",
        "https://tauri.localhost",
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
