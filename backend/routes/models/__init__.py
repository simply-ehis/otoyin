"""Model management endpoints.

This package re-exports ``router`` so that existing imports such as
``from routes.models import router`` keep working unchanged.  The route
handlers and helpers live in the submodules (common, load_unload, cache,
migrations, status, download, capabilities).
"""

# Import submodules so their @router decorators register on the shared router.
from . import (
    always_on,
    cache,
    capabilities,
    download,
    load_unload,
    migrations,
    recommended,
    status,
)
from .common import (
    STEAMAUDIO_PLATFORMS,
    STEAMAUDIO_URL,
    STEAMAUDIO_VERSION,
    _copy_with_progress,
    _download_executor,
    _download_steam_audio_sdk,
    _get_dir_size,
    _safe_available,
    router,
)

__all__ = [
    "STEAMAUDIO_PLATFORMS",
    "STEAMAUDIO_URL",
    "STEAMAUDIO_VERSION",
    "_copy_with_progress",
    "_download_executor",
    "_download_steam_audio_sdk",
    "_get_dir_size",
    "_safe_available",
    "router",
]
