"""Recipe runner endpoint: orchestrate a content-type recipe into finished audio."""

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
router = APIRouter()


class RecipeSegment(BaseModel):
    audio_path: str
    effects: list[dict] = Field(default_factory=list)


class RecipeRunRequest(BaseModel):
    segments: list[RecipeSegment]
    recipe: str = "podcast"
    music_path: str | None = None
    target_lufs: float | None = None
    true_peak_db: float = -1.0
    gap_ms: int = 250


@router.post("/recipe/run")
async def run_recipe(body: RecipeRunRequest):
    """Run a named content recipe end-to-end over generated segments.

    Each segment is a generated clip (storage path) with optional cleanup effects.
    Returns the mastered export path + measured integrated LUFS.
    """
    try:
        from ..services.recipe_runner import recipe_run

        result = recipe_run(
            [s.model_dump() for s in body.segments],
            recipe=body.recipe,
            music_path=body.music_path,
            target_lufs=body.target_lufs,
            true_peak_db=body.true_peak_db,
            gap_ms=body.gap_ms,
        )
        return result
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
