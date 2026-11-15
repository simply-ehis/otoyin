"""Warm pool: keep multiple resident heavy models at once, not just one.

Replaces the old "single resident TTS slot" policy with a bounded pool: up to
``TWENTYLABS_WARM_POOL_MAX_ENGINES`` resident engines (default 4) and up to
``TWENTYLABS_WARM_POOL_MAX_MB`` MB of resident models (default 16000). When a
new load would exceed either cap, the least-recently-used non-protected
engines are evicted (their ``unload`` is called; the rest keep warm).

Keep-warm engines (``services/always_on.py`` — the app's "Performance Mode"
per-engine keepalive toggle) are never evicted; if the pool cannot fit the
requester without evicting them, the load proceeds anyway and is logged
(having more VRAM pressure beats having nothing to run).

Engines are sorted by the lifecycle manager's ``last_used`` stamp; audiocpp
subprocesses keep no resident state, so they never appear in the pool (their
``is_loaded`` is always False).
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

WARM_POOL_MAX_ENGINES_ENV = "TWENTYLABS_WARM_POOL_MAX_ENGINES"
WARM_POOL_MAX_MB_ENV = "TWENTYLABS_WARM_POOL_MAX_MB"

_DEFAULT_MAX_ENGINES = 4
_DEFAULT_MAX_MB = 16000


def pool_budget() -> tuple[int, int]:
    """Return (max_engines, max_mb), honoring the env knobs."""
    try:
        max_engines = int(os.environ.get(WARM_POOL_MAX_ENGINES_ENV, str(_DEFAULT_MAX_ENGINES)))
    except ValueError:
        logger.warning("invalid %s value; using %d", WARM_POOL_MAX_ENGINES_ENV, _DEFAULT_MAX_ENGINES)
        max_engines = _DEFAULT_MAX_ENGINES
    try:
        max_mb = int(os.environ.get(WARM_POOL_MAX_MB_ENV, str(_DEFAULT_MAX_MB)))
    except ValueError:
        logger.warning("invalid %s value; using %d", WARM_POOL_MAX_MB_ENV, _DEFAULT_MAX_MB)
        max_mb = _DEFAULT_MAX_MB
    return max_engines, max_mb


def _engine_size_mb() -> dict[str, int]:
    """Engine → declared download size in MB (for pool accounting)."""
    try:
        from ..backends import get_all_model_configs

        return {cfg.engine: cfg.size_mb for cfg in get_all_model_configs()}
    except Exception:
        logger.debug("warm pool: config sizes unavailable; zero-accounting fallback", exc_info=True)
        return {}


def _keepalive_engines() -> set[str]:
    try:
        from ..services.always_on import get_always_on_engines

        return set(get_always_on_engines())
    except Exception:
        logger.debug("warm pool: always-on set unavailable; treating nothing as pinned", exc_info=True)
        return set()


def loaded_engines() -> list[tuple[str, object]]:
    """Return [(engine, handle), ...] for engines whose ``is_loaded()`` is True."""
    from ..utils.model_lifecycle import lifecycle_manager

    loaded: list[tuple[str, object]] = []
    for engine, handle in lifecycle_manager.engines().items():
        try:
            if handle.is_loaded():
                loaded.append((engine, handle))
        except Exception:
            logger.debug("lifecycle is_loaded() failed for %s", engine, exc_info=True)
    return loaded


def enforce_warm_pool(*, requesting_engine: str, requesting_mb: int | None = None) -> list[str]:
    """Evict least-recently-used resident engines until the pool holds the requester.

    Returns the list of evicted engine names. Never evicts the requesting
    engine, never hard-fails on over-capacity — the load proceeds regardless.
    """
    max_engines, max_mb = pool_budget()
    sizes = _engine_size_mb()
    protected = _keepalive_engines()
    loaded = loaded_engines()

    def estimate(entry: tuple[str, object]) -> int:
        return sizes.get(entry[0], 0)

    total_mb = sum(estimate(e) for e in loaded)
    engines_count = len(loaded)

    # Sorted by last_used ascending so the oldest goes first; missing stamps sort first.
    by_recency = sorted(loaded, key=lambda e: getattr(e[1], "last_used", 0.0))

    evicted: list[str] = []
    for engine, handle in by_recency:
        if engines_count < max_engines and total_mb <= max_mb - (requesting_mb or 0):
            break
        if engine == requesting_engine:
            continue
        if engine in protected:
            continue
        try:
            handle.unload()
            logger.info("warm pool: evicted '%s' (LRU) to make room for '%s'", engine, requesting_engine)
            evicted.append(engine)
        except (RuntimeError, OSError) as exc:
            logger.error("warm pool: unload of '%s' failed (%s); continuing anyway", engine, exc)
            continue
        total_mb -= estimate((engine, handle))
        engines_count -= 1

    return evicted
