"""Automation, Cues, and Smart Crossfade endpoints."""

import numpy as np
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class AutomationLane(BaseModel):
    parameter: str
    points: list[list[float]] = []
    clip_id: str | None = None


class CueGridCell(BaseModel):
    slot: int
    audio_path: str = ""
    label: str = ""
    hotkey: str | None = None
    midi_note: int | None = None


class CueMatrix(BaseModel):
    rows: int = 4
    cols: int = 4
    cells: list[CueGridCell] = []


class InterpolationRequest(BaseModel):
    points: list[list[float]]
    curve: str = "linear"


AUTOMATION_PARAMS = {
    "volume": {"name": "Volume", "min": 0.0, "max": 2.0, "default": 1.0},
    "pan": {"name": "Pan", "min": -1.0, "max": 1.0, "default": 0.0},
    "mute": {"name": "Mute", "min": 0, "max": 1, "default": 0},
    "pitch": {"name": "Pitch", "min": -12, "max": 12, "default": 0},
    "reverb": {"name": "Reverb Mix", "min": 0, "max": 1, "default": 0},
    "delay": {"name": "Delay Mix", "min": 0, "max": 1, "default": 0},
    "eq_low": {"name": "EQ Low", "min": -12, "max": 12, "default": 0},
    "eq_mid": {"name": "EQ Mid", "min": -12, "max": 12, "default": 0},
    "eq_high": {"name": "EQ High", "min": -12, "max": 12, "default": 0},
    "distortion": {"name": "Distortion", "min": 0, "max": 1, "default": 0},
    "chorus": {"name": "Chorus Mix", "min": 0, "max": 1, "default": 0},
}

CROSSFADE_CURVES = {
    "linear": {"name": "Linear", "description": "Simple linear interpolation"},
    "logarithmic": {"name": "Logarithmic", "description": "Fast start, slow end"},
    "exponential": {"name": "Exponential", "description": "Slow start, fast end"},
    "equal_power": {"name": "Equal Power", "description": "No perceived volume dip"},
}


@router.get("/automation/parameters")
async def list_automation_parameters():
    """List available automation parameters."""
    return AUTOMATION_PARAMS


@router.get("/automation/crossfade-curves")
async def list_crossfade_curves():
    """List available crossfade curve types."""
    return CROSSFADE_CURVES


@router.post("/automation/interpolate")
async def interpolate_automation_points(req: InterpolationRequest):
    """Interpolate automation points to generate a smooth envelope."""
    points = req.points
    curve = req.curve
    if len(points) < 2:
        return {"envelope": points}

    result = []
    for i in range(len(points) - 1):
        x0, y0 = points[i]
        x1, y1 = points[i + 1]
        steps = max(1, int(x1 - x0))
        for j in range(steps):
            t = j / steps
            if curve == "logarithmic":
                t = np.log1p(t) / np.log1p(1.0)
            elif curve == "exponential":
                t = 1.0 - np.exp(-3.0 * t)
            elif curve == "equal_power":
                t = np.sin(t * np.pi / 2)
            result.append([x0 + j, y0 + (y1 - y0) * t])

    return {"envelope": result}
