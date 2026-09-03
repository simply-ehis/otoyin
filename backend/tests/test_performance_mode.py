"""Tests for Performance Mode (speed vs RAM) feature.

Covers DB singleton, settings service, lifecycle pre-read, and API contract.
"""

import asyncio

import pytest

from backend.database.models import PerformanceSettings
from backend.models import PerformanceSettingsResponse, PerformanceSettingsUpdate
from backend.services import settings as settings_service
from backend.utils.model_lifecycle import ModelLifecycleManager

# ── DB / service ─────────────────────────────────────────────────────


@pytest.fixture
def db_session():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from backend.database.models import Base

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_get_performance_settings_creates_row(db_session):
    row = settings_service.get_performance_settings(db_session)
    assert isinstance(row, PerformanceSettings)
    assert row.performance_mode is False
    assert row.id == 1


def test_update_performance_settings(db_session):
    row = settings_service.update_performance_settings(db_session, {"performance_mode": True})
    assert row.performance_mode is True
    # read back
    assert settings_service.get_performance_settings(db_session).performance_mode is True
    # back to false
    settings_service.update_performance_settings(db_session, {"performance_mode": False})
    assert settings_service.get_performance_settings(db_session).performance_mode is False


def test_get_performance_mode_standalone(monkeypatch):
    from unittest.mock import MagicMock

    # SessionLocal is None in test env (no init_db) — patch it to an in-memory session
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from backend.database.models import Base
    from backend.services import settings as svc

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    sess = Session()
    mock_local = MagicMock(return_value=sess)
    monkeypatch.setattr("backend.services.settings.SessionLocal", mock_local, raising=False)
    # also patch the import inside the function (it's imported inside the function)
    monkeypatch.setattr("backend.database.session.SessionLocal", mock_local, raising=False)
    val = svc.get_performance_mode()
    assert isinstance(val, bool)
    sess.close()


# ── Pydantic ─────────────────────────────────────────────────────────


def test_pydantic_response():
    r = PerformanceSettingsResponse(performance_mode=True)
    assert r.performance_mode is True
    assert r.model_config is not None


def test_pydantic_update_partial():
    u = PerformanceSettingsUpdate(performance_mode=None)
    assert u.performance_mode is None
    u2 = PerformanceSettingsUpdate(performance_mode=True)
    assert u2.performance_mode is True


# ── Lifecycle ────────────────────────────────────────────────────────


def test_lifecycle_set_and_skip_unload():
    mgr = ModelLifecycleManager(idle_timeout=1)
    # register a fake engine that is loaded
    loaded = {"v": True}

    def is_loaded():
        return loaded["v"]

    unloaded = {"c": 0}

    def unload():
        unloaded["c"] += 1

    mgr.register("dummy_tts", is_loaded, unload)
    # performance mode off -> should unload when idle
    mgr._performance_mode = False
    mgr._engines["dummy_tts"].last_used = 0  # very old
    asyncio.run(mgr._unload_if_idle())
    assert unloaded["c"] == 1

    # reset and enable performance mode -> should skip
    unloaded["c"] = 0
    loaded["v"] = True
    mgr._engines["dummy_tts"].last_used = 0
    mgr.set_performance_mode(True)
    asyncio.run(mgr._unload_if_idle())
    assert unloaded["c"] == 0
    assert mgr._performance_mode is True


def test_lifecycle_start_prereads(monkeypatch):
    async def _run():
        mgr = ModelLifecycleManager(idle_timeout=30)
        called = {"v": False}

        def fake_refresh():
            called["v"] = True

        monkeypatch.setattr(mgr, "refresh_performance_mode", fake_refresh)
        mgr.start()
        assert called["v"] is True
        await mgr.stop()

    asyncio.run(_run())


def test_refresh_swallow_db_error(monkeypatch):
    mgr = ModelLifecycleManager()
    mgr._performance_mode = True

    def boom():
        raise RuntimeError("db down")

    monkeypatch.setattr("backend.services.settings.get_performance_mode", boom)
    # should not raise, should keep old value
    mgr.refresh_performance_mode()
    assert mgr._performance_mode is True


