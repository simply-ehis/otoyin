"""Assistant settings live-state + planner reload (P2 settings audit).

Covers the deferred-apply contract: context_tokens/kv_quant only take
effect when the llama-server (re)loads, so GET /settings/assistant must
report the live planner state (loaded? with what n_ctx?) alongside the
effective setting, and POST /settings/assistant/reload-planner must drop
the running server so the next chat picks the new values up.
"""

from __future__ import annotations

import os
import tempfile
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import get_db
from backend.database.misc import AppSetting
from backend.database.settings import AssistantSettings as DBAssistantSettings, Base


@pytest.fixture
def client(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".asst_test.db")
    os.close(fd)
    eng = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(
        eng, tables=[DBAssistantSettings.__table__, AppSetting.__table__], checkfirst=True
    )
    factory = sessionmaker(bind=eng)

    from backend.routes import settings as settings_routes

    app = FastAPI()
    app.include_router(settings_routes.router)
    app.dependency_overrides[get_db] = lambda: factory()
    return TestClient(app)


def _patch_planner(monkeypatch, *, loaded: bool, n_ctx: int = 8192, size: str = "2B-Q4_K_M"):
    # The routes import get_llm_backend_for_engine inside the function body,
    # so patch it where it lives (backend.backends), not on the route module.
    fake = MagicMock()
    fake.is_loaded.return_value = loaded
    fake.n_ctx = n_ctx
    fake._current_model_size = size
    # Mirror the real backend's load-time attributes (plain values — the
    # response model validates types, and auto-mocks are not strings).
    fake.kv_quant = "q8_0"
    fake.gpu_layers = 0
    monkeypatch.setattr("backend.backends.get_llm_backend_for_engine", lambda engine: fake)
    return fake


def test_get_reports_unloaded_planner(client, monkeypatch):
    _patch_planner(monkeypatch, loaded=False)
    resp = client.get("/settings/assistant")
    assert resp.status_code == 200
    body = resp.json()
    assert body["planner_loaded"] is False
    assert body["loaded_n_ctx"] is None
    assert isinstance(body["effective_n_ctx"], int) and body["effective_n_ctx"] >= 2048


def test_get_reports_live_n_ctx_when_loaded(client, monkeypatch):
    _patch_planner(monkeypatch, loaded=True, n_ctx=16384, size="2B-Q4_K_M")
    body = client.get("/settings/assistant").json()
    assert body["planner_loaded"] is True
    assert body["loaded_n_ctx"] == 16384
    assert body["loaded_model_size"] == "2B-Q4_K_M"


def test_reload_when_not_loaded_is_noop(client, monkeypatch):
    fake = _patch_planner(monkeypatch, loaded=False)
    resp = client.post("/settings/assistant/reload-planner")
    assert resp.status_code == 200
    assert resp.json()["unloaded"] is False
    fake.unload_model.assert_not_called()


def test_reload_unloads_running_planner(client, monkeypatch):
    fake = _patch_planner(monkeypatch, loaded=True)
    resp = client.post("/settings/assistant/reload-planner")
    assert resp.status_code == 200
    assert resp.json()["unloaded"] is True
    fake.unload_model.assert_called_once_with()


def test_live_state_failure_never_breaks_settings_read(client, monkeypatch):
    def _boom(engine):
        raise RuntimeError("no backend here")

    monkeypatch.setattr("backend.backends.get_llm_backend_for_engine", _boom)
    resp = client.get("/settings/assistant")
    assert resp.status_code == 200
    assert resp.json()["planner_loaded"] is False


def test_resolve_gpu_layers_precedence():
    from backend.services.settings import resolve_gpu_layers

    assert resolve_gpu_layers(None, None) == (0, False)
    assert resolve_gpu_layers(None, 35) == (35, False)
    assert resolve_gpu_layers("20", 35) == (20, True)
    assert resolve_gpu_layers("", 35) == (35, False)
    assert resolve_gpu_layers("nope", 35) == (35, False)
    assert resolve_gpu_layers("-4", 35) == (35, False)


