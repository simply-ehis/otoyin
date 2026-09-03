"""Community presets routes.

Serves community-contributed effect presets for the in-app Community Presets panel.
"""

import json
import logging
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/community-presets", tags=["community-presets"])

_PRESETS_PATH = Path(__file__).resolve().parent.parent / "data" / "community_presets.json"


@lru_cache(maxsize=1)
def _load_presets() -> dict:
    """Load and cache the presets catalog."""
    try:
        return json.loads(_PRESETS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Community presets catalog unreadable (%s); serving empty catalog", exc)
        return {"version": 0, "presets": []}


@router.get("")
async def list_community_presets(
    category: str | None = None,
    search: str | None = None,
):
    """Return community presets, optionally filtered by category and search."""
    catalog = _load_presets()
    presets = catalog.get("presets", [])

    if category:
        presets = [p for p in presets if p.get("category") == category]

    if search:
        search_lower = search.lower()
        presets = [
            p
            for p in presets
            if search_lower in p.get("name", "").lower()
            or search_lower in p.get("description", "").lower()
            or search_lower in " ".join(p.get("tags", [])).lower()
        ]

    return presets


@router.get("/categories")
async def list_preset_categories():
    """Return list of available preset categories."""
    catalog = _load_presets()
    categories = set()
    for p in catalog.get("presets", []):
        cat = p.get("category")
        if cat:
            categories.add(cat)
    return sorted(categories)
