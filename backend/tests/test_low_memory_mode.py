"""Low memory mode - the `.mem_saver=true` session option plumbing.

Covers: pydantic surface (GET/PUT /settings/generation roundtrip), the cached
`get_low_memory_mode()` read (default off, failure-tolerant, cache invalidation),
and `run_one_shot()` arg assembly (flag appended only when the toggle is on AND
a family implements the option).
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import backend.backends.audio_cpp as ac
from backend.backends import protocols
from backend.database import get_db, session as session_module
from backend.database.generation import GenerationSettings as DBGenerationSettings
from backend.database.settings import Base
from backend.models import GenerationSettingsResponse as GenerationSettings
from backend.routes import settings as settings_routes
from backend.services import settings as settings_service


@pytest.fixture
def client(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".gen_test.db")
    os.close(fd)
    eng = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(eng, tables=[DBGenerationSettings.__table__], checkfirst=True)
    factory = sessionmaker(bind=eng)
    monkeypatch.setattr(session_module, "SessionLocal", factory)
    app = FastAPI()
    app.include_router(settings_routes.router)
    app.dependency_overrides[get_db] = lambda: factory()
    settings_service._LOW_MEMORY_CACHE = None
    yield TestClient(app)
    settings_service._LOW_MEMORY_CACHE = None


def test_defaults_to_off(client):
    resp = client.get("/settings/generation")
    assert resp.status_code == 200
    body = resp.json()
    assert body["low_memory_mode"] is False
    # pydantic models agree
    assert GenerationSettings.model_validate(body).low_memory_mode is False


def test_roundtrip(client):
    resp = client.put("/settings/generation", json={"low_memory_mode": True})
    assert resp.status_code == 200
    assert resp.json()["low_memory_mode"] is True
    # fresh GET confirms the row persisted, not just the response echo
    assert client.get("/settings/generation").json()["low_memory_mode"] is True
    # disabling persists too
    assert client.put("/settings/generation", json={"low_memory_mode": False}).json()["low_memory_mode"] is False


def test_put_invalidates_cache(client):
    """PUT -> the next helper read sees the new value immediately (no 5s TTL lag)."""
    # poison the cache with False while actually enabling
    settings_service._LOW_MEMORY_CACHE = (0.0, False)
    client.put("/settings/generation", json={"low_memory_mode": True})
    assert settings_service.get_low_memory_mode() is True


def test_helper_failure_defaults_off(client, monkeypatch):
    def _boom():
        raise RuntimeError("db down")

    monkeypatch.setattr(session_module, "SessionLocal", _boom)
    settings_service._LOW_MEMORY_CACHE = None
    assert settings_service.get_low_memory_mode() is False


# --- run_one_shot session-option plumbing -------------------------


def _capture_run(monkeypatch):
    sent = []

    def fake_run_hidden(argv, **kwargs):
        sent.append(argv)
        out = Path(argv[argv.index("--out") + 1])
        import struct
        import wave

        with wave.open(str(out), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(24000)
            w.writeframes(struct.pack("<2400h", *([0] * 2400)))

        class _P:
            returncode = 0
            stderr = ""
            stdout = ""

        return _P()

    monkeypatch.setattr(ac, "run_hidden", fake_run_hidden)
    monkeypatch.setattr(
        ac, "load_audio", lambda path, sample_rate: (np.zeros(sample_rate, dtype=np.float32), sample_rate)
    )
    return sent


def test_run_one_shot_appends_mem_saver_when_enabled(monkeypatch, tmp_path):
    binary = tmp_path / "audiocpp_cli.exe"
    binary.touch()
    monkeypatch.setattr(ac, "find_audiocpp", lambda: binary)
    monkeypatch.setattr(settings_service, "get_low_memory_mode", lambda: True)
    sent = _capture_run(monkeypatch)

    args = ["--task", "tts", "--family", "fish_audio"]
    _audio, sr = ac.run_one_shot(args, sample_rate=24000, prefix="test", mem_saver_family="fish_audio")
    argv = sent[0]
    assert "--session-option" in argv
    assert argv[argv.index("--session-option") + 1] == "fish_audio.mem_saver=true"
    assert sr == 24000


def test_run_one_shot_omits_flag_when_disabled(monkeypatch, tmp_path):
    binary = tmp_path / "audiocpp_cli.exe"
    binary.touch()
    monkeypatch.setattr(ac, "find_audiocpp", lambda: binary)
    monkeypatch.setattr(settings_service, "get_low_memory_mode", lambda: False)
    sent = _capture_run(monkeypatch)

    ac.run_one_shot(["--task", "tts"], sample_rate=24000, prefix="test", mem_saver_family="fish_audio")

    assert "--session-option" not in sent[0]


def test_run_one_shot_no_family_no_flag(monkeypatch, tmp_path):
    binary = tmp_path / "audiocpp_cli.exe"
    binary.touch()
    monkeypatch.setattr(ac, "find_audiocpp", lambda: binary)
    monkeypatch.setattr(settings_service, "get_low_memory_mode", lambda: True)
    sent = _capture_run(monkeypatch)

    ac.run_one_shot(["--task", "tts"], sample_rate=24000, prefix="test", mem_saver_family=None)

    assert "--session-option" not in sent[0]


def test_run_one_shot_env_dedupe_mem_saver(monkeypatch, tmp_path):
    binary = tmp_path / "audiocpp_cli.exe"
    binary.touch()
    monkeypatch.setattr(ac, "find_audiocpp", lambda: binary)
    monkeypatch.setattr(settings_service, "get_low_memory_mode", lambda: True)
    monkeypatch.setenv("TWENTYLABS_AUDIOCPP_SESSION_OPTS", "fish_audio.mem_saver=true")
    sent = _capture_run(monkeypatch)

    ac.run_one_shot(["--task", "tts"], sample_rate=24000, prefix="test", mem_saver_family="fish_audio")

    argv = sent[0]
    mem_saver_flags = [argv[i + 1] for i, a in enumerate(argv) if a == "--session-option"]
    assert mem_saver_flags == ["fish_audio.mem_saver=true"]


def test_oneshot_specs_carry_mem_saver_only_for_supported_families():
    from backend.backends import oneshot_audiocpp as oc

    by_family = {
        s.family: s.mem_saver_family
        for s in (
            oc.audio8_spec,
            oc.cosyvoice3_spec,
            oc.omnivoice_spec,
            oc.yue2_spec,
            oc.sa3_music_spec,
            oc.zonos3_spec,  # not supported - must stay None
            oc.PHONON,
            oc.chatterbox_turbo_spec,
        )
    }
    assert by_family["audio8_tts"] == "audio8_tts"
    assert by_family["cosyvoice3"] == "cosyvoice3"
    assert by_family["omnivoice"] == "omnivoice"
    assert by_family["yue2"] == "yue2"
    assert by_family["stable_audio"] == "stable_audio"
    assert by_family["zonos3"] is None
    assert by_family["gradium_phonon"] is None
    assert by_family["chatterbox_turbo"] is None


def test_enum_values_unchanged():
    """Guard: protocol enum keys stayed stable with the new wiring."""
    assert "fish_audio" not in protocols.TTS_ENGINES  # control sanity (family != engine key)
    assert "qwen3_tts" in protocols.TTS_ENGINES
