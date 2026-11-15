"""
Model lifecycle verification — BUG-002 + BUG-010.

BUG-002: Model loading rule — verify no model loads when none is active and
only cached (downloaded via the Store / manifest) models load. The startup_defer
lazy-init gates (ensure_kokoro_preloaded, ensure_planner_preloaded,
ensure_models_preloaded, ensure_engines_registered) must each skip loading when
the relevant model is not already cached on disk.

BUG-010: Memory/unload rules — verify engines idle-unload after inactivity,
ALWAYS_ON_ENGINES is empty (nothing stays resident forever), performance mode
suspends idle-unload, per-engine keepalive overrides, and stop() unloads all
non-always-on engines. Relevant on the 8 GB target where resident heavy models
(Orca/planner/music/Demucs) would spike RAM.
"""

import asyncio
import time

from backend.utils.model_lifecycle import (
    ALWAYS_ON_ENGINES,
    IDLE_TIMEOUT_SECONDS,
    ModelLifecycleManager,
)
from backend.utils.startup_defer import (
    ensure_engines_registered,
    ensure_kokoro_preloaded,
    ensure_models_preloaded,
    ensure_planner_preloaded,
)

# ── BUG-002: No model loads when none active / only cached models load ──


class TestEngineRegistrationSkippedWhenNoModels:
    """ensure_engines_registered must not register any engine when no model
    for that engine is downloaded (engine_needed returns False). This is the
    "no model loads when none active" half of BUG-002."""

    def test_registers_nothing_when_no_tts_models_downloaded(self, monkeypatch):

        # No TTS/STT/LLM model downloaded -> engine_needed False for all
        monkeypatch.setattr("backend.backends.configs.engine_needed", lambda engine: False)

        calls = []

        def fake_get_tts_backend():
            calls.append("tts")
            raise AssertionError("get_tts_backend must not be called")

        def fake_get_stt_backend():
            calls.append("stt")
            raise AssertionError("get_stt_backend must not be called")

        def fake_get_llm_backend_for_engine(engine):
            calls.append("llm")
            raise AssertionError("get_llm_backend_for_engine must not be called")

        def fake_get_vc_backend(engine):
            calls.append("vc")
            raise AssertionError("get_vc_backend must not be called")

        monkeypatch.setattr("backend.backends.get_tts_backend", fake_get_tts_backend)
        monkeypatch.setattr("backend.backends.get_stt_backend", fake_get_stt_backend)
        monkeypatch.setattr("backend.backends.get_llm_backend_for_engine", fake_get_llm_backend_for_engine)
        monkeypatch.setattr("backend.backends.get_vc_backend", fake_get_vc_backend)

        import asyncio

        asyncio.run(ensure_engines_registered())
        assert calls == [], f"backend backends must not be instantiated: {calls}"


class TestKokoroPreloadSkippedWhenNotCached:
    """ensure_kokoro_preloaded must not load Kokoro when the model is not
    cached on disk (only cached models load)."""

    def test_skips_when_not_cached(self, monkeypatch):

        loaded = {"v": False}

        class FakeBackend:
            def __init__(self):
                pass

            @property
            def _is_model_cached(self):
                return False

            async def load_model(self):
                loaded["v"] = True

        monkeypatch.setattr("backend.backends.kokoro_tts_backend.KokoroTTSBackend", FakeBackend)

        # Manifest: kokoro not entitled -> skip
        monkeypatch.setattr("backend.backends.configs.get_all_model_configs", list)
        monkeypatch.setattr("backend.services.model_registry.is_downloaded", lambda *a, **k: False)
        monkeypatch.setattr(
            "backend.services.settings.get_generation_settings",
            lambda db: type("G", (), {"preload_on_start": True})(),
        )

        asyncio.run(ensure_kokoro_preloaded())
        assert loaded["v"] is False, "Kokoro must not load when not entitled"


class TestPlannerPreloadSkippedWhenNotCached:
    """ensure_planner_preloaded must not load the planner GGUF when not
    cached on disk."""

    def test_skips_when_not_cached(self, monkeypatch):
        loaded = {"v": False}

        class FakeBackend:
            model_size = "4B-Q4_K_M"

            @property
            def _is_model_cached(self):
                return False

            async def load_model(self):
                loaded["v"] = True

        monkeypatch.setattr("backend.backends.get_llm_backend_for_engine", lambda engine: FakeBackend())
        monkeypatch.setattr("backend.backends.configs.get_all_model_configs", list)
        monkeypatch.setattr("backend.services.model_registry.is_downloaded", lambda *a, **k: False)

        asyncio.run(ensure_planner_preloaded())
        assert loaded["v"] is False, "Planner must not load when not cached/entitled"


class TestModelsPreloadSkipsUncached:
    """ensure_models_preloaded must skip any model config whose weights are
    not already on disk — never triggers a download."""

    def test_skips_uncached_tts_model(self, monkeypatch):
        from backend.backends.configs import ModelConfig

        loaded = {"v": False}

        class FakeTTS:
            def __init__(self):
                pass

            @property
            def _is_model_cached(self):
                return False

            async def load_model(self, model_name=None):
                loaded["v"] = True

        # One TTS config that is NOT downloaded -> must be skipped
        cfg = ModelConfig(
            model_name="kokoro-onnx",
            display_name="Kokoro ONNX",
            engine="kokoro",
            hf_repo_id="YatharthS/Kokoro-ONNX",
            model_size="default",
            category="tts",
            preload_priority=3,
        )
        monkeypatch.setattr("backend.backends.configs.get_all_model_configs", lambda: [cfg])
        monkeypatch.setattr("backend.services.model_registry.is_downloaded", lambda *a, **k: False)
        monkeypatch.setattr("backend.backends.get_tts_backend_for_engine", lambda engine: FakeTTS())

        asyncio.run(ensure_models_preloaded())
        assert loaded["v"] is False, "Uncached TTS model must not be preloaded"


