"""Keyboard shortcuts / keymap routes.

Serves static keymap definitions for the in-app Shortcuts panel.
"""

import json
import logging
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..errors import ERR_KEYMAP_NOT_FOUND

logger = logging.getLogger(__name__)
router = APIRouter()

_KEYMAPS_PATH = Path(__file__).resolve().parent.parent / "data" / "keymaps.json"


class KeymapRequest(BaseModel):
    keymap_id: str


@lru_cache(maxsize=1)
def _load_keymaps() -> dict:
    """Load and cache the keymaps catalog."""
    try:
        return json.loads(_KEYMAPS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Keymaps catalog unreadable (%s); serving empty catalog", exc)
        return {"version": 0, "keymaps": []}


@router.get("/shortcuts/keymaps")
async def list_keymaps():
    """Return the list of available keymaps (id, name only)."""
    catalog = _load_keymaps()
    return [
        {"id": k.get("id"), "name": k.get("name"), "shortcuts": k.get("shortcuts", [])}
        for k in catalog.get("keymaps", [])
    ]


@router.post("/shortcuts/keymap")
async def get_keymap(request: KeymapRequest):
    """Return the full keymap for the given ID."""
    catalog = _load_keymaps()
    for k in catalog.get("keymaps", []):
        if k.get("id") == request.keymap_id:
            return {"keymap": k}
    raise HTTPException(status_code=404, detail=ERR_KEYMAP_NOT_FOUND)
