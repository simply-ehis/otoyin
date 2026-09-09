"""Content endpoints: what's-new, announcements, and offers.

All responses are bundled/offline (see backend.services.announcements).
The frontend consumes them for the banner, notification center, What's
New page, and the offers UI.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter

from ..services import announcements as announcements_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/content/whats-new")
def whats_new() -> dict:
    """Changelog feed (newest first)."""
    return {"entries": announcements_service.get_whats_new()}


@router.get("/content/announcements")
async def announcements() -> dict:
    """Top-of-app banner messages."""
    from ..utils.startup_defer import ensure_notices_started

    await ensure_notices_started()
    return {"announcements": announcements_service.get_announcements()}


@router.get("/content/offers")
def offers() -> dict:
    """Active special offers / promotions."""
    return {"offers": announcements_service.get_offers()}
