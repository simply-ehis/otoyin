"""Cloud voice-conversion backend — BYOK, routed through the ``vc`` domain.

There is no universal cloud voice-conversion API, so the user's configured
``base_url`` IS the full provider endpoint. This backend uploads the source
audio and target voice name to it and decodes the returned audio. No local
model is loaded.
"""

from __future__ import annotations

import logging

import numpy as np

from ..services.cloud_provider import convert_voice_via_cloud

logger = logging.getLogger(__name__)


class CloudVCBackend:
    """VCBackend implementation that delegates to a cloud voice-conversion provider."""

    def __init__(self) -> None:
        self._loaded = True

    def load_model(self, voice_name: str = "") -> None:
        self._loaded = True

    def convert(
        self,
        audio: np.ndarray,
        sr: int,
        voice_name: str,
        *,
        pitch_shift: int = 0,
    ) -> tuple[np.ndarray, int]:
        """Convert ``audio`` into ``voice_name`` via the ``vc`` cloud provider."""
        logger.info("Cloud voice conversion requested (voice=%s)", voice_name)
        try:
            return convert_voice_via_cloud(
                audio,
                sr,
                voice_name,
                pitch_shift=pitch_shift,
                domain="vc",
            )
        except LookupError as exc:
            raise RuntimeError(str(exc)) from exc

    def is_loaded(self) -> bool:
        return self._loaded

    def unload_model(self) -> None:
        self._loaded = False


cloud_vc_backend = CloudVCBackend()
