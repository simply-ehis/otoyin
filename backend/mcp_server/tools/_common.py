"""Shared helpers for otoyin MCP tools.

Thin wrappers over the REST API plus the audio-encoding helpers used by
every tool that returns WAV audio as base64.
"""

from __future__ import annotations

import base64 as b64
import io
import logging
import os
import re
import tempfile
import urllib.parse
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# Absolute-path transcribes are bounded to keep a bad client from
# asking us to ingest a 20 GB file.
MAX_TRANSCRIBE_BYTES = 200 * 1024 * 1024  # 200 MB

# Keys in JSON bodies that represent filesystem paths and need traversal checks.
_PATH_BODY_KEYS = {
    "audio_path",
    "audio_path_a",
    "audio_path_b",
    "path",
    "file_path",
    "input_path",
    "output_path",
    "music_path",
    "session_path",
    "guide_path",
    "script_path",
    "target_path",
    "clip_path",
    "sample_path",
    "video_path",
}


def _validate_path(value: str) -> str:
    """Reject URL schemes, traversal, and absolute paths outside data/temp roots."""
    if not isinstance(value, str) or not value:
        return value
    if re.search(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", value):
        raise ValueError(f"Invalid path: URL schemes are not allowed ({value[:60]})")
    if re.search(r"(^|[\\/])\.\.([\\/]|$)", value):
        raise ValueError(f"Invalid path: path traversal ('..') is not allowed ({value[:60]})")
    if value.startswith("/") or re.match(r"^[a-zA-Z]:[\\/]", value):
        from ... import config

        resolved = Path(value).resolve()
        allowed_roots = [config.get_data_dir().resolve(), Path(tempfile.gettempdir()).resolve()]
        if not any(resolved.is_relative_to(root) for root in allowed_roots):
            raise ValueError(f"Invalid path: absolute paths are only allowed under data/temp roots ({value[:60]})")
    return value


def _validate_body_paths(body: dict | None) -> None:
    """Scan a JSON body for path-like values and reject traversal."""
    if not body:
        return
    for key, value in body.items():
        if key in _PATH_BODY_KEYS and isinstance(value, str):
            _validate_path(value)


# ---------------------------------------------------------------------------
# Singleton HTTP client — reused across all MCP tool calls to avoid paying
# connection-setup overhead on every invocation.
# ---------------------------------------------------------------------------
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=300)
    return _client


# Base URL for the MCP server to call its own REST API (same uvicorn process).
# Host + port detected from env vars at startup; host defaults to 127.0.0.1.
# Reads OTOYIN_* first, then the legacy TWENTYLABS_* / TWENTYONE_LABS_* names.
def _get_mcp_base() -> str:
    host = (
        os.environ.get("OTOYIN_HOST")
        or os.environ.get("TWENTYLABS_HOST")
        or os.environ.get("TWENTYONE_LABS_HOST", "127.0.0.1")
    )
    port = (
        os.environ.get("OTOYIN_PORT")
        or os.environ.get("TWENTYLABS_PORT")
        or os.environ.get("TWENTYONE_LABS_PORT", "17493")
    )
    return f"http://{host}:{port}"


def _encode_path_param(value: str) -> str:
    """URL-encode a path parameter to prevent path traversal."""
    return urllib.parse.quote(value, safe="")


async def _rest(
    method: str,
    path: str,
    *,
    params: dict | None = None,
    json: dict | None = None,
) -> dict[str, Any]:
    """Call the otoyin REST API from within the MCP server.

    Returns parsed JSON for JSON responses, or an audio envelope
    (``audio_base64`` + ``sample_rate`` + ``duration``) for audio responses.
    """
    _validate_body_paths(json)
    url = f"{_get_mcp_base()}{path}"
    client = _get_client()
    try:
        if method == "GET":
            resp = await client.get(url, params=params or None)
        elif method == "POST":
            resp = await client.post(url, params=params or None, json=json)
        elif method == "PUT":
            resp = await client.put(url, params=params or None, json=json)
        elif method == "DELETE":
            resp = await client.delete(url, params=params or None)
        else:
            raise ValueError(f"Unsupported HTTP method: {method}")
    except httpx.ConnectError as _err:
        raise ValueError("REST API unreachable — is the otoyin server running?") from _err
    except httpx.ReadTimeout as _err:
        raise ValueError("REST API timed out after 300s") from _err
    except httpx.HTTPError as _err:
        raise ValueError(f"REST API error: {_err}") from _err
    if resp.status_code >= 400:
        raise ValueError(f"REST {method} {path} failed {resp.status_code}: {resp.text[:400]}")
    ctype = resp.headers.get("content-type", "")
    if "application/json" in ctype:
        return resp.json()
    if "audio/wav" in ctype or ctype.startswith("audio/"):
        # Audio response → base64 envelope.
        return _resp_audio(resp.content)
    # Text / file response (e.g. Reaper .RPP export) → raw content.
    return {"content": resp.text, "content_type": ctype}


def _resp_audio(raw: bytes) -> dict[str, Any]:
    """Encode raw WAV bytes as a base64 envelope with sample rate + duration."""
    import numpy as np
    import soundfile as sf

    arr, sr = sf.read(io.BytesIO(raw))
    arr = np.asarray(arr)
    if arr.ndim > 1:
        arr = arr.mean(axis=1)
    duration = float(len(arr)) / sr if sr else 0.0
    b64 = _wav_b64(arr, sr)
    return {
        "audio_base64": b64,
        "sample_rate": sr,
        "duration": duration,
        "bytes": len(b64) * 3 // 4,
    }


def _wav_b64(audio, sample_rate: int) -> str:
    """Encode a float audio array as base64 WAV for MCP tool returns."""
    import numpy as np
    import soundfile as sf

    arr = np.asarray(audio)
    if arr.ndim == 1:
        arr = arr.reshape(-1, 1)
    buf = io.BytesIO()
    sf.write(buf, arr, sample_rate, format="WAV")
    return b64.b64encode(buf.getvalue()).decode()
