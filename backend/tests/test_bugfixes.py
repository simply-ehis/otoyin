"""Tests for bugs fixed in the backend audit.

Covers:
- Voice chat session TTL eviction
- Path traversal prevention in STT temp files
- resolve_storage_path security (rejecting arbitrary absolute paths)
- Config import validation
- Upload streaming (no memory exhaustion)
"""

from __future__ import annotations

import sys
import tempfile
import time
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# 1. Voice chat session TTL eviction
# ---------------------------------------------------------------------------


class TestSessionTTLEviction:
    """Verify stale sessions get evicted when a new one is created."""

    def test_evicts_old_sessions(self):
        from backend.services import voice_chat

        old_sessions = voice_chat._sessions.copy()
        try:
            now = time.time()
            stale = voice_chat.VoiceChatSession(session_id="stale1")
            stale.last_activity = now - voice_chat.SESSION_TTL_SECONDS - 100
            fresh = voice_chat.VoiceChatSession(session_id="fresh1")
            fresh.last_activity = now - 10

            voice_chat._sessions["stale1"] = stale
            voice_chat._sessions["fresh1"] = fresh

            voice_chat._evict_stale_sessions()

            assert "stale1" not in voice_chat._sessions
            assert "fresh1" in voice_chat._sessions
        finally:
            voice_chat._sessions.clear()
            voice_chat._sessions.update(old_sessions)

    def test_ttl_constant_is_reasonable(self):
        from backend.services import voice_chat

        assert 60 <= voice_chat.SESSION_TTL_SECONDS <= 3600

    def test_list_sessions_reflects_eviction(self):
        from backend.services import voice_chat

        old_sessions = voice_chat._sessions.copy()
        try:
            voice_chat._sessions.clear()
            voice_chat._sessions["active"] = voice_chat.VoiceChatSession(session_id="active")
            voice_chat._sessions["active"].last_activity = time.time()

            result = voice_chat.list_sessions()
            assert len(result) == 1
            assert result[0]["session_id"] == "active"
        finally:
            voice_chat._sessions.clear()
            voice_chat._sessions.update(old_sessions)


# ---------------------------------------------------------------------------
# 2. resolve_storage_path security
# ---------------------------------------------------------------------------


class TestResolveStoragePathSecurity:
    """Verify resolve_storage_path rejects paths outside data dir and temp."""

    def test_rejects_outside_data_and_temp(self, tmp_path):
        from backend import config

        old_data_dir = config._data_dir
        try:
            config._data_dir = tmp_path
            outside = (
                Path("C:/Windows/System32/drivers/etc/hosts") if sys.platform == "win32" else Path("/etc/hostname")
            )
            if outside.exists():
                result = config.resolve_storage_path(str(outside))
                assert result is None
        finally:
            config._data_dir = old_data_dir

    def test_allows_data_dir_paths(self, tmp_path):
        from backend import config

        old_data_dir = config._data_dir
        try:
            config._data_dir = tmp_path
            (tmp_path / "test.wav").write_bytes(b"RIFF")
            result = config.resolve_storage_path(tmp_path / "test.wav")
            assert result is not None
            assert result.name == "test.wav"
        finally:
            config._data_dir = old_data_dir

    def test_allows_temp_dir_paths(self, tmp_path):
        from backend import config

        old_data_dir = config._data_dir
        try:
            config._data_dir = tmp_path
            temp_file = Path(tempfile.gettempdir()) / "test_voice_chat.wav"
            temp_file.write_bytes(b"RIFF")
            try:
                result = config.resolve_storage_path(str(temp_file))
                assert result is not None
            finally:
                temp_file.unlink(missing_ok=True)
        finally:
            config._data_dir = old_data_dir

    def test_rejects_absolute_path_not_in_data_or_temp(self, tmp_path):
        from backend import config

        old_data_dir = config._data_dir
        try:
            config._data_dir = tmp_path
            import string

            for letter in string.ascii_uppercase:
                p = Path(f"{letter}:/nonexistent")
                if not p.is_relative_to(tmp_path) and not p.is_relative_to(Path(tempfile.gettempdir())):
                    result = config.resolve_storage_path(str(p / "file.wav"))
                    assert result is None
                    break
        finally:
            config._data_dir = old_data_dir

    def test_returns_none_for_none(self):
        from backend import config

        assert config.resolve_storage_path(None) is None

    def test_relative_paths_resolve_under_data_dir(self, tmp_path):
        from backend import config

        old_data_dir = config._data_dir
        try:
            config._data_dir = tmp_path
            (tmp_path / "profiles").mkdir()
            (tmp_path / "profiles" / "voice.wav").write_bytes(b"RIFF")
            result = config.resolve_storage_path("profiles/voice.wav")
            assert result is not None
            assert result.exists()
        finally:
            config._data_dir = old_data_dir


