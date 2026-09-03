"""Tests for the GPU VRAM pressure detector.

Verifies:
- VRAM status probing (with mocked torch.cuda)
- Pressure detection logic (threshold, required_mb)
- wait_for_vram blocking/timeout behavior
- VRAMInsufficientError message formatting
- Health endpoint integration
"""

import asyncio
import os
from unittest.mock import MagicMock, patch

import pytest

from backend.utils.vram_pressure import (
    VRAMInsufficientError,
    VRAMStatus,
    check_vram_pressure,
    get_vram_status,
    wait_for_vram,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def fake_vram():
    """Create a VRAMStatus with configurable memory."""
    return VRAMStatus(
        available=True,
        total_mb=8000,
        used_mb=4000,
        free_mb=4000,
        percent_free=0.5,
        pressure=False,
        device_name="Fake GPU",
    )


@pytest.fixture
def no_gpu():
    """VRAMStatus for a CPU-only host."""
    return VRAMStatus(
        available=False,
        total_mb=0,
        used_mb=0,
        free_mb=0,
        percent_free=1.0,
        pressure=False,
    )


# ---------------------------------------------------------------------------
# VRAMStatus dataclass
# ---------------------------------------------------------------------------


class TestVRAMStatus:
    def test_fields_are_frozen(self, fake_vram):
        with pytest.raises(AttributeError):
            fake_vram.free_mb = 9999

    def test_pressure_true_when_below_threshold(self):
        status = VRAMStatus(
            available=True,
            total_mb=8000,
            used_mb=7000,
            free_mb=1000,
            percent_free=0.125,
            pressure=True,
        )
        assert status.pressure is True

    def test_pressure_false_when_above_threshold(self, fake_vram):
        assert fake_vram.pressure is False


# ---------------------------------------------------------------------------
# Threshold config
# ---------------------------------------------------------------------------


class TestGetThreshold:
    def test_default_threshold(self):
        with patch.dict(os.environ, {}, clear=True):
            os.environ.pop("TWENTYLABS_VRAM_THRESHOLD", None)
            from backend.utils.vram_pressure import _get_threshold

            assert _get_threshold() == 0.20

    def test_env_override(self):
        with patch.dict(os.environ, {"TWENTYLABS_VRAM_THRESHOLD": "0.15"}):
            from backend.utils.vram_pressure import _get_threshold

            assert _get_threshold() == 0.15

    def test_env_clamped_too_low(self):
        with patch.dict(os.environ, {"TWENTYLABS_VRAM_THRESHOLD": "0.01"}):
            from backend.utils.vram_pressure import _get_threshold

            assert _get_threshold() == 0.05  # clamped to minimum

    def test_env_clamped_too_high(self):
        with patch.dict(os.environ, {"TWENTYLABS_VRAM_THRESHOLD": "0.90"}):
            from backend.utils.vram_pressure import _get_threshold

            assert _get_threshold() == 0.50  # clamped to maximum

    def test_env_invalid_falls_back_to_default(self):
        with patch.dict(os.environ, {"TWENTYLABS_VRAM_THRESHOLD": "not_a_number"}):
            from backend.utils.vram_pressure import _get_threshold

            assert _get_threshold() == 0.20


# ---------------------------------------------------------------------------
# get_vram_status
# ---------------------------------------------------------------------------


class TestGetVRAMStatus:
    def test_no_gpu_returns_no_pressure(self):
        """Without torch.cuda available, should return no-pressure status."""
        with patch.dict("sys.modules", {"torch": None}):
            status = get_vram_status()
            assert status.available is False
            assert status.pressure is False

    def test_cuda_gpu_returns_status(self):
        """With mocked CUDA, should return real VRAM info."""
        mock_torch = MagicMock()
        mock_torch.cuda.is_available.return_value = True
        mock_torch.cuda.current_device.return_value = 0
        mock_torch.cuda.mem_get_info.return_value = (
            8 * 1024 * 1024 * 1024,  # total: 8 GB
            6 * 1024 * 1024 * 1024,  # free: 6 GB
        )
        mock_torch.cuda.get_device_name.return_value = "RTX 4090"

        with patch.dict("sys.modules", {"torch": mock_torch}):
            status = get_vram_status()

        assert status.available is True
        assert status.total_mb == pytest.approx(8192, rel=0.01)
        assert status.free_mb == pytest.approx(6144, rel=0.01)
        assert status.used_mb == pytest.approx(2048, rel=0.01)
        assert status.device_name == "RTX 4090"
        assert status.pressure is False  # 75% free > 20% threshold

    def test_cuda_low_vram_reports_pressure(self):
        """With very little free VRAM, should report pressure."""
        mock_torch = MagicMock()
        mock_torch.cuda.is_available.return_value = True
        mock_torch.cuda.current_device.return_value = 0
        mock_torch.cuda.mem_get_info.return_value = (
            8 * 1024 * 1024 * 1024,  # total: 8 GB
            1 * 1024 * 1024 * 1024,  # free: 1 GB (12.5% — below 20%)
        )
        mock_torch.cuda.get_device_name.return_value = "RTX 4090"

        with patch.dict("sys.modules", {"torch": mock_torch}):
            status = get_vram_status()

        assert status.pressure is True
        assert status.percent_free == pytest.approx(0.125, abs=0.01)


# ---------------------------------------------------------------------------
# check_vram_pressure
# ---------------------------------------------------------------------------


class TestCheckVRAMPressure:
    def test_no_gpu_always_ok(self, no_gpu):
        with patch("backend.utils.vram_pressure.get_vram_status", return_value=no_gpu):
            ok, _status = check_vram_pressure(required_mb=4000)
            assert ok is True

    def test_enough_free(self, fake_vram):
        with patch("backend.utils.vram_pressure.get_vram_status", return_value=fake_vram):
            # 4000 MB free, need 1000 MB, threshold reserve = 8000 * 0.2 = 1600
            # 4000 >= 1600 + 1000 = 2600 → OK
            ok, _status = check_vram_pressure(required_mb=1000)
            assert ok is True

    def test_not_enough_free(self, fake_vram):
        with patch("backend.utils.vram_pressure.get_vram_status", return_value=fake_vram):
            # 4000 MB free, need 3000 MB, threshold reserve = 1600
            # 4000 < 1600 + 3000 = 4600 → NOT OK
            ok, _status = check_vram_pressure(required_mb=3000)
            assert ok is False

    def test_just_enough(self, fake_vram):
        with patch("backend.utils.vram_pressure.get_vram_status", return_value=fake_vram):
            # 4000 MB free, need 2400 MB, threshold reserve = 1600
            # 4000 >= 1600 + 2400 = 4000 → exactly OK
            ok, _status = check_vram_pressure(required_mb=2400)
            assert ok is True

    def test_no_model_needed(self, fake_vram):
        """Loading a 0 MB model (e.g. subprocess) should always succeed."""
        with patch("backend.utils.vram_pressure.get_vram_status", return_value=fake_vram):
            ok, _status = check_vram_pressure(required_mb=0)
            assert ok is True

    def test_heavily_loaded_gpu(self):
        """GPU with 90% used should block most loads."""
        status = VRAMStatus(
            available=True,
            total_mb=8000,
            used_mb=7200,
            free_mb=800,
            percent_free=0.1,
            pressure=True,
        )
        with patch("backend.utils.vram_pressure.get_vram_status", return_value=status):
            ok, _ = check_vram_pressure(required_mb=500)
            # 800 < 1600 (threshold reserve) + 500 → blocked
            assert ok is False


# ---------------------------------------------------------------------------
# wait_for_vram
# ---------------------------------------------------------------------------


class TestWaitForVRAM:
    @pytest.mark.asyncio
    async def test_immediate_success(self, fake_vram):
        """When VRAM is available immediately, should return without waiting."""
        with patch("backend.utils.vram_pressure.get_vram_status", return_value=fake_vram):
            result = await wait_for_vram(required_mb=500, timeout=2)
            assert result == fake_vram

    @pytest.mark.asyncio
    async def test_timeout_raises_error(self):
        """When VRAM never recovers, should raise VRAMInsufficientError."""
        always_low = VRAMStatus(
            available=True,
            total_mb=8000,
            used_mb=7500,
            free_mb=500,
            percent_free=0.0625,
            pressure=True,
        )
        with (
            patch("backend.utils.vram_pressure.get_vram_status", return_value=always_low),
            patch("backend.utils.vram_pressure._try_free_vram"),
        ):
            with pytest.raises(VRAMInsufficientError) as exc_info:
                await wait_for_vram(required_mb=2000, timeout=0.5)
            assert "VRAM insufficient" in str(exc_info.value)
            assert exc_info.value.required_mb == 2000

    @pytest.mark.asyncio
    async def test_recovery_after_free(self):
        """When VRAM recovers after a free attempt, should return."""
        low = VRAMStatus(
            available=True,
            total_mb=8000,
            used_mb=7500,
            free_mb=500,
            percent_free=0.0625,
            pressure=True,
        )
        good = VRAMStatus(
            available=True,
            total_mb=8000,
            used_mb=3000,
            free_mb=5000,
            percent_free=0.625,
            pressure=False,
        )
        call_count = 0

        def alternating_status():
            nonlocal call_count
            call_count += 1
            return low if call_count <= 2 else good

        with (
            patch("backend.utils.vram_pressure.get_vram_status", side_effect=alternating_status),
            patch("backend.utils.vram_pressure._try_free_vram"),
        ):
            result = await wait_for_vram(required_mb=500, timeout=5)
            assert result.available is True
            assert result.free_mb == 5000


# ---------------------------------------------------------------------------
# VRAMInsufficientError
# ---------------------------------------------------------------------------


class TestVRAMInsufficientError:
    def test_message_format(self):
        err = VRAMInsufficientError(
            required_mb=2000,
            free_mb=500,
            total_mb=8000,
            threshold=0.20,
        )
        msg = str(err)
        assert "2000" in msg
        assert "500" in msg
        assert "8000" in msg
        assert "20%" in msg

    def test_is_exception(self):
        err = VRAMInsufficientError(1000, 100, 4000, 0.2)
        assert isinstance(err, Exception)
        assert err.required_mb == 1000
        assert err.free_mb == 100


# ---------------------------------------------------------------------------
# Integration: load_engine_model VRAM gate
# ---------------------------------------------------------------------------


class TestLoadEngineModelVRAMGate:
    @pytest.mark.asyncio
    async def test_subprocess_engine_skips_vram_check(self, monkeypatch):
        """Subprocess engines (qwen3_tts, bark_small) should not check VRAM."""
        from backend.backends import registry

        load_called = False

        async def fake_load_model(model_size="default"):
            nonlocal load_called
            load_called = True

        class FakeBackend:
            def is_loaded(self):
                return False

            def unload_model(self):
                pass

            async def load_model(self, model_size="default"):
                nonlocal load_called
                load_called = True

        monkeypatch.setattr(registry, "get_tts_backend_for_engine", lambda e: FakeBackend())

        # Mock is_downloaded to return True
        monkeypatch.setattr(
            "backend.services.model_registry.is_downloaded",
            lambda name, size="default": True,
        )
        # Mock get_all_model_configs (imported inside load_engine_model)
        monkeypatch.setattr(
            "backend.backends.configs.get_all_model_configs",
            lambda: [
                MagicMock(engine="qwen3_tts", model_size="default", model_name="qwen3", size_mb=1486, gpu_only=False)
            ],
        )

        # Mock wait_for_vram to track if it was called
        vram_check_called = False

        async def mock_wait(**kwargs):
            nonlocal vram_check_called
            vram_check_called = True

        monkeypatch.setattr("backend.utils.vram_pressure.wait_for_vram", mock_wait)

        await registry.load_engine_model("qwen3_tts")
        assert load_called is True
        assert vram_check_called is False, "VRAM check should be skipped for subprocess engines"

    @pytest.mark.asyncio
    async def test_torch_engine_checks_vram(self, monkeypatch):
        """Torch engines should go through VRAM pressure check."""
        from backend.backends import registry

        load_called = False

        class FakeBackend:
            def is_loaded(self):
                return False

            def unload_model(self):
                pass

            async def load_model(self, model_size="default"):
                nonlocal load_called
                load_called = True

        monkeypatch.setattr(registry, "get_tts_backend_for_engine", lambda e: FakeBackend())
        monkeypatch.setattr(
            "backend.services.model_registry.is_downloaded",
            lambda name, size="default": True,
        )
        monkeypatch.setattr(
            "backend.backends.configs.get_all_model_configs",
            lambda: [
                MagicMock(engine="chattts", model_size="default", model_name="chattts", size_mb=2000, gpu_only=False)
            ],
        )

        vram_check_called = False

        async def mock_wait(**kwargs):
            nonlocal vram_check_called
            vram_check_called = True

        monkeypatch.setattr("backend.utils.vram_pressure.wait_for_vram", mock_wait)

        await registry.load_engine_model("chattts")
        assert load_called is True
        assert vram_check_called is True, "VRAM check should run for torch engines"


# ---------------------------------------------------------------------------
# _try_free_vram
# ---------------------------------------------------------------------------


class TestTryFreeVRAM:
    @pytest.mark.asyncio
    async def test_calls_lifecycle_manager(self):
        """Should trigger lifecycle manager idle unload."""
        from backend.utils.vram_pressure import _try_free_vram

        mock_lifecycle = MagicMock()
        mock_lifecycle._unload_if_idle = MagicMock(return_value=asyncio.sleep(0))

        with (
            patch("backend.utils.vram_pressure._get_lifecycle_manager", return_value=mock_lifecycle),
            patch("backend.utils.vram_pressure._get_cleanup_gpu_memory", return_value=MagicMock()),
        ):
            await _try_free_vram()
            mock_lifecycle._unload_if_idle.assert_called_once()

    @pytest.mark.asyncio
    async def test_does_not_raise_on_failure(self):
        """Should silently handle lifecycle manager errors."""
        from backend.utils.vram_pressure import _try_free_vram

        with (
            patch(
                "backend.utils.vram_pressure._get_lifecycle_manager",
                side_effect=RuntimeError("not running"),
            ),
            patch("backend.utils.vram_pressure._get_cleanup_gpu_memory", return_value=MagicMock()),
        ):
            # Should not raise
            await _try_free_vram()
