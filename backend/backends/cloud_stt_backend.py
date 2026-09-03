"""Cloud STT backend — transcribes audio via a user-supplied OpenAI-compatible
Whisper API key (BYOK), routed through the ``stt`` provider domain.

This is a thin wrapper over :func:`backend.services.cloud_provider.transcribe_via_cloud`.
It intentionally does NOT implement word-level or segment timestamps: hosted Whisper
endpoints return plain text. Those features remain on the local Whisper backends
(see ``transcript_edit`` / ``diarization``), which require on-device models anyway.
"""

from __future__ import annotations

import logging

from ..services.cloud_provider import transcribe_via_cloud

logger = logging.getLogger(__name__)


class CloudSTTBackend:
    """STTBackend implementation that delegates to a cloud transcription API.

    Satisfies the STTBackend protocol for the routes that only need plain text
    (the main ``/transcribe`` path). No local model is loaded or cached.
    """

    def __init__(self) -> None:
        self._loaded = True

    async def load_model(self, model_size: str) -> None:
        # Cloud transcription needs no local model; nothing to load.
        self._loaded = True

    async def transcribe(
        self,
        audio_path: str,
        language: str | None = None,
        model_size: str | None = None,
    ) -> str:
        """Transcribe audio to text via the configured ``stt`` cloud provider."""
        logger.info("Cloud STT transcription requested (language=%s)", language)
        return await transcribe_via_cloud(audio_path, language=language, domain="stt")

    async def transcribe_with_segments(
        self,
        audio_path: str,
        language: str | None = None,
        model_size: str | None = None,
    ) -> dict:
        raise NotImplementedError(
            "Cloud STT returns plain text only. Use a local Whisper model "
            "(Settings -> Models) for segment-level timestamps."
        )

    async def transcribe_with_words(
        self,
        audio_path: str,
        language: str | None = None,
        model_size: str | None = None,
    ) -> list[dict]:
        raise NotImplementedError(
            "Cloud STT returns plain text only. Use a local Whisper model "
            "(Settings -> Models) for word-level timestamps and transcript editing."
        )

    def unload_model(self) -> None:
        # Nothing local to free.
        self._loaded = False

    def is_loaded(self) -> bool:
        return self._loaded
