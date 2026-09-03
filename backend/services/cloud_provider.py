"""
Generic cloud-provider client that consumes the BYOK ``model_providers`` store.

True BYOK: a user registers an arbitrary OpenAI-compatible (or provider-
specific) base URL + key per domain (tts/music/sfx/vc/llm). This module is
the single place engines/orchestration call to *use* that credential. It is
opt-in — callers must explicitly request cloud routing; local models remain
the default so the app stays offline-first.

The client is intentionally minimal and provider-agnostic:
  - ``get_cloud_provider(domain)``  -> decrypted ``{base_url, api_key, model}``
                                       or ``None`` if no default provider set.
  - ``call_openai_chat(...)``        -> generic LLM chat completion (llm domain).
  - ``call_openai_speech(...)``      -> generic TTS audio (tts domain), OpenAI
                                       ``/audio/speech`` contract.

Engines that want cloud call these. No curated provider list, no hard-coded
URLs.
"""

from __future__ import annotations

import logging
import os
import tempfile

import httpx
import numpy as np

from ..utils.ssrf import is_url_safe
from . import model_providers as providers

logger = logging.getLogger(__name__)

_HTTP_TIMEOUT = 120.0


def get_cloud_provider(domain: str, db=None) -> dict[str, str] | None:
    """Return decrypted credentials for the default provider of ``domain``.

    Returns ``{"base_url", "api_key", "model"}`` or ``None`` when no default
    provider is configured for that domain. Callers must handle ``None`` by
    falling back to a local model.

    If ``db`` is provided it is reused (and not closed); otherwise a short-lived
    session is opened from the app's ``SessionLocal``.
    """
    own = db is None
    if own:
        # Late-binding: SessionLocal is created by init_db() during app startup.
        from ..database.session import SessionLocal

        db = SessionLocal()
    try:
        row = providers.get_default_provider(db, domain)
        if row is None:
            return None
        return providers.provider_credentials(row)
    finally:
        if own:
            db.close()


def call_openai_chat(
    base_url: str,
    api_key: str,
    model: str,
    messages: list[dict[str, str]],
    *,
    temperature: float = 0.7,
    max_tokens: int = 1024,
    timeout: float = _HTTP_TIMEOUT,
) -> str:
    """Call an OpenAI-compatible ``/chat/completions`` endpoint.

    Returns the assistant message content as a string. Raises on non-2xx so
    callers (and the rate limiter's ``with_retry``) can back off.
    """
    if not is_url_safe(base_url):
        raise ValueError("Provider URL resolves to a private/internal address")
    url = f"{base_url.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    resp = httpx.post(url, headers=headers, json=payload, timeout=timeout)
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"]


def call_openai_speech(
    base_url: str,
    api_key: str,
    model: str,
    text: str,
    *,
    voice: str = "alloy",
    response_format: str = "wav",
    speed: float = 1.0,
    timeout: float = _HTTP_TIMEOUT,
) -> bytes:
    """Call an OpenAI-compatible ``/audio/speech`` endpoint.

    Returns raw audio bytes (default WAV). Raises on non-2xx.
    """
    if not is_url_safe(base_url):
        raise ValueError("Provider URL resolves to a private/internal address")
    url = f"{base_url.rstrip('/')}/audio/speech"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "input": text,
        "voice": voice,
        "response_format": response_format,
        "speed": speed,
    }
    resp = httpx.post(url, headers=headers, json=payload, timeout=timeout)
    resp.raise_for_status()
    return resp.content


def call_openai_transcription(
    base_url: str,
    api_key: str,
    audio_path: str,
    *,
    model: str | None = None,
    language: str | None = None,
    timeout: float = _HTTP_TIMEOUT,
) -> str:
    """Call an OpenAI-compatible ``/audio/transcriptions`` endpoint (Whisper API).

    Returns the transcript text. Raises on non-2xx so callers (and the rate
    limiter's ``with_retry``) can back off. Standard Bearer auth, like the
    other BYOK calls.
    """
    if not is_url_safe(base_url):
        raise ValueError("Provider URL resolves to a private/internal address")
    url = f"{base_url.rstrip('/')}/audio/transcriptions"
    headers = {"Authorization": f"Bearer {api_key}"}
    with open(audio_path, "rb") as fh:
        files = {"file": (os.path.basename(audio_path), fh, "audio/wav")}
        data = {"model": model or "whisper-1"}
        if language:
            data["language"] = language
        resp = httpx.post(url, headers=headers, files=files, data=data, timeout=timeout)
    resp.raise_for_status()
    return resp.json().get("text", "")


def transcribe_via_cloud(
    audio_path: str,
    *,
    language: str | None = None,
    domain: str = "stt",
) -> str:
    """Resolve the default ``stt`` (or ``domain``) provider and transcribe audio.

    Returns transcript text. Raises ``LookupError`` if no provider is configured
    so the orchestration can fall back to a local STT model.
    """
    creds = get_cloud_provider(domain)
    if creds is None or not creds["base_url"]:
        raise LookupError(f"No cloud provider configured for domain '{domain}'")
    return call_openai_transcription(
        creds["base_url"],
        creds["api_key"],
        audio_path,
        model=creds["model"] or "whisper-1",
        language=language,
    )


