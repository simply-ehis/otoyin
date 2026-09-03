"""Poly Haven asset source adapter (vendored acquire concept).

Public, key-free API at ``api.polyhaven.com``. Every egress URL is host
allowlisted via ``utils.ssrf.is_host_allowed`` before any request is made.
"""

from __future__ import annotations

import logging
from urllib.parse import urlencode

import httpx

try:
    from ...utils.ssrf import is_host_allowed
except ImportError:  # pragma: no cover - bundled layout
    from utils.ssrf import is_host_allowed

logger = logging.getLogger(__name__)

POLYHAVEN_HOSTS = {"api.polyhaven.com", "polyhaven.com", "cdn.polyhaven.com"}
_API = "https://api.polyhaven.com"


def _check_host(url: str) -> None:
    if not is_host_allowed(url, POLYHAVEN_HOSTS):
        raise ValueError(f"Blocked egress to non-Poly Haven host: {url}")


def search(query: str, asset_type: str = "all", limit: int = 20) -> list[dict]:
    """Search Poly Haven assets. Returns the raw ``/assets`` payload."""
    params = {"query": query, "type": asset_type, "limit": limit}
    url = f"{_API}/assets?{urlencode(params)}"
    _check_host(url)
    resp = httpx.get(url, timeout=15.0)
    resp.raise_for_status()
    data = resp.json()
    return data if isinstance(data, list) else []


def get_asset(asset_id: str, asset_type: str) -> dict:
    url = f"{_API}/asset/{asset_type}/{asset_id}"
    _check_host(url)
    resp = httpx.get(url, timeout=15.0)
    resp.raise_for_status()
    return resp.json()


def get_download_url(asset_id: str, asset_type: str, resolution: str = "1k", file_format: str = "jpg") -> str:
    """Return the Poly Haven download endpoint for a resolved asset file."""
    url = f"{_API}/download?asset={asset_id}&type={asset_type}&res={resolution}&format={file_format}"
    _check_host(url)
    return url
