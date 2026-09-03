"""Asset acquisition package (vendored galileo-core ``acquire`` concept).

Provides a single, SSRF-hardened entry point for pulling assets from external
libraries (Freesound for SFX, Poly Haven for HDRIs/textures). Freesound reuses
the existing hardened ``services.freesound``; Poly Haven is a thin adapter. All
egress is host-allowlisted and every downloaded file is confined to the assets
directory.
"""

from .manager import (
    SOURCE_HOSTS,
    VALID_SOURCES,
    acquire_asset,
    search_assets,
)

__all__ = ["SOURCE_HOSTS", "VALID_SOURCES", "acquire_asset", "search_assets"]
