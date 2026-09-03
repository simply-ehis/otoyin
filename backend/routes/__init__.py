"""Route registration for the otoyin API.

Convention: any .py file in this directory that defines a module-level
``router`` attribute (an ``APIRouter``) is auto-discovered and included.

To add a new route:
  1. Create ``backend/routes/my_feature.py``
  2. Define ``router = APIRouter()`` at module level
  3. Done — no edits to this file needed.

Ordering matters for the SPA catch-all: ``health`` must be registered
first so its ``/`` root route takes priority over the catch-all in
``app.py``.  All other routers are included alphabetically.
"""

import importlib
import logging
import pkgutil
from pathlib import Path

from fastapi import FastAPI
from fastapi.routing import APIRouter

logger = logging.getLogger(__name__)


def register_routers(app: FastAPI) -> None:
    """Auto-discover and include all domain routers."""
    package_dir = Path(__file__).resolve().parent

    # --- Step 1: Register health first (SPA root priority) ---
    health_mod = importlib.import_module(".health", package=__package__)
    app.include_router(health_mod.router)

    # --- Step 2: Register audio_pipeline explicitly (subpackage with combined router) ---
    # Hard failure here would take down the whole API — wrap in try/except
    # like the auto-discovery loop below so a broken DSP/effects import
    # degrades gracefully (503/501 on those endpoints) instead of crashing boot.
    discovered: list[str] = []
    try:
        from .audio_pipeline import router as audio_pipeline_router

        app.include_router(audio_pipeline_router)
        discovered.append("audio_pipeline")
    except Exception as exc:
        logger.error("Failed to import audio_pipeline router: %s", exc, exc_info=True)
        # Continue: the rest of the API remains available

    # --- Step 3: Auto-discover every .py in this package with a router attr ---
    skipped = {"__init__", "health", "audio_pipeline"}  # handled above

    for module_info in pkgutil.iter_modules([str(package_dir)]):
        name = module_info.name
        if name in skipped or name.startswith("_"):
            continue

        try:
            mod = importlib.import_module(f".{name}", package=__package__)
        except Exception as exc:
            # A broken route is a real problem — log at error level so it
            # shows up in monitoring. The endpoint will be missing, which
            # the /health endpoint should surface.
            logger.error("Failed to import route module %s: %s", name, exc)
            continue

        router = getattr(mod, "router", None)
        # Accept only genuine APIRouter instances. On PACKAGES, getattr can
        # resolve to an imported SUBMODULE named ``router`` (Python submodule
        # semantics), which must never reach include_router.
        if not isinstance(router, APIRouter):
            continue

        app.include_router(router)
        discovered.append(name)

    logger.info(
        "Routes: registered %d routers (%s)",
        len(discovered) + 1,  # +1 for health
        ", ".join(sorted(discovered)),
    )
