"""Crash ingest API — receives opt-in crash reports from desktop apps.

Senders (backend forward, frontend reporter, Rust hook export) redact
emails, API keys, and home paths BEFORE sending; this endpoint stores the
payload verbatim and never mines it. Reads are admin-only.

Size caps keep a misbehaving client from filling the table: oversized
message/stack/context are truncated, and payloads over ~64KB are rejected.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models import CrashReport, async_session

router = APIRouter(prefix="/v1/crashes", tags=["crashes"])

MAX_BODY_BYTES = 64 * 1024
MAX_MESSAGE_CHARS = 2000
MAX_STACK_CHARS = 20000
MAX_CONTEXT_CHARS = 4000


class CrashIn(BaseModel):
    """Report payload, as built by the desktop crash pipeline."""

    report: dict = {}


def _require_admin(authorization: str | None) -> None:
    if not settings.admin_key:
        raise HTTPException(status_code=503, detail="Admin key not configured")
    if authorization != f"Bearer {settings.admin_key}":
        raise HTTPException(401, detail={"code": "invalid_key", "message": "Invalid or missing admin key"})


async def get_db():
    async with async_session() as session:
        yield session


@router.post("", status_code=201)
async def ingest_crash(body: CrashIn, db: AsyncSession = Depends(get_db)) -> dict:
    """Store one crash report. Open ingest (senders are opted-in users)."""
    report = body.report if isinstance(body.report, dict) else {}
    if len(json.dumps(report, default=str).encode("utf-8")) > MAX_BODY_BYTES:
        raise HTTPException(413, detail={"code": "too_large", "message": "Crash report exceeds 64KB"})
    layer = str(report.get("layer", ""))[:16]
    if layer not in ("backend", "frontend", "rust"):
        layer = "frontend"
    try:
        context = json.dumps(report.get("context") or {})[:MAX_CONTEXT_CHARS]
    except (TypeError, ValueError):
        context = "{}"
    row = CrashReport(
        report_id=str(report.get("id", ""))[:64],
        layer=layer,
        kind=str(report.get("kind", ""))[:128],
        message=str(report.get("message", ""))[:MAX_MESSAGE_CHARS],
        stack=str(report.get("stack", ""))[:MAX_STACK_CHARS],
        context=context,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"status": "ok", "id": row.id}


@router.get("/admin")
async def list_crashes(
    limit: int = 50,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Newest-first crash reports (admin only)."""
    _require_admin(authorization)
    result = await db.execute(select(CrashReport).order_by(desc(CrashReport.id)).limit(max(1, min(limit, 200))))
    return {
        "crashes": [
            {
                "id": r.id,
                "report_id": r.report_id,
                "layer": r.layer,
                "kind": r.kind,
                "message": r.message,
                "stack": r.stack,
                "context": r.context,
                "received_at": r.received_at.isoformat() if r.received_at else None,
            }
            for r in result.scalars()
        ]
    }
