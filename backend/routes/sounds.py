"""Freesound SFX search + preview download endpoints."""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..errors import ERR_FRESOUND_DOWNLOAD_FAILED, ERR_FRESOUND_UNAVAILABLE

router = APIRouter()


class PreviewDownloadBody(BaseModel):
    preview_url: str


@router.get("/sounds/search")
async def search_sounds(
    q: str = Query(..., min_length=1, description="Search query"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    filter: str | None = Query(None, description="Freesound filter expr"),
    sort: str = Query("score"),
):
    """Search Freesound for matching sound effects.

    Requires ``FREESOUND_API_KEY`` env var. Results are cached locally.
    """
    from ..services.freesound import is_configured, search_sounds

    if not is_configured():
        raise HTTPException(
            status_code=503,
            detail="Freesound API key not configured (set FREESOUND_API_KEY)",
        )
    try:
        return search_sounds(q, page, page_size, filter, sort)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=ERR_FRESOUND_UNAVAILABLE) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=ERR_FRESOUND_UNAVAILABLE) from exc


@router.post("/sounds/download/{sound_id}")
async def download_sound(sound_id: str, body: PreviewDownloadBody):
    """Download a sound's preview to local storage and return the file path."""
    from ..services.freesound import download_preview, is_configured

    if not is_configured():
        raise HTTPException(
            status_code=503,
            detail="Freesound API key not configured (set FREESOUND_API_KEY)",
        )
    try:
        path = download_preview(sound_id, body.preview_url)
        # Return a storage-relative path so the frontend can build a proper URL
        from ..config import to_storage_path

        rel = to_storage_path(path)
        return {"sound_id": sound_id, "path": rel, "absolute_path": str(path), "cached": True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=ERR_FRESOUND_DOWNLOAD_FAILED) from exc