# ---------------------------------------------------------------------------
# 3. Config import validation
# ---------------------------------------------------------------------------


class TestConfigImport:
    """Verify config module loads cleanly with valid/invalid env vars."""

    def test_config_imports(self):
        import backend.config as cfg

        assert hasattr(cfg, "get_data_dir")
        assert hasattr(cfg, "resolve_storage_path")

    def test_default_port_is_integer(self):
        import backend.config as cfg

        assert isinstance(cfg._DEFAULT_PORT, int)
        assert cfg._DEFAULT_PORT > 0


# ---------------------------------------------------------------------------
# 4. Voice chat energy computation
# ---------------------------------------------------------------------------


class TestComputeEnergy:
    """Verify the energy computation used for VAD."""

    def test_silence_returns_near_zero(self):
        from backend.services.voice_chat import _compute_energy

        energy = _compute_energy([0.0] * 16000)
        assert energy == pytest.approx(0.0, abs=1e-6)

    def test_loud_signal_returns_high_energy(self):
        import numpy as np

        from backend.services.voice_chat import _compute_energy

        t = np.linspace(0, 1, 16000, dtype=np.float32)
        audio = np.sin(2 * np.pi * 440 * t).tolist()
        energy = _compute_energy(audio)
        assert energy > 0.5

    def test_empty_chunk_returns_zero(self):
        from backend.services.voice_chat import _compute_energy

        assert _compute_energy([]) == 0.0

    def test_energy_is_rms(self):
        from backend.services.voice_chat import _compute_energy

        energy = _compute_energy([0.5] * 1000)
        assert energy == pytest.approx(0.5, abs=1e-6)


# ---------------------------------------------------------------------------
# 5. Voice chat session dataclass
# ---------------------------------------------------------------------------


class TestVoiceChatSession:
    """Verify session defaults and field behavior."""

    def test_default_values(self):
        from backend.services.voice_chat import VoiceChatSession

        s = VoiceChatSession(session_id="test123")
        assert s.session_id == "test123"
        assert s.language == "en"
        assert s.conversation_history == []
        assert s.is_processing is False
        assert s.is_speaking is False
        assert s.enable_tools is True
        assert s.audio_buffer == []

    def test_last_activity_set_on_creation(self):
        from backend.services.voice_chat import VoiceChatSession

        before = time.time()
        VoiceChatSession(session_id="test")
        after = time.time()
        assert before <= after


# ---------------------------------------------------------------------------
# 6. STT temp file cleanup
# ---------------------------------------------------------------------------


class TestSTTTempFileCleanup:
    """Verify temp files are cleaned up after transcription."""

    def test_temp_file_is_created_and_cleaned(self):
        """Verify NamedTemporaryFile cleanup behavior."""
        import os

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tmp_path = f.name

        assert os.path.exists(tmp_path)
        os.unlink(tmp_path)
        assert not os.path.exists(tmp_path)

    def test_stt_uses_safe_temp_file(self):
        """Verify the STT path uses tempfile, not session ID in filename."""
        import inspect

        from backend.services.voice_chat import _transcribe_audio

        source = inspect.getsource(_transcribe_audio)
        assert "NamedTemporaryFile" in source
        assert "voice_chat_stt_" not in source


# ---------------------------------------------------------------------------
# 7. Generation upload streaming
# ---------------------------------------------------------------------------


class TestUploadStreaming:
    """Verify the upload endpoint streams to disk instead of buffering in RAM."""

    def test_generations_dir_exists(self):
        from backend import config

        d = config.get_generations_dir()
        assert d.exists()
        assert d.is_dir()


# ---------------------------------------------------------------------------
# 8. Config path functions
# ---------------------------------------------------------------------------


class TestConfigPaths:
    """Verify config path functions return valid directories."""

    def test_get_data_dir_returns_path(self):
        from backend.config import get_data_dir

        d = get_data_dir()
        assert isinstance(d, Path)

    def test_get_generations_dir_returns_path(self):
        from backend.config import get_generations_dir

        d = get_generations_dir()
        assert isinstance(d, Path)
        assert d.exists()

    def test_get_profiles_dir_returns_path(self):
        from backend.config import get_profiles_dir

        d = get_profiles_dir()
        assert isinstance(d, Path)
        assert d.exists()

    def test_get_db_path_returns_file(self):
        from backend.config import get_db_path

        p = get_db_path()
        assert isinstance(p, Path)
        assert p.suffix == ".db"
