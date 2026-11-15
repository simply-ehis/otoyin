"""
Cache-clearing utilities for combined-voice audio and profile data.

Voice-prompt caching itself was retired with the audio.cpp consolidation —
all audiocpp engines keep no resident state to cache.
"""

from __future__ import annotations

import logging
from pathlib import Path

from .. import config

logger = logging.getLogger(__name__)


def _get_cache_dir() -> Path:
    """Get cache directory from config."""
    return config.get_cache_dir()


def clear_voice_prompt_cache() -> int:
    """
    Clear all voice prompt caches (memory and disk).

    Returns:
        Number of cache files deleted
    """
    cache_dir = _get_cache_dir()
    deleted_count = 0

    if cache_dir.exists():
        # Delete prompt cache files
        for cache_file in cache_dir.glob("*.prompt"):
            try:
                cache_file.unlink()
                deleted_count += 1
            except Exception as e:
                logger.warning("Failed to delete cache file %s: %s", cache_file, e)

        # Delete combined audio files
        for audio_file in cache_dir.glob("combined_*.wav"):
            try:
                audio_file.unlink()
                deleted_count += 1
            except Exception as e:
                logger.warning("Failed to delete combined audio file %s: %s", audio_file, e)

    return deleted_count


def clear_profile_cache(profile_id: str) -> int:
    """
    Clear cache files for a specific profile.

    Args:
        profile_id: Profile ID

    Returns:
        Number of cache files deleted
    """
    cache_dir = _get_cache_dir()
    deleted_count = 0

    if cache_dir.exists():
        # Delete combined audio files for this profile
        pattern = f"combined_{profile_id}_*.wav"
        for audio_file in cache_dir.glob(pattern):
            try:
                audio_file.unlink()
                deleted_count += 1
            except Exception as e:
                logger.warning("Failed to delete combined audio file %s: %s", audio_file, e)

    return deleted_count
