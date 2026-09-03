"""Unified asset acquisition (vendored galileo-core ``acquire``).

Search dispatches to the per-source adapter; download pulls a file into the
assets directory with strict SSRF (host allowlist, redirect-aware) and
path-containment checks so a caller can never write outside ``data/assets``.
"""

from __future__ import annotations

import logging
import re
import uuid
from pathlib import Path
from urllib.parse import urljoin

import httpx

try:
    from ...config import get_assets_dir, to_storage_path
    from ...utils.ssrf import is_host_allowed
except ImportError:  # pragma: no cover - bundled layout
    from config import get_assets_dir, to_storage_path
    from utils.ssrf import is_host_allowed

logger = logging.getLogger(__name__)

SOURCE_HOSTS: dict[str, set[str]] = {
    "freesound": {"freesound.org", "cdn.freesound.org"},
    "polyhaven": {"api.polyhaven.com", "polyhaven.com", "cdn.polyhaven.com"},
}

VALID_SOURCES = tuple(SOURCE_HOSTS)

_FILENAME_SAFE = re.compile(r"[^A-Za-z0-9._-]")


def search_assets(source: str, query: str, **kwargs):
    """Search a source. Freesound reuses the existing hardened service."""
    if source == "freesound":
        from ...services.freesound import search_sounds

        return search_sounds(query, page_size=kwargs.get("limit", 20))
    if source == "polyhaven":
        from . import polyhaven

        return polyhaven.search(
            query,
            asset_type=kwargs.get("asset_type", "all"),
            limit=kwargs.get("limit", 20),
        )
    raise ValueError(f"Unknown source: {source}")


def _safe_download(url: str, allowed_hosts: set[str], dest: Path) -> None:
    """Stream ``url`` to ``dest``, verifying every redirect hop is host-allowlisted."""
    current = url
    for _ in range(6):
        if not is_host_allowed(current, allowed_hosts):
            raise ValueError(f"Blocked egress to non-allowlisted host: {current}")
        resp = httpx.get(current, follow_redirects=False, timeout=30.0, stream=True)
        if resp.status_code in (301, 302, 303, 307, 308) and resp.headers.get("location"):
            current = urljoin(current, resp.headers["location"])
            continue
        resp.raise_for_status()
        with dest.open("wb") as fh:
            for chunk in resp.iter_bytes():
                fh.write(chunk)
        return
    raise RuntimeError("Too many redirects while acquiring asset")


def acquire_asset(
    source: str,
    url: str | None = None,
    asset_id: str | None = None,
    asset_type: str | None = None,
    filename: str | None = None,
    resolution: str = "1k",
) -> dict:
    """Download an asset into the assets dir; returns a stored-path record."""
    if source not in SOURCE_HOSTS:
        raise ValueError(f"Unknown source: {source}")
    allowed = SOURCE_HOSTS[source]

    if source == "polyhaven":
        from . import polyhaven

        if not asset_id:
            raise ValueError("polyhaven acquisition requires asset_id")
        url = polyhaven.get_download_url(asset_id, asset_type or "all", resolution)
    if not url:
        raise ValueError("Either url or asset_id is required")

    if not filename:
        filename = url.rsplit("/", 1)[-1] or f"{source}_{uuid.uuid4().hex}"
    filename = _FILENAME_SAFE.sub("_", filename)[:120]

    assets_dir = get_assets_dir()
    dest = (assets_dir / filename).resolve()
    if not dest.is_relative_to(assets_dir.resolve()):
        raise ValueError("Unsafe destination path")

    _safe_download(url, allowed, dest)
    logger.info("Acquired %s asset -> %s", source, dest)
    return {
        "source": source,
        "local_path": to_storage_path(dest),
        "filename": filename,
        "url": url,
    }
