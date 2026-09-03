"""Help center routes — machine-readable app feature catalog.

Serves ``backend/data/app_features.json`` (single source of truth mirroring
``docs/FEATURES.md``) to the in-app Help Center and to agents via the
``app_help`` assistant tool / ``21labs.help`` MCP tool.
"""

import json
import logging
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Query

logger = logging.getLogger(__name__)
router = APIRouter()

_FEATURES_PATH = Path(__file__).resolve().parent.parent / "data" / "app_features.json"


@lru_cache(maxsize=1)
def _load_catalog() -> dict:
    """Load and cache the feature catalog (single JSON file, read once)."""
    try:
        return json.loads(_FEATURES_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Feature catalog unreadable (%s); serving empty catalog", exc)
        return {"version": 0, "features": []}


def search_features(query: str, limit: int = 5) -> list[dict]:
    """Rank catalog features against ``query`` by keyword/name/summary hits.

    Shared by the REST endpoint and the agent tool surfaces so scoring is
    identical everywhere. Returns at most ``limit`` hits with the fields the
    UI/agent need (id, name, category, summary, where, tools, score).
    """
    q = query.strip().lower()
    if not q:
        return []
    tokens = [t for t in q.replace("-", " ").split() if t]
    if not tokens:
        return []

    scored: list[tuple[float, dict]] = []
    for feature in _load_catalog().get("features", []):
        name = feature.get("name", "").lower()
        category = feature.get("category", "").lower()
        summary = feature.get("summary", "").lower()
        keywords = [k.lower() for k in feature.get("keywords", [])]

        score = 0.0
        # Whole-phrase matches weigh most (multi-word keywords like
        # "voice chat" only fire this way).
        if q in name:
            score += 5.0
        if any(q == kw or q in kw or kw in q for kw in keywords):
            score += 4.0
        if q in summary:
            score += 1.0

        # Per-token hits refine ranking for multi-word queries.
        for token in tokens:
            if token in name:
                score += 2.0
            if any(token in kw for kw in keywords):
                score += 1.5
            if token in category:
                score += 0.5

        if score > 0:
            scored.append((score, feature))

    scored.sort(key=lambda pair: (-pair[0], pair[1].get("name", "")))
    return [
        {
            "id": f.get("id"),
            "name": f.get("name"),
            "category": f.get("category"),
            "summary": f.get("summary"),
            "where": f.get("where"),
            "tools": f.get("tools", []),
            "score": round(s, 2),
        }
        for s, f in scored[:limit]
    ]


@router.get("/help/features")
async def get_help_features():
    """Return the full feature catalog."""
    catalog = _load_catalog()
    return {"version": catalog.get("version", 0), "features": catalog.get("features", [])}


@router.get("/help/search")
async def search_help(q: str = Query(default="", description="Free-text feature query")):
    """Search the feature catalog; top 5 hits with location + tools."""
    return {"query": q, "results": search_features(q, limit=5)}
