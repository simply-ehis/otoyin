"""Cloud models router — proxies LLM/TTS/donation requests to a private cloud router."""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cloud", tags=["cloud-models"])

ROUTER_URL = os.getenv("CLOUD_ROUTER_URL", "").rstrip("/")
ROUTER_KEY = os.getenv("CLOUD_ROUTER_API_KEY", "")
DEV_SUBSCRIPTION_KEY = os.getenv("CLOUD_SUBSCRIPTION_KEY", "")
ALLOWED_KEYS = [k.strip() for k in os.getenv("CLOUD_ALLOWED_KEYS", "").split(",") if k.strip()]


def require_subscription(x_subscription_key: Optional[str] = Header(default=None)) -> str:
    key = x_subscription_key or DEV_SUBSCRIPTION_KEY
    if not key:
        raise HTTPException(status_code=401, detail="Missing subscription key")
    if ALLOWED_KEYS and key not in ALLOWED_KEYS and key != DEV_SUBSCRIPTION_KEY:
        raise HTTPException(status_code=403, detail="Invalid subscription key")
    return key


def _headers() -> dict[str, str]:
    h = {"Content-Type": "application/json"}
    if ROUTER_KEY:
        h["Authorization"] = f"Bearer {ROUTER_KEY}"
    return h


class LlmRequest(BaseModel):
    messages: list[dict[str, Any]]
    model: Optional[str] = None
    temperature: float = 0.7
    max_tokens: int = 1024


class TtsRequest(BaseModel):
    text: str
    voice: Optional[str] = None
    format: str = "wav"


class DonateRequest(BaseModel):
    amount: float
    email: Optional[str] = None


@router.get("/status")
def status(_sub: str = Depends(require_subscription)) -> dict[str, Any]:
    return {
        "router_configured": bool(ROUTER_URL),
        "tiers": ["llm", "tts"],
        "subscription_ok": True,
    }


@router.post("/llm")
async def cloud_llm(
    req: LlmRequest,
    _sub: str = Depends(require_subscription),
) -> dict[str, Any]:
    if not ROUTER_URL:
        raise HTTPException(status_code=503, detail="Cloud router not configured")
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(
                f"{ROUTER_URL}/v1/chat/completions",
                json={
                    "model": req.model,
                    "messages": req.messages,
                    "temperature": req.temperature,
                    "max_tokens": req.max_tokens,
                },
                headers=_headers(),
            )
            r.raise_for_status()
            return r.json()
    except httpx.HTTPError as e:
        logger.exception("cloud llm failed")
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/tts")
async def cloud_tts(
    req: TtsRequest,
    _sub: str = Depends(require_subscription),
):
    if not ROUTER_URL:
        raise HTTPException(status_code=503, detail="Cloud router not configured")
    try:
        client = httpx.AsyncClient(timeout=120.0)
        r = await client.post(
            f"{ROUTER_URL}/v1/audio/speech",
            json={"input": req.text, "voice": req.voice, "response_format": req.format},
            headers=_headers(),
        )
        r.raise_for_status()
        content_type = r.headers.get("content-type", f"audio/{req.format}")

        async def _stream():
            try:
                async for chunk in r.aiter_bytes():
                    yield chunk
            finally:
                await r.aclose()
                await client.aclose()

        return StreamingResponse(_stream(), media_type=content_type)
    except httpx.HTTPError as e:
        logger.exception("cloud tts failed")
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/donate")
async def cloud_donate(req: DonateRequest) -> dict[str, Any]:
    if not ROUTER_URL:
        raise HTTPException(status_code=503, detail="Cloud router not configured")
    if req.amount < 1:
        raise HTTPException(status_code=400, detail="Minimum donation is $1")
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(
                f"{ROUTER_URL}/v1/donations",
                json={"amount": req.amount, "email": req.email},
                headers=_headers(),
            )
            r.raise_for_status()
            return r.json()
    except httpx.HTTPError as e:
        logger.exception("cloud donate failed")
        raise HTTPException(status_code=502, detail=str(e))