def synthesize_via_cloud_tts(
    domain: str,
    text: str,
    *,
    voice: str = "alloy",
    response_format: str = "wav",
) -> tuple[bytes, str]:
    """Resolve the default ``tts`` (or ``domain``) provider and call its speech API.

    Returns ``(audio_bytes, content_type)``. Raises ``LookupError`` if no
    provider is configured so the orchestration can fall back to a local model.
    """
    creds = get_cloud_provider(domain)
    if creds is None or not creds["base_url"]:
        raise LookupError(f"No cloud provider configured for domain '{domain}'")
    model = creds["model"] or "tts-1"
    audio = call_openai_speech(
        creds["base_url"],
        creds["api_key"],
        model,
        text,
        voice=voice,
        response_format=response_format,
    )
    ctype = "audio/wav" if response_format == "wav" else f"audio/{response_format}"
    return audio, ctype


def _decode_audio_bytes(audio_bytes: bytes) -> tuple[np.ndarray, int]:
    """Decode provider audio bytes (wav/flac/ogg) into ``(array, sample_rate)``."""
    import soundfile as sf

    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    try:
        audio, sr = sf.read(tmp_path)
    finally:
        os.unlink(tmp_path)
    return np.asarray(audio, dtype=np.float32), int(sr)


def call_openai_music(
    base_url: str,
    api_key: str | None,
    *,
    prompt: str,
    model: str | None = None,
    duration_seconds: float = 30.0,
    genre: str = "pop",
    mood: str = "neutral",
    tempo: int | None = None,
    seed: int | None = None,
    timeout: float = _HTTP_TIMEOUT,
) -> bytes:
    """Call a user-supplied music-generation endpoint.

    There is no standard music-gen API, so the user's ``base_url`` IS the full
    endpoint and is POSTed to directly as JSON. ``api_key`` is sent as a Bearer
    header when present. Returns raw audio bytes.
    """
    if not is_url_safe(base_url):
        raise ValueError("Provider URL resolves to a private/internal address")
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    payload = {
        "prompt": prompt,
        "model": model or "music-1",
        "duration_seconds": duration_seconds,
        "genre": genre,
        "mood": mood,
        "tempo": tempo,
        "seed": seed,
    }
    resp = httpx.post(base_url, headers=headers, json=payload, timeout=timeout)
    resp.raise_for_status()
    return resp.content


def generate_music_via_cloud(
    *,
    prompt: str,
    duration_seconds: float = 30.0,
    genre: str = "pop",
    mood: str = "neutral",
    tempo: int | None = None,
    seed: int | None = None,
    domain: str = "music",
) -> tuple[np.ndarray, int]:
    """Resolve the default ``music`` provider and generate audio.

    Returns ``(audio_array, sample_rate)``. Raises ``LookupError`` if no
    provider is configured so the orchestration can surface a clear error.
    """
    creds = get_cloud_provider(domain)
    if creds is None or not creds["base_url"]:
        raise LookupError(f"No cloud provider configured for domain '{domain}'")
    audio_bytes = call_openai_music(
        creds["base_url"],
        creds["api_key"],
        prompt=prompt,
        model=creds["model"],
        duration_seconds=duration_seconds,
        genre=genre,
        mood=mood,
        tempo=tempo,
        seed=seed,
    )
    return _decode_audio_bytes(audio_bytes)


def call_openai_voice_conversion(
    base_url: str,
    api_key: str | None,
    audio_path: str,
    *,
    voice: str,
    pitch_shift: int = 0,
    timeout: float = _HTTP_TIMEOUT,
) -> bytes:
    """Call a user-supplied voice-conversion endpoint.

    No standard contract exists, so the user's ``base_url`` IS the full
    endpoint. Posts the source audio as multipart with ``voice``/``pitch_shift``
    fields. Returns raw audio bytes.
    """
    if not is_url_safe(base_url):
        raise ValueError("Provider URL resolves to a private/internal address")
    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    with open(audio_path, "rb") as fh:
        files = {"audio": (os.path.basename(audio_path), fh, "audio/wav")}
        data = {"voice": voice, "pitch_shift": str(pitch_shift)}
        resp = httpx.post(base_url, headers=headers, files=files, data=data, timeout=timeout)
    resp.raise_for_status()
    return resp.content


def convert_voice_via_cloud(
    audio: np.ndarray,
    sr: int,
    voice: str,
    *,
    pitch_shift: int = 0,
    domain: str = "vc",
) -> tuple[np.ndarray, int]:
    """Resolve the default ``vc`` provider and convert ``audio`` into ``voice``.

    Returns ``(audio_array, sample_rate)``. Raises ``LookupError`` if no
    provider is configured.
    """
    import soundfile as sf

    creds = get_cloud_provider(domain)
    if creds is None or not creds["base_url"]:
        raise LookupError(f"No cloud provider configured for domain '{domain}'")
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        sf.write(tmp, np.asarray(audio, dtype=np.float32), int(sr), format="WAV")
        tmp_path = tmp.name
    try:
        audio_bytes = call_openai_voice_conversion(
            creds["base_url"], creds["api_key"], tmp_path, voice=voice, pitch_shift=pitch_shift
        )
    finally:
        os.unlink(tmp_path)
    return _decode_audio_bytes(audio_bytes)
