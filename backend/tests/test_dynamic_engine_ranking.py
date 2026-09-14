"""Tests for the dynamic TTS engine ranking system in model_status.py.

Verifies that engines are scored and ranked correctly based on:
- Weight class (ONNX-only < ONNX-preferred < subprocess < GGUF < torch)
- Hardware capabilities (CUDA GPU, onnxruntime)
- Cache state (downloaded engines preferred)
"""

from backend.utils.model_status import (
    _ENGINE_WEIGHTS,
    _ONNX_PREFERRED_ENGINES,
    _SUBPROCESS_ENGINES,
    _has_cuda_gpu,
    _onnxruntime_available,
    _score_engine,
    dynamic_tts_preference_order,
    get_tts_preference_order,
)


class TestEngineWeights:
    """Verify the weight metadata is internally consistent."""

    def test_all_weight_values_are_positive_integers(self):
        for engine, weight in _ENGINE_WEIGHTS.items():
            assert isinstance(weight, int), f"{engine} weight must be int"
            assert 0 < weight <= 100, f"{engine} weight {weight} out of range"

    def test_onnx_only_engines_are_lightest(self):
        """ONNX-only engines (kitten, moss) should have the lowest weights."""
        onnx_only = {"kitten_tts", "moss_tts_nano"}
        for engine in onnx_only:
            assert _ENGINE_WEIGHTS[engine] < _ENGINE_WEIGHTS["kokoro"], f"{engine} should be lighter than kokoro"

    def test_torch_only_engines_are_heaviest(self):
        """Torch-only engines should have the highest weights."""
        # styletts2 should be the heaviest (weight 60 in new scheme)
        assert _ENGINE_WEIGHTS["styletts2"] == 60, "styletts2 should be the heaviest"

    def test_subprocess_engines_are_light(self):
        """Subprocess engines should be lighter than torch engines."""
        for engine in _SUBPROCESS_ENGINES:
            assert _ENGINE_WEIGHTS[engine] < _ENGINE_WEIGHTS["styletts2"], f"{engine} should be lighter than styletts2"

    def test_onnx_preferred_set_matches_registry(self):
        """All ONNX-preferred engines should have entries in weights."""
        for engine in _ONNX_PREFERRED_ENGINES:
            assert engine in _ENGINE_WEIGHTS, f"{engine} missing from _ENGINE_WEIGHTS"


class TestScoreEngine:
    """Unit tests for the scoring function."""

    def test_lower_score_is_better(self):
        """ONNX-only should always score lower than torch-only."""
        # ONNX available, both cached
        onnx_score = _score_engine("kitten_tts", cached=True)
        torch_score = _score_engine("styletts2", cached=True)
        assert onnx_score < torch_score

    def test_cached_engines_score_lower(self):
        """Cached engines should score lower than uncached ones."""
        cached = _score_engine("kokoro", cached=True)
        uncached = _score_engine("kokoro", cached=False)
        assert cached < uncached

    def test_cache_bonus_is_consistent(self):
        """The cache bonus should be exactly -10 points."""
        for engine in ["kokoro", "styletts2", "kitten_tts"]:
            cached = _score_engine(engine, cached=True)
            uncached = _score_engine(engine, cached=False)
            assert uncached - cached == 10.0, f"Cache bonus for {engine} should be 10"

    def test_unknown_engine_defaults_to_heavy(self):
        """Unknown engines should get a high default weight."""
        score = _score_engine("nonexistent_engine_xyz", cached=False)
        assert score >= 50, "Unknown engine should score as heavy"

    def test_subprocess_bonus(self):
        """Subprocess engines should get the subprocess bonus."""
        for engine in _SUBPROCESS_ENGINES:
            score = _score_engine(engine, cached=False)
            # Base weight (30) - subprocess bonus (5) = 25
            assert score <= 30, f"{engine} should have subprocess bonus"


