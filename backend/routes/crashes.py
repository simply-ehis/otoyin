"""Crash-reporting endpoints + unhandled-exception capture middleware.

All routes are local-first: records land in ``services.crash_reports``
(JSONL under the data dir) and are forwarded to the marketplace ingest
only when crash reporting is enabled AND ``OTOYIN_CRASH_URL`` is set.

``POST /crashes/report`` is the frontend/Rust entry point — payloads are
scrubbed again server-side even though senders redact first.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware

from ..services import crash_reports

logger = logging.getLogger(__name__)

router = APIRouter()


class ToggleRequest(BaseModel):
    enabled: bool


class ClientReport(BaseModel):
    layer: str = "frontend"
    kind: str = "Error"
    message: str = ""
    stack: str = ""
    context: dict = {}


class CrashCaptureMiddleware(BaseHTTPMiddleware):
    """Capture unhandled backend exceptions as crash reports, then re-raise.

    Re-raising preserves every existing error response (500s, handlers) —
    this layer only observes. Capture itself never raises: a broken capture
    path must not turn a working request into a 500. Also feeds the
    recent-request trail so the next record shows last actions.
    """

    async def dispatch(self, request, call_next):
        try:
            crash_reports.record_action(
                request.method,
                request.url.path,
                request.headers.get("X-Request-ID"),
            )
        except Exception:
            pass
        try:
            return await call_next(request)
        except Exception as exc:
            try:
                crash_reports.capture_exception(
                    exc,
                    context={
                        "path": request.url.path,
                        "method": request.method,
                        "request_id": request.headers.get("X-Request-ID"),
                    },
                )
            except Exception as capture_error:
                logger.debug("Crash capture failed: %s", capture_error)
            raise


@router.get("/crashes/status")
def crash_status() -> dict:
    """Whether crash reporting is enabled + local/forward counters."""
    return crash_reports.get_status()


@router.post("/crashes/toggle")
def toggle_crash_reporting(request: ToggleRequest) -> dict:
    """Opt in/out of crash report SHARING. Local on-device logging stays on
    regardless; this only controls forwarding. Independent of usage telemetry."""
    if request.enabled:
        crash_reports.enable_crash_reporting()
    else:
        crash_reports.disable_crash_reporting()
    return crash_reports.get_status()


@router.get("/crashes/events")
def list_crash_reports(limit: int = 100) -> dict:
    """Newest-first local crash records (diagnostics UI, support export)."""
    return {"reports": crash_reports.read_reports(limit=limit)}


@router.delete("/crashes/events")
def clear_crash_reports() -> dict:
    """Delete the local crash log. Returns the removed count."""
    return {"removed": crash_reports.clear_reports()}


@router.post("/crashes/report")
def submit_crash_report(report: ClientReport) -> dict:
    """Accept a frontend/Rust crash report. Always stored locally on-device."""
    record = crash_reports.capture_report(
        layer=report.layer,
        kind=report.kind,
        message=report.message,
        stack=report.stack,
        context=report.context,
    )
    return {"stored": record is not None, "id": record["id"] if record else None}