def test_per_engine_keepalive_overrides_global(db_session):
    # global False + per-engine True -> engine stays loaded (no unload)
    mgr = ModelLifecycleManager(idle_timeout=1)
    loaded = {"v": True}

    def is_loaded():
        return loaded["v"]

    unloaded = {"c": 0}

    def unload():
        unloaded["c"] += 1

    mgr.register("fish_speech_s2", is_loaded, unload)
    # also register a normal engine that should still unload
    loaded2 = {"v": True}
    unloaded2 = {"c": 0}

    def is_loaded2():
        return loaded2["v"]

    def unload2():
        unloaded2["c"] += 1

    mgr.register("whisper", is_loaded2, unload2)

    # global off, per-engine override for fish_speech_s2 on
    mgr._performance_mode = False
    mgr._per_engine_keepalive = {"fish_speech_s2": True}
    for h in mgr._engines.values():
        h.last_used = 0

    asyncio.run(mgr._unload_if_idle())
    # fish_speech_s2 kept despite global off -> no unload
    assert unloaded["c"] == 0
    # whisper follows global (False) -> should unload
    assert unloaded2["c"] == 1

    # Inverse: global True + per-engine False -> engine unloads despite global
    unloaded["c"] = 0
    unloaded2["c"] = 0
    loaded["v"] = True
    loaded2["v"] = True
    mgr._performance_mode = True
    mgr._per_engine_keepalive = {"fish_speech_s2": False}
    for h in mgr._engines.values():
        h.last_used = 0
    asyncio.run(mgr._unload_if_idle())
    assert unloaded["c"] == 1
    assert unloaded2["c"] == 0


def test_update_per_engine_keepalive_merge(db_session):
    # toggling one engine doesn't wipe another
    settings_service.update_performance_settings(db_session, {"per_engine_keepalive": {"fish_speech_s2": True}})
    row = settings_service.get_performance_settings(db_session)
    assert row.per_engine_keepalive.get("fish_speech_s2") is True

    settings_service.update_performance_settings(db_session, {"per_engine_keepalive": {"whisper": True}})
    row = settings_service.get_performance_settings(db_session)
    assert row.per_engine_keepalive.get("fish_speech_s2") is True
    assert row.per_engine_keepalive.get("whisper") is True


def test_is_engine_keepalive_helper(monkeypatch):
    from unittest.mock import MagicMock

    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from backend.database.models import Base
    from backend.services import settings as svc

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    sess = Session()
    # seed row: global False but per-engine fish_speech_s2 True
    svc.update_performance_settings(sess, {"performance_mode": False})
    svc.update_performance_settings(sess, {"per_engine_keepalive": {"fish_speech_s2": True}})
    mock_local = MagicMock(return_value=sess)
    monkeypatch.setattr("backend.services.settings.SessionLocal", mock_local, raising=False)
    monkeypatch.setattr("backend.database.session.SessionLocal", mock_local, raising=False)

    assert svc.is_engine_keepalive("fish_speech_s2") is True
    # whisper falls back to global False
    assert svc.is_engine_keepalive("whisper") is False

    # flip global True + per-engine False override
    # use same session via mock but update underlying row directly
    row = svc._get_or_create_performance_row(sess)
    row.performance_mode = True
    row.per_engine_keepalive = {"fish_speech_s2": False}
    sess.commit()
    assert svc.is_engine_keepalive("fish_speech_s2") is False
    assert svc.is_engine_keepalive("whisper") is True
    sess.close()


def test_pydantic_per_engine_fields():
    r = PerformanceSettingsResponse(performance_mode=False, per_engine_keepalive={"a": True})
    assert r.per_engine_keepalive["a"] is True
    u = PerformanceSettingsUpdate(per_engine_keepalive={"b": False})
    assert u.per_engine_keepalive == {"b": False}
    # default is empty dict on response, None on update
    assert PerformanceSettingsResponse().per_engine_keepalive == {}
    assert PerformanceSettingsUpdate().per_engine_keepalive is None


def test_lifecycle_refresh_reads_per_engine(monkeypatch):
    from unittest.mock import MagicMock

    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from backend.database.models import Base

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    sess = Session()
    mock_local = MagicMock(return_value=sess)

    # Write per-engine data via service using real session
    from backend.services import settings as svc

    svc.update_performance_settings(sess, {"performance_mode": False})
    svc.update_performance_settings(sess, {"per_engine_keepalive": {"dummy_tts": True}})

    # Patch SessionLocal so lifecycle reads from same in-memory DB
    monkeypatch.setattr("backend.services.settings.SessionLocal", mock_local, raising=False)
    monkeypatch.setattr("backend.database.session.SessionLocal", mock_local, raising=False)

    mgr = ModelLifecycleManager(idle_timeout=30)
    mgr.refresh_performance_mode()
    assert mgr._performance_mode is False
    assert mgr._per_engine_keepalive.get("dummy_tts") is True
    sess.close()
