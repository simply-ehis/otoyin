"""Support / feedback intake.

Offline by design: the request is logged server-side and acknowledged. No
external ticketing system is wired up, so this keeps the contact/support
surface functional without a network dependency.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter
from pydantic import BaseModel

from ..services import announcements as announcements_service

logger = logging.getLogger(__name__)

router = APIRouter()


class SupportRequest(BaseModel):
    kind: str = "feedback"  # feedback | bug | question
    subject: str = ""
    message: str
    email: str | None = None


@router.post("/support/request")
def support_request(req: SupportRequest) -> dict:
    return announcements_service.create_support_request(req.kind, req.subject, req.message, req.email)
