"""Warm pool: multiple resident models, not just one.

Unit coverage for ``services/warm_pool.enforce_warm_pool`` and the pool-aware
``load_engine_model`` in ``backends/registry/__init__.py``. No real models or
binaries are required — all handles/configs are mocked.
"""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from backend.services import warm_pool


def _make_handle(engine: str, last_used: float = 0.0):
    """A lifecycle-manager-shaped handle: is_loaded, unload, last_used."""
    handle = SimpleNamespace(is_loaded=lambda: True, last_used=last_used)
    handle.unload = MagicMock(name=f"unload[{engine}]")
    return handle


def _residents(monkeypatch, entries: list[tuple[str, int, float]]) -> dict[str, object]:
    """Fake registered engines for the pool to inspect: [(name, mb, last_used)]."""
    handles = {name: _make_handle(name, ts) for name, _, ts in entries}
    loaded = [(name, h) for name, h in handles.items()]
    monkeypatch.setattr(warm_pool, "loaded_engines", lambda: loaded)
    monkeypatch.setattr(warm_pool, "_engine_size_mb", lambda: {n: mb for n, mb, _ in entries})
    monkeypatch.setattr(warm_pool, "_keepalive_engines", lambda: set())
    return handles


# ── pool unit tests ───────────────────────────────────────────────


def test_within_budget_no_evictions(monkeypatch):
    _residents(monkeypatch, [("kokoro", 200, 10.0), ("fish_speech_s2", 6000, 20.0)])
    evicted = warm_pool.enforce_warm_pool(requesting_engine="voxcpm2", requesting_mb=300)
    assert evicted == []


def test_lrut_evicted_first_when_over_mb_budget(monkeypatch):
    entries = [("kokoro", 200, 10.0), ("fish_speech_s2", 6000, 20.0), ("orpheus", 3700, 30.0)]
    _residents(monkeypatch, entries)
    monkeypatch.setenv("TWENTYLABS_WARM_POOL_MAX_MB", "16000")
    # Resident peak after load would be 200+6000+3700+8000 = 16900 > 16000.
    # LRU goes first: kokoro (200), then fish_speech_s2 until the sum fits.
    evicted = warm_pool.enforce_warm_pool(requesting_engine="new_model", requesting_mb=8000)
    assert evicted == ["kokoro", "fish_speech_s2"]


def test_engine_count_cap_evicts_lru(monkeypatch):
    entries = [("kokoro", 200, 10.0), ("fish_speech_s2", 6000, 20.0), ("orpheus", 3700, 30.0)]
    _residents(monkeypatch, entries)
    # Pool cap counts the post-load resident set (requester included):
    # max 2 → after Kokoro+fish_speech_s2+requester that is 3 → evict down to cap-1.
    monkeypatch.setenv("TWENTYLABS_WARM_POOL_MAX_ENGINES", "2")
    evicted = warm_pool.enforce_warm_pool(requesting_engine="new_model", requesting_mb=100)
    assert evicted == ["kokoro", "fish_speech_s2"]


def test_keepwarm_engine_never_evicted(monkeypatch):
    entries = [("kokoro", 200, 10.0), ("fish_speech_s2", 6000, 20.0)]
    handles = _residents(monkeypatch, entries)
    monkeypatch.setattr(warm_pool, "_keepalive_engines", lambda: {"kokoro"})
    monkeypatch.setenv("TWENTYLABS_WARM_POOL_MAX_ENGINES", "1")
    evicted = warm_pool.enforce_warm_pool(requesting_engine="new_model", requesting_mb=100)
    assert "kokoro" not in evicted
    assert handles["fish_speech_s2"].unload.call_count == 1


def test_requesting_engine_never_evicted(monkeypatch):
    entries = [("kokoro", 200, 10.0)]
    handles = _residents(monkeypatch, entries)
    monkeypatch.setenv("TWENTYLABS_WARM_POOL_MAX_ENGINES", "1")
    evicted = warm_pool.enforce_warm_pool(requesting_engine="kokoro", requesting_mb=100)
    assert evicted == []
    assert handles["kokoro"].unload.call_count == 0