class TestDynamicPreferenceOrder:
    """Integration tests for the full ranking function."""

    def test_returns_list_of_strings(self):
        order = dynamic_tts_preference_order()
        assert isinstance(order, list)
        assert all(isinstance(e, str) for e in order)

    def test_contains_all_tts_engines(self):
        """All engines from TTS_ENGINES should appear in the ranking."""
        from backend.backends.protocols import TTS_ENGINES

        order = dynamic_tts_preference_order()
        for engine in TTS_ENGINES:
            assert engine in order, f"{engine} missing from dynamic order"

    def test_no_duplicates(self):
        order = dynamic_tts_preference_order()
        assert len(order) == len(set(order)), "Dynamic order contains duplicates"

    def test_onnx_engines_ranked_before_torch_on_any_hardware(self):
        """ONNX engines should rank above torch-heavy engines regardless of GPU."""
        order = dynamic_tts_preference_order()
        # Find positions of key engines
        if "kitten_tts" in order and "styletts2" in order:
            assert order.index("kitten_tts") < order.index("styletts2"), "kitten_tts should rank before styletts2"

    def test_order_is_stable_across_calls(self):
        """The dynamic order should be deterministic (cached after first call)."""
        order1 = dynamic_tts_preference_order()
        order2 = dynamic_tts_preference_order()
        assert order1 == order2


class TestGetTTSPreferenceOrder:
    """Test the cached accessor function."""

    def test_returns_same_as_dynamic(self):
        """get_tts_preference_order should match dynamic_tts_preference_order."""
        # Reset the cache to test fresh computation
        import backend.utils.model_status as ms

        ms._TTS_PREFERENCE_CACHE = None
        dynamic = dynamic_tts_preference_order()
        cached = get_tts_preference_order()
        assert dynamic == cached

    def test_cache_is_populated_after_first_call(self):
        import backend.utils.model_status as ms

        ms._TTS_PREFERENCE_CACHE = None
        get_tts_preference_order()
        assert ms._TTS_PREFERENCE_CACHE is not None

    def test_cache_is_reused(self):
        """Subsequent calls should return the cached value."""
        import backend.utils.model_status as ms

        ms._TTS_PREFERENCE_CACHE = ["test_engine"]
        result = get_tts_preference_order()
        assert result == ["test_engine"]


class TestHardwareDetection:
    """Verify hardware detection functions return booleans."""

    def test_has_cuda_gpu_returns_bool(self):
        result = _has_cuda_gpu()
        assert isinstance(result, bool)

    def test_onnxruntime_available_returns_bool(self):
        result = _onnxruntime_available()
        assert isinstance(result, bool)

    def test_cache_prevents_repeated_imports(self):
        """Functions use lru_cache — repeated calls should be fast."""
        import time

        start = time.monotonic()
        for _ in range(100):
            _has_cuda_gpu()
            _onnxruntime_available()
        elapsed = time.monotonic() - start
        assert elapsed < 0.1, f"100 cached calls took {elapsed:.3f}s — should be < 0.1s"


class TestPickCachedTEngineIntegration:
    """Integration test: pick_cached_tts_engine uses dynamic ranking."""

    def test_prefers_lighter_engine_when_multiple_cached(self, monkeypatch):
        """When multiple engines are cached, the lightest should be preferred."""
        from backend.utils import model_status

        # Mock is_engine_cached to pretend kitten_tts and zonos are both cached
        def fake_is_engine_cached(engine):
            return engine in {"kitten_tts", "styletts2"}

        monkeypatch.setattr(model_status, "is_engine_cached", fake_is_engine_cached)
        # pick_cached_tts_engine also requires manifest entitlement.
        monkeypatch.setattr("backend.services.model_registry.is_downloaded", lambda *a, **k: True)
        # Reset preference cache so it recomputes
        monkeypatch.setattr(model_status, "_TTS_PREFERENCE_CACHE", None)

        result = model_status.pick_cached_tts_engine()
        # kitten_tts (weight 10) should beat zonos (weight 60)
        assert result == "kitten_tts"

    def test_returns_preferred_when_cached(self, monkeypatch):
        """If a preferred engine is cached, it should be returned regardless of ranking."""
        from backend.utils import model_status

        def fake_is_engine_cached(engine):
            return engine == "kitten_tts"

        monkeypatch.setattr(model_status, "is_engine_cached", fake_is_engine_cached)
        # pick_cached_tts_engine also requires manifest entitlement.
        monkeypatch.setattr("backend.services.model_registry.is_downloaded", lambda *a, **k: True)

        result = model_status.pick_cached_tts_engine(preferred="kitten_tts")
        assert result == "kitten_tts"

    def test_returns_none_when_nothing_cached(self, monkeypatch):
        """Should return None when no engines are cached."""
        from backend.utils import model_status

        monkeypatch.setattr(model_status, "is_engine_cached", lambda e: False)

        result = model_status.pick_cached_tts_engine()
        assert result is None
