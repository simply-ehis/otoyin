"""
STT (Speech-to-Text) module - delegates to backend abstraction layer.
"""

from ..backends import STTBackend, get_stt_backend


def get_whisper_model() -> STTBackend:
    """
    Get STT backend instance.

    Returns:
        STT backend instance
    """
    return get_stt_backend()


def unload_whisper_model():
    """Unload Whisper model to free memory."""
    backend = get_stt_backend()
    backend.unload_model()


async def transcribe_via_cloud_stt(audio_path: str, language: str | None = None) -> str:
    """Transcribe ``audio_path`` using the configured BYOK cloud STT provider.

    Raises ``LookupError`` if no cloud provider is configured so the caller can
    surface a clear error.
    """
    from .cloud_provider import transcribe_via_cloud

    return transcribe_via_cloud(audio_path, language=language, domain="stt")