def test_unload_failure_swallowed_and_continues(monkeypatch):
    bad = _make_handle("bad", 10.0)
    bad.unload = MagicMock(side_effect=RuntimeError("boom"))
    good = _make_handle("good", 20.0)

    monkeypatch.setattr(warm_pool, "loaded_engines", lambda: [("bad", bad), ("good", good)])
    monkeypatch.setattr(warm_pool, "_engine_size_mb", lambda: {"bad": 6000, "good": 6000})
    monkeypatch.setattr(warm_pool, "_keepalive_engines", lambda: set())
    monkeypatch.setenv("TWENTYLABS_WARM_POOL_MAX_ENGINES", "0")
    evicted = warm_pool.enforce_warm_pool(requesting_engine="new_model", requesting_mb=100)
    assert evicted == ["good"]
    assert good.unload.call_count == 1


# ── registry integration: multiple residents may coexist ───────────


def _mock_backend():
    backend = SimpleNamespace()
    backend._is_model_cached = MagicMock(return_value=True)
    backend.is_loaded = MagicMock(return_value=False)
    backend.unload_model = MagicMock(name="unload_model")
    backend.load_model = AsyncMock()
    return backend


def _pool_handle(name: str, last_used: float):
    handle = SimpleNamespace(is_loaded=lambda: True, last_used=last_used)
    handle.unload = MagicMock(name=f"unload[{name}]")
    return handle


def _patch_common(registry, target):
    return patch.multiple(
        registry,
        get_tts_backend_for_engine=lambda engine: target,
    )


def test_load_engine_model_keeps_multiple_residents(monkeypatch):
    from backend.backends import registry

    h_kokoro = _pool_handle("kokoro", 10.0)
    saved = registry._tts_backends
    try:
        registry._tts_backends = {"kokoro": _mock_backend()}

        target = _mock_backend()
        monkeypatch.setattr("backend.services.warm_pool.loaded_engines", lambda: [("kokoro", h_kokoro)])
        monkeypatch.setattr("backend.services.warm_pool._engine_size_mb", lambda: {"kokoro": 180})
        monkeypatch.setattr("backend.services.warm_pool._keepalive_engines", lambda: set())
        with (
            _patch_common(registry, target),
            patch("backend.services.model_registry.is_downloaded", return_value=True),
        ):
            monkeypatch.setenv("TWENTYLABS_WARM_POOL_MAX_ENGINES", "4")
            asyncio.run(registry.load_engine_model("orpheus", "default"))

        # The previously-loaded engine stays resident (pool has room)
        assert h_kokoro.unload.call_count == 0
        target.load_model.assert_called_once_with("default")
    finally:
        registry._tts_backends = saved


def test_load_engine_model_evicts_lru_when_full(monkeypatch):
    from backend.backends import registry

    h_kokoro = _pool_handle("kokoro", 10.0)
    h_orpheus = _pool_handle("orpheus", 20.0)

    saved = registry._tts_backends
    try:
        registry._tts_backends = {"kokoro": _mock_backend(), "orpheus": _mock_backend()}

        target = _mock_backend()
        monkeypatch.setenv("TWENTYLABS_WARM_POOL_MAX_ENGINES", "1")
        monkeypatch.setattr(
            "backend.services.warm_pool.loaded_engines",
            lambda: [("kokoro", h_kokoro), ("orpheus", h_orpheus)],
        )
        monkeypatch.setattr("backend.services.warm_pool._engine_size_mb", lambda: {"kokoro": 180, "orpheus": 3700})
        monkeypatch.setattr("backend.services.warm_pool._keepalive_engines", lambda: set())
        with (
            _patch_common(registry, target),
            patch("backend.services.model_registry.is_downloaded", return_value=True),
        ):
            asyncio.run(registry.load_engine_model("voxcpm2", "default"))

        # Pool cap counts the post-load set: max 1 resident total → kokoro and
        # orpheus are both evicted so the requester can take the single slot.
        assert h_kokoro.unload.call_count == 1
        assert h_orpheus.unload.call_count == 1
        target.load_model.assert_called_once_with("default")
    finally:
        registry._tts_backends = saved


def test_load_engine_model_awaits_backend_load(monkeypatch):
    # The registry awaits backend.load_model(size).
    from backend.backends import registry

    saved = registry._tts_backends
    try:
        registry._tts_backends = {}
        target = _mock_backend()
        with (
            _patch_common(registry, target),
            patch("backend.services.model_registry.is_downloaded", return_value=True),
        ):
            asyncio.run(registry.load_engine_model("kokoro", "small"))
        target.load_model.assert_called_once_with("small")
    finally:
        registry._tts_backends = saved
