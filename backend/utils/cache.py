"""
Voice prompt caching utilities.
"""

from __future__ import annotations

import hashlib
import logging
import os
from collections import OrderedDict
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    import torch

from .. import config

logger = logging.getLogger(__name__)

_MAX_MEMORY_CACHE = 128  # Maximum number of entries in memory cache


def _get_cache_dir() -> Path:
    """Get cache directory from config."""
    return config.get_cache_dir()


# In-memory LRU cache - can store dict (voice prompt) or tensor (legacy)
_memory_cache: OrderedDict[str, Any] = OrderedDict()


def get_cache_key(audio_path: str, reference_text: str) -> str:
    """
    Generate cache key from audio file and reference text.

    Uses a streaming hash that reads only the first 64KB + file size + mtime
    instead of loading the entire file into memory.
    """
    hasher = hashlib.md5()

    # Hash first 64KB of audio
    with open(audio_path, "rb") as f:
        hasher.update(f.read(65536))

    # Include file size and mtime for uniqueness
    stat = os.stat(audio_path)
    hasher.update(str(stat.st_size).encode())
    hasher.update(str(int(stat.st_mtime)).encode())

    # Include reference text
    hasher.update(reference_text.encode("utf-8"))

    return hasher.hexdigest()


def get_cached_voice_prompt(
    cache_key: str,
) -> torch.Tensor | dict[str, Any] | None:
    """
    Get cached voice prompt if available.

    Args:
        cache_key: Cache key

    Returns:
        Cached voice prompt (dict or tensor) or None
    """
    # Check in-memory cache
    if cache_key in _memory_cache:
        _memory_cache.move_to_end(cache_key)
        return _memory_cache[cache_key]

    # Check disk cache
    cache_file = _get_cache_dir() / f"{cache_key}.prompt"
    if cache_file.exists():
        try:
            import torch

            prompt = torch.load(cache_file, weights_only=True)
            _memory_cache[cache_key] = prompt
            # Evict oldest entries if cache is full
            while len(_memory_cache) > _MAX_MEMORY_CACHE:
                _memory_cache.popitem(last=False)
            return prompt
        except Exception:
            # Cache file corrupted, delete it
            logger.debug("Corrupted cache file %s, deleting", cache_file, exc_info=True)
            cache_file.unlink()

    return None


def cache_voice_prompt(
    cache_key: str,
    voice_prompt: torch.Tensor | dict[str, Any],
) -> None:
    """
    Cache voice prompt to memory and disk.

    Args:
        cache_key: Cache key
        voice_prompt: Voice prompt (dict or tensor)
    """
    # Store in memory with LRU eviction
    _memory_cache[cache_key] = voice_prompt
    _memory_cache.move_to_end(cache_key)
    while len(_memory_cache) > _MAX_MEMORY_CACHE:
        _memory_cache.popitem(last=False)

    # Store on disk (torch.save can handle both dicts and tensors)
    cache_file = _get_cache_dir() / f"{cache_key}.prompt"
    import torch

    torch.save(voice_prompt, cache_file)


def clear_voice_prompt_cache() -> int:
    """
    Clear all voice prompt caches (memory and disk).

    Returns:
        Number of cache files deleted
    """
    # Clear memory cache
    _memory_cache.clear()

    # Clear disk cache
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
