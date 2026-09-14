"""Single resident TTS slot: switching providers offloads the previous model."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from backend.backends import registry


def test_load_engine_model_offloads_other_loaded_tts():
    saved = registry._tts_backends
    try:
        loaded_other = MagicMock()
        loaded_other.is_loaded.return_value = True
        idle_other = MagicMock()
        idle_other.is_loaded.return_value = False
        registry._tts_backends = {"kokoro": loaded_other, "orpheus": idle_other}

        target = MagicMock()
        target.is_loaded.return_value = False
        target.load_model = AsyncMock()

        with (
            patch.object(registry, "get_tts_backend_for_engine", return_value=target),
            patch("backend.services.model_registry.is_downloaded", return_value=True),
        ):
            asyncio.run(registry.load_engine_model("orpheus", "default"))

        # The previously-loaded engine must be offloaded; the idle one untouched.
        loaded_other.unload_model.assert_called_once()
        idle_other.unload_model.assert_not_called()
        # The newly selected engine is loaded (non-f5 path).
        target.load_model.assert_called_once_with("default")
    finally:
        registry._tts_backends = saved


def test_load_engine_model_awaits_backend_load():
    # The registry awaits backend.load_model(size) — the load_model_async
    # variant and the f5_tts engine no longer exist (CC-BY-NC removal).
    saved = registry._tts_backends
    try:
        registry._tts_backends = {}
        target = MagicMock()
        target.is_loaded.return_value = False
        target.load_model = AsyncMock()
        with (
            patch.object(registry, "get_tts_backend_for_engine", return_value=target),
            patch("backend.services.model_registry.is_downloaded", return_value=True),
        ):
            asyncio.run(registry.load_engine_model("kokoro", "small"))
        target.load_model.assert_called_once_with("small")
    finally:
        registry._tts_backends = saved
