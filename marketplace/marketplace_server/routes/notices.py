"""Notices API — push-style announcements served to installed desktop apps.

The desktop app polls ``GET /v1/notices`` on launch (and can refresh on an
interval) and merges the items into its in-app announcements. Notices are
created through the authenticated admin route, so messages ship without an
app release. The response shape matches the frontend ``Announcement`` type
(id, title, message, severity, cta, starts_at, ends_at).

Offline-first by construction: the app keeps its bundled announcements if this
endpoint is unreachable, so a notices outage is invisible to users.
"""

from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models import Notice, async_session

router = APIRouter(prefix="/v1/notices", tags=["notices"])


class NoticeIn(BaseModel):
    """Payload for creating a notice via the admin route."""

    id: str
    title: str = ""
    message: str
    severity: str = "info"  # info | success | warning | promo
    cta_label: str = ""
    cta_to: str = ""
    scope: str = "global"  # global | update | promo
    starts_at: str | None = None  # ISO 8601
    ends_at: str | None = None  # ISO 8601


async def get_db():
    async with async_session() as session:
        yield session


def _to_payload(n: Notice) -> dict:
    """Serialize a Notice to the frontend ``Announcement`` shape."""
    cta = {"label": n.cta_label, "to": n.cta_to} if n.cta_label else None
    return {
        "id": n.id,
        "title": n.title,
        "message": n.message,
        "severity": n.severity,
        "cta": cta,
        "starts_at": n.starts_at.isoformat() if n.starts_at else None,
        "ends_at": n.ends_at.isoformat() if n.ends_at else None,
    }


def _require_admin(authorization: str | None) -> None:
    """Reject non-admin callers. Admin key set via MARKETPLACE_ADMIN_KEY."""
    if not settings.admin_key:
        raise HTTPException(status_code=503, detail="Admin key not configured")
    expected = f"Bearer {settings.admin_key}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing admin key")


@router.get("")
async def list_notices(db: AsyncSession = Depends(get_db)) -> dict:
    """Return active, currently-visible notices (respects start/end windows)."""
    now = dt.datetime.now(dt.UTC)
    result = await db.execute(select(Notice).where(Notice.active.is_(True)))
    payloads = []
    for n in result.scalars():
        if n.starts_at and n.starts_at > now:
            continue
        if n.ends_at and n.ends_at < now:
            continue
        payloads.append(_to_payload(n))
    return {"notices": payloads}


@router.post("/admin", status_code=201)
async def create_notice(
    body: NoticeIn,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Create or update a notice (admin only, Bearer MARKETPLACE_ADMIN_KEY)."""
    _require_admin(authorization)

    def _parse_iso(value: str | None) -> dt.datetime | None:
        if not value:
            return None
        return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))

    existing = await db.get(Notice, body.id)
    if existing is None:
        existing = Notice(id=body.id)
        db.add(existing)
    existing.title = body.title
    existing.message = body.message
    existing.severity = body.severity
    existing.cta_label = body.cta_label
    existing.cta_to = body.cta_to
    existing.scope = body.scope
    existing.starts_at = _parse_iso(body.starts_at)
    existing.ends_at = _parse_iso(body.ends_at)
    existing.active = True
    await db.commit()
    await db.refresh(existing)
    return _to_payload(existing)
