"""Freesound API v2 service — cloud SFX source (user-provided key, no local model).

This is a deliberate, documented exception to the on-device rule: Freesound is a
curated, license-tagged SFX library reachable only via its public API. The user
supplies their own free API key. Search metadata and previews are cached locally
under ``data/sounds/`` so repeated browsing stays offline.
"""

import contextlib
import json
import logging
import os
import time
from pathlib import Path

import httpx

from ..config import get_data_dir
from ..utils.ssrf import is_host_allowed

logger = logging.getLogger(__name__)

_FREESOUND_BASE = "https://freesound.org/apiv2"
# Preview audio is only ever fetched from Freesound's own hosts.
_FREESOUND_HOSTS = {"freesound.org", "cdn.freesound.org"}
_CACHE_TTL = 3600
_env_key = os.environ.get("FREESOUND_API_KEY", "")


def _get_api_key() -> str:
    """Return Freesound API key: DB-stored credential first, env fallback."""
    if _env_key:
        return _env_key
    try:
        from ..database.session import SessionLocal
        from .model_providers import get_default_provider, provider_credentials

        db = SessionLocal()
        try:
            row = get_default_provider(db, "sfx")
            if row:
                creds = provider_credentials(row)
                if creds.get("api_key"):
                    return creds["api_key"]
        finally:
            db.close()
    except Exception:
        logger.debug("Freesound credential lookup failed", exc_info=True)
    return ""


def _sounds_dir() -> Path:
    path = get_data_dir() / "sounds"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _cache_file(key: str) -> Path:
    safe = "".join(c if c.isalnum() else "_" for c in key)
    return _sounds_dir() / f"{safe}.json"


def is_configured() -> bool:
    """True if a Freesound API key is present."""
    return bool(_get_api_key())


def search_sounds(
    query: str,
    page: int = 1,
    page_size: int = 20,
    filter_str: str | None = None,
    sort: str = "score",
) -> dict:
    """Search Freesound for SFX matching ``query``.

    Returns the raw Freesound ``/search/text/`` payload (cached locally).
    Raises ``RuntimeError`` if the API key is missing or the request fails.
    """
    if not is_configured():
        raise RuntimeError("FREESOUND_API_KEY not configured")

    cache_key = f"search_{query}_{page}_{page_size}_{filter_str}_{sort}"
    cf = _cache_file(cache_key)
    if cf.exists():
        try:
            data = json.loads(cf.read_text(encoding="utf-8"))
            if time.time() - data.get("_cached_at", 0) < _CACHE_TTL:
                return data
        except (json.JSONDecodeError, OSError):
            pass

    params = {
        "query": query,
        "page": page,
        "page_size": page_size,
        "sort": sort,
        "fields": "id,name,username,license,previews,duration,filesize,tags,download,url",
    }
    if filter_str:
        params["filter"] = filter_str

    headers = {"Authorization": f"Token {_get_api_key()}"}
    resp = httpx.get(f"{_FREESOUND_BASE}/search/text/", params=params, headers=headers, timeout=30.0)
    resp.raise_for_status()
    data = resp.json()
    data["_cached_at"] = time.time()
    with contextlib.suppress(OSError):
        cf.write_text(json.dumps(data), encoding="utf-8")
    # Strip internal cache marker before returning to caller
    data.pop("_cached_at", None)
    return data


def download_preview(sound_id: str, preview_url: str) -> Path:
    """Download a sound's HQ OGG preview to ``data/sounds/`` and return its path.

    Previews are freely usable for auditioning. Full downloads require OAuth
    and are out of scope for v1.

    The ``preview_url`` is caller-supplied, so it is restricted to Freesound's
    own hosts to block server-side request forgery.
    """
    if not is_host_allowed(preview_url, _FREESOUND_HOSTS):
        raise ValueError("preview_url must point to freesound.org")
    # Hostname allowlist alone doesn't stop DNS rebinding — also verify the
    # resolved IPs are public before fetching.
    from ..utils.ssrf import is_url_safe

    if not is_url_safe(preview_url):
        raise ValueError("preview_url resolves to a blocked address")
    safe_id = "".join(c if c.isalnum() else "_" for c in str(sound_id))
    dest = _sounds_dir() / f"{safe_id}.ogg"
    if dest.exists():
        return dest
    # Stream with a byte cap so a huge/lying response can't exhaust memory.
    # Freesound preview URLs redirect to the CDN — follow redirects but keep SSRF checks on the initial URL.
    max_bytes = 50 * 1024 * 1024
    received = 0
    parts: list[bytes] = []
    with httpx.stream("GET", preview_url, timeout=60.0, follow_redirects=True) as resp:
        resp.raise_for_status()
        for chunk in resp.iter_bytes(chunk_size=1024 * 256):
            received += len(chunk)
            if received > max_bytes:
                raise ValueError("Preview download exceeds size limit")
            parts.append(chunk)
    dest.write_bytes(b"".join(parts))
    return dest
