"""Presenter: normalise handler results and map errors to HTTP/MCP envelopes.

The deepened module returns one shape regardless of which transport called it.
JSON results pass through; audio results become a base64 envelope; exceptions
become a (status, message) pair that both the HTTP route and the MCP tool use.
"""

from __future__ import annotations

import base64
import contextlib
import io
import logging

logger = logging.getLogger(__name__)


def to_audio_envelope(audio, sample_rate: int) -> dict:
    """Encode raw audio (np.ndarray) into the base64 envelope MCP clients expect.

    Mirrors the contract the old ``_rest`` loopback produced for audio
    responses, so callers see no behaviour change.
    """
    import soundfile as sf

    buffer = io.BytesIO()
    sf.write(buffer, audio, sample_rate, format="WAV")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    duration = 0.0
    with contextlib.suppress(Exception):  # pragma: no cover - defensive
        duration = float(len(audio)) / float(sample_rate)
    return {
        "audio_base64": encoded,
        "sample_rate": sample_rate,
        "duration": duration,
    }


def to_envelope(result):
    """Return a transport-neutral representation of a handler result.

    * pydantic models / dicts / lists pass through unchanged (JSON surface)
    * a ``(audio_ndarray, sample_rate)`` tuple becomes a base64 audio envelope
    """
    if isinstance(result, tuple) and len(result) == 2:
        audio, sample_rate = result
        if hasattr(audio, "ndim"):  # numpy array (or array-like)
            return to_audio_envelope(audio, sample_rate)
    return result


def map_error(exc: Exception) -> tuple[int, str]:
    """Map a handler exception to (status_code, message).

    ``ValueError`` is a domain validation error -> 400 with the message.
    Anything else is an unexpected failure -> 500 with a generic message so
    internals never leak to the client.
    """
    if isinstance(exc, ValueError):
        return 400, str(exc)
    logger.exception("Unhandled tool error")
    return 500, "Internal server error"
