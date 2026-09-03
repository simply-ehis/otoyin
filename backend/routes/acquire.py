"""REST routes for asset acquisition (auto-discovered by register_routers)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

try:
    from ..agents.acquire import acquire_asset, search_assets
    from ..agents.acquire.manager import VALID_SOURCES
except ImportError:  # pragma: no cover - bundled layout
    from agents.acquire import acquire_asset, search_assets
    from agents.acquire.manager import VALID_SOURCES

router = APIRouter(prefix="/acquire", tags=["acquire"])


class AcquireSearch(BaseModel):
    source: str
    query: str
    limit: int = 20
    asset_type: str = "all"


class AcquireDownload(BaseModel):
    source: str
    url: str | None = None
    asset_id: str | None = None
    asset_type: str | None = None
    filename: str | None = None
    resolution: str = "1k"


def _handle_errors(fn):
    try:
        return fn()
    except (ValueError, RuntimeError) as exc:
        # Covers SSRF blocks, unknown sources, missing params, and the
        # Freesound "API key missing" case.
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/search")
def api_search(body: AcquireSearch):
    if body.source not in VALID_SOURCES:
        raise HTTPException(status_code=400, detail=f"source must be one of {VALID_SOURCES}")
    return _handle_errors(lambda: search_assets(body.source, body.query, limit=body.limit))


@router.post("/download")
def api_download(body: AcquireDownload):
    if body.source not in VALID_SOURCES:
        raise HTTPException(status_code=400, detail=f"source must be one of {VALID_SOURCES}")
    return _handle_errors(
        lambda: acquire_asset(
            body.source,
            url=body.url,
            asset_id=body.asset_id,
            asset_type=body.asset_type,
            filename=body.filename,
            resolution=body.resolution,
        )
    )
