"""Cloud music-generation backend — BYOK, routed through the ``music`` domain.

There is no universal cloud music API, so the user's configured ``base_url``
IS the full provider endpoint. This backend posts the otoyin BYOK music
contract to it and decodes the returned audio. No local model is loaded.
"""

from __future__ import annotations

import logging

import numpy as np

from ..services.cloud_provider import generate_music_via_cloud

logger = logging.getLogger(__name__)


class CloudMusicBackend:
    """MusicBackend implementation that delegates to a cloud music provider."""

    def __init__(self) -> None:
        self._loaded = True

    def load_model(self) -> None:
        self._loaded = True

    def generate(
        self,
        prompt: str,
        duration_seconds: float = 30.0,
        genre: str = "pop",
        mood: str = "neutral",
        tempo: int | None = None,
        seed: int | None = None,
    ) -> tuple[np.ndarray, int]:
        """Generate music audio from a text prompt via the ``music`` cloud provider."""
        logger.info("Cloud music generation requested (genre=%s, mood=%s)", genre, mood)
        return generate_music_via_cloud(
            prompt=prompt,
            duration_seconds=duration_seconds,
            genre=genre,
            mood=mood,
            tempo=tempo,
            seed=seed,
            domain="music",
        )

    def is_available(self) -> bool:
        return True

    def is_loaded(self) -> bool:
        return self._loaded

    def unload_model(self) -> None:
        self._loaded = False


cloud_music_backend = CloudMusicBackend()