# ── BUG-010: Memory/unload rules ──


class TestAlwaysOnEnginesEmpty:
    """ALWAYS_ON_ENGINES must be empty — no engine (including the planner)
    stays resident forever. Everything idle-unloads."""

    def test_always_on_engines_is_empty(self):
        assert frozenset() == ALWAYS_ON_ENGINES, (
            "ALWAYS_ON_ENGINES must be empty; no engine may stay resident indefinitely on the 8 GB target"
        )


class TestIdleUnloadAfterTimeout:
    """Engines idle-unload after IDLE_TIMEOUT_SECONDS of inactivity."""

    def test_unloads_after_idle_timeout(self):
        mgr = ModelLifecycleManager(idle_timeout=300)
        loaded = {"v": True}
        unloaded = {"c": 0}

        def is_loaded():
            return loaded["v"]

        def unload():
            unloaded["c"] += 1

        mgr.register("kokoro", is_loaded, unload)
        mgr._engines["kokoro"].last_used = 0  # very old -> idle
        asyncio.run(mgr._unload_if_idle())
        assert unloaded["c"] == 1, "Idle engine must be unloaded"
        assert loaded["v"] is True  # load flag untouched; unload callback ran

    def test_does_not_unload_recently_used_engine(self):
        mgr = ModelLifecycleManager(idle_timeout=300)
        loaded = {"v": True}
        unloaded = {"c": 0}

        def is_loaded():
            return loaded["v"]

        def unload():
            unloaded["c"] += 1

        mgr.register("kokoro", is_loaded, unload)
        # Just used (1 second ago) -> not idle
        mgr._engines["kokoro"].last_used = time.monotonic() - 1
        asyncio.run(mgr._unload_if_idle())
        assert unloaded["c"] == 0, "Recently used engine must not be unloaded"

    def test_not_loaded_engine_is_not_unloaded(self):
        mgr = ModelLifecycleManager(idle_timeout=300)
        unloaded = {"c": 0}

        def is_loaded():
            return False

        def unload():
            unloaded["c"] += 1

        mgr.register("kokoro", is_loaded, unload)
        asyncio.run(mgr._unload_if_idle())
        assert unloaded["c"] == 0, "Not-loaded engine must not trigger unload"


class TestPerformanceModeSuspendsIdleUnload:
    """Performance mode (speed over RAM) suspends idle-unload so models stay
    resident — confirmed suspended (not loaded more, just not unloaded)."""

    def test_performance_mode_skips_unload(self):
        mgr = ModelLifecycleManager(idle_timeout=300)
        loaded = {"v": True}
        unloaded = {"c": 0}

        def is_loaded():
            return loaded["v"]

        def unload():
            unloaded["c"] += 1

        mgr.register("kokoro", is_loaded, unload)
        mgr._performance_mode = True
        mgr._engines["kokoro"].last_used = 0  # old but performance mode on
        asyncio.run(mgr._unload_if_idle())
        assert unloaded["c"] == 0, "Performance mode must suspend idle-unload"


class TestStopUnloadsAllEngines:
    """stop() must unload every non-always-on engine — nothing stays resident
    after shutdown on the 8 GB target."""

    def test_stop_unloads_all_registered_engines(self):
        mgr = ModelLifecycleManager()
        loaded_states = {"kokoro": True, "whisper": True, "stable_audio": True}
        unloaded = {"c": 0}

        def make_is_loaded(name):
            return lambda: loaded_states[name]

        def make_unload(name):
            def _unload():
                unloaded["c"] += 1
                loaded_states[name] = False

            return _unload

        for name in ("kokoro", "whisper", "stable_audio"):
            mgr.register(name, make_is_loaded(name), make_unload(name))

        asyncio.run(mgr.stop())
        assert unloaded["c"] == 3, "All three engines must be unloaded on stop"
        assert all(v is False for v in loaded_states.values())


class TestCircuitBreakerDoesNotBlockIdleUnload:
    """A circuit-broken engine still gets idle-unloaded (circuit breaker only
    gates load retries, not unload)."""

    def test_circuit_open_engine_still_unloads(self):
        mgr = ModelLifecycleManager(idle_timeout=300)
        loaded = {"v": True}
        unloaded = {"c": 0}

        def is_loaded():
            return loaded["v"]

        def unload():
            unloaded["c"] += 1

        mgr.register("kokoro", is_loaded, unload)
        mgr.record_load_failure("kokoro")
        mgr.record_load_failure("kokoro")
        mgr.record_load_failure("kokoro")  # open circuit
        assert mgr.is_circuit_open("kokoro") is True

        mgr._engines["kokoro"].last_used = 0  # idle
        asyncio.run(mgr._unload_if_idle())
        assert unloaded["c"] == 1, "Circuit-broken engine must still idle-unload"


# ── Verify the module-level singleton is configured conservatively ──


class TestFreshManagerDefaults:
    """A fresh ModelLifecycleManager must start with no engines registered,
    performance mode off, and 5 min idle timeout."""

    def test_fresh_manager_defaults(self):
        mgr = ModelLifecycleManager()
        assert mgr.idle_timeout == IDLE_TIMEOUT_SECONDS
        assert mgr.idle_timeout == 300
        assert mgr._performance_mode is False
        assert len(mgr._engines) == 0  # nothing registered yet

    def test_always_on_empty_on_fresh_manager(self):
        assert frozenset() == ALWAYS_ON_ENGINES