def test_get_reports_loaded_kv_and_gpu(client, monkeypatch):
    fake = _patch_planner(monkeypatch, loaded=True, n_ctx=8192)
    fake.kv_quant = "q4_0"
    fake.gpu_layers = 24
    body = client.get("/settings/assistant").json()
    assert body["loaded_kv_quant"] == "q4_0"
    assert body["loaded_gpu_layers"] == 24
    assert isinstance(body["effective_gpu_layers"], int)


def test_put_gpu_layers_round_trip(client):
    resp = client.put("/settings/assistant", json={"gpu_layers": 12})
    assert resp.status_code == 200
    assert resp.json()["gpu_layers"] == 12
    assert client.get("/settings/assistant").json()["gpu_layers"] == 12
    # Out of range is rejected, not clamped silently.
    assert client.put("/settings/assistant", json={"gpu_layers": 1000}).status_code == 422
    assert client.put("/settings/assistant", json={"gpu_layers": -1}).status_code == 422


# ---------------------------------------------------------------------------
# Serving port (GET/PUT /settings/server + main.resolve_server_port)
# ---------------------------------------------------------------------------


def test_server_port_get_defaults(client):
    body = client.get("/settings/server").json()
    assert body["port"] == body["current_port"]
    assert body["needs_restart"] is False
    assert 1024 <= body["port"] <= 65535


def test_server_port_put_round_trip(client, monkeypatch):
    import backend.config as config_mod

    # Pretend this process serves the default port.
    monkeypatch.setattr(config_mod, "_runtime_port", 17493)
    # 18000+ is overwhelmingly likely free in CI; if busy, the test
    # honestly reports it instead of asserting a lie.
    from backend.utils.port import is_port_free

    candidate = 18080
    if not is_port_free("127.0.0.1", candidate):
        pytest.skip("port 18080 busy in this environment")
    resp = client.put("/settings/server", json={"port": candidate})
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"port": candidate, "current_port": 17493, "needs_restart": True}
    assert client.get("/settings/server").json()["port"] == candidate


def test_server_port_rejects_privileged_and_busy(client, monkeypatch):
    import backend.config as config_mod

    monkeypatch.setattr(config_mod, "_runtime_port", 17493)
    assert client.put("/settings/server", json={"port": 80}).status_code == 422
    assert client.put("/settings/server", json={"port": 99999}).status_code == 422
    # The serving port itself is "busy" (we hold it) but must be accepted.
    assert client.put("/settings/server", json={"port": 17493}).status_code == 200


def test_resolve_server_port_order(monkeypatch, tmp_path):
    import sqlite3 as _sqlite3

    import backend.config as config_mod
    from backend.main import resolve_server_port

    for var in ("OTOYIN_PORT", "TWENTYLABS_PORT"):
        monkeypatch.delenv(var, raising=False)
    # No CLI, no env, no DB → default.
    monkeypatch.setattr(config_mod, "get_data_dir", lambda: tmp_path)
    assert resolve_server_port(None) == 17493
    # CLI wins over everything.
    assert resolve_server_port(17501) == 17501
    # Env wins over persisted/default.
    monkeypatch.setenv("OTOYIN_PORT", "17502")
    assert resolve_server_port(None) == 17502
    monkeypatch.delenv("OTOYIN_PORT")
    # Persisted setting wins over default.
    db_path = tmp_path / "otoyin.db"
    conn = _sqlite3.connect(str(db_path))
    conn.execute("CREATE TABLE app_settings (key TEXT PRIMARY KEY, value_json TEXT)")
    conn.execute("INSERT INTO app_settings VALUES ('server_port', '17503')")
    conn.commit()
    conn.close()
    assert resolve_server_port(None) == 17503
    # Invalid env falls through to persisted (not a crash).
    monkeypatch.setenv("OTOYIN_PORT", "notaport")
    assert resolve_server_port(None) == 17503
    # Bad persisted value falls through to default.
    conn = _sqlite3.connect(str(db_path))
    conn.execute("UPDATE app_settings SET value_json = '\"junk\"'")
    conn.commit()
    conn.close()
    monkeypatch.delenv("OTOYIN_PORT")
    assert resolve_server_port(None) == 17493
