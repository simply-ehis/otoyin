"""Audio Pipeline — consolidated router for all audio processing endpoints.

This package replaces the former flat route files (audio.py, audio_effects.py,
audio_processing.py, dsp.py, effects.py, audio_bridge.py) with a single
organized module. Each sub-module owns its domain; this __init__ combines
them into one router for auto-discovery.

Modules:
    bounce      — Track bounce/mix pipeline (from audio.py)
    effects     — Audio effects, breath/pause, tags (from audio_effects.py)
    processing  — Compression, normalization, ducking, editing (from audio_processing.py)
    dsp         — Offline DSP/synth endpoints (from dsp.py)
    presets     — Effect presets and generation versions (from effects.py)
    bridge      — General audio import/export bridge (from audio_bridge.py)
"""

from fastapi import APIRouter

from .bounce import router as bounce_router
from .bridge import router as bridge_router
from .dsp import router as dsp_router
from .effects import router as effects_router
from .presets import router as presets_router
from .processing import router as processing_router

router = APIRouter()

router.include_router(bounce_router)
router.include_router(effects_router)
router.include_router(processing_router)
router.include_router(dsp_router)
router.include_router(presets_router)
router.include_router(bridge_router)

__all__ = ["router"]
