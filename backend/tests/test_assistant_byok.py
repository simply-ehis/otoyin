"""Tests: assistant LLM falls back to the BYOK llm provider when no key is given."""

import pytest
from fastapi import Request

from backend.database.session import init_db
from backend.routes import assistant as assistant_route


@pytest.fixture(autouse=True)
def _ensure_db():
    """The route reads the assistant system prompt from the DB, so the engine
    must be initialized. App startup normally does this via the client fixture
    (TestClient triggers startup), but these tests call the route handler
    directly and bypass startup.

    ``get_assistant_system_prompt`` captures ``SessionLocal`` at import time, so
    ``init_db()`` (which rebinds the session module's global) is not enough on
    its own -- the captured reference in ``backend.services.settings`` must also
    be refreshed.
    """
    init_db()
    import backend.services.settings as settings_mod
    from backend.database.session import SessionLocal

    settings_mod.SessionLocal = SessionLocal


def _make_request():
    scope = {
        "type": "http",
        "method": "POST",
        "headers": [],
        "path": "/assistant/chat",
        "query_string": b"",
        "scheme": "http",
        "server": ("localhost", 8000),
    }
    return Request(scope)


async def test_assistant_uses_byok_llm_provider(monkeypatch):
    captured = {}

    async def fake_stream_api(messages, system_prompt, api_key, api_base_url, model_id, use_tools, local_base_url=""):
        captured["api_key"] = api_key
        captured["api_base_url"] = api_base_url
        captured["model_id"] = model_id
        yield "data: hi\n\n"

    monkeypatch.setattr(assistant_route, "stream_api", fake_stream_api)
    monkeypatch.setattr(
        "backend.services.cloud_provider.get_cloud_provider",
        lambda domain: {"base_url": "https://llm.example/v1", "api_key": "sk-stored", "model": "gpt-4o-mini"},
    )

    req = assistant_route.ChatRequest(messages=[{"role": "user", "content": "hello"}])
    resp = await assistant_route.assistant_chat(req, _make_request())
    chunks = [c async for c in resp.body_iterator]
    assert any("hi" in c for c in chunks)
    assert captured["api_base_url"] == "https://llm.example/v1"
    assert captured["api_key"] == "sk-stored"
    # model_id should be sourced from the stored provider when default.
    assert captured["model_id"] == "gpt-4o-mini"


async def test_assistant_explicit_key_wins_over_store(monkeypatch):
    captured = {}

    async def fake_stream_api(messages, system_prompt, api_key, api_base_url, model_id, use_tools, local_base_url=""):
        captured["api_key"] = api_key
        captured["api_base_url"] = api_base_url
        yield "data: x\n\n"

    monkeypatch.setattr(assistant_route, "stream_api", fake_stream_api)
    monkeypatch.setattr(
        "backend.services.cloud_provider.get_cloud_provider",
        lambda domain: {"base_url": "https://store.example/v1", "api_key": "sk-store", "model": "store-model"},
    )

    req = assistant_route.ChatRequest(
        messages=[{"role": "user", "content": "hi"}],
        api_key="sk-explicit",
        api_base_url="https://explicit.example/v1",
    )
    resp = await assistant_route.assistant_chat(req, _make_request())
    _ = [c async for c in resp.body_iterator]
    assert captured["api_key"] == "sk-explicit"
    assert captured["api_base_url"] == "https://explicit.example/v1"
