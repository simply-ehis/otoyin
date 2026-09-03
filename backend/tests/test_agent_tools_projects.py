"""Tests for the project/workspace/acquire agent tool registration + dispatch.

Verifies the new TOOLS are registered in schemas, required-args validation fires
before any HTTP call, and the executor templates path params correctly for the
GET/POST endpoints (via a stubbed httpx, so no live server is needed).
"""

import asyncio
import json

import pytest

from backend.routes.assistant_tools.execution import (
    _PARALLEL_SAFE_TOOLS,
    _TOOL_REQUIRED,
    ENDPOINT_MAP,
    TOOL_METHODS,
    TOOLS,
    execute_tool,
)

NEW_TOOL_NAMES = {
    "list_projects",
    "create_agent_project",
    "get_project",
    "get_project_context",
    "list_project_sources",
    "add_project_source",
    "list_project_plans",
    "create_plan",
    "get_plan",
    "acquire_search",
    "acquire_download",
}


class _FakeResp:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self.headers = {"content-type": "application/json"}
        self._payload = payload or {"ok": True}

    def json(self):
        return self._payload


class _FakeClient:
    def __init__(self):
        self.calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url, params=None):
        self.calls.append(("GET", url, params))
        return _FakeResp(payload={"method": "GET", "url": url, "params": params})

    async def post(self, url, json=None, params=None):
        self.calls.append(("POST", url, json, params))
        return _FakeResp(payload={"method": "POST", "url": url, "json": json, "params": params})


@pytest.fixture
def fake_httpx(monkeypatch):
    import backend.routes.assistant_tools.execution as exe

    client = _FakeClient()
    monkeypatch.setattr(exe.httpx, "AsyncClient", lambda *a, **k: client)
    return client


def test_new_tools_registered():
    names = {t["function"]["name"] for t in TOOLS}
    missing = NEW_TOOL_NAMES - names
    assert not missing, missing

    for name in NEW_TOOL_NAMES:
        assert name in ENDPOINT_MAP, name
    assert _TOOL_REQUIRED["get_project"] == ["project_id"]
    assert set(_TOOL_REQUIRED["create_agent_project"]) == {"name"}
    assert set(_TOOL_REQUIRED["acquire_search"]) == {"source", "query"}


def test_required_args_validated_before_dispatch(fake_httpx):
    err = asyncio.run(execute_tool("get_project", {}, "http://h"))
    assert "Missing required argument" in err
    assert "project_id" in err
    assert fake_httpx.calls == []


def test_get_template_substitutes_path_param(fake_httpx):
    res = asyncio.run(execute_tool("get_project_context", {"project_id": "abc"}, "http://h"))
    assert fake_httpx.calls == [("GET", "http://h/projects/abc/context", None)]
    payload = json.loads(res)
    assert payload["url"] == "http://h/projects/abc/context"


def test_get_two_path_params(fake_httpx):
    asyncio.run(execute_tool("get_plan", {"project_id": "p1", "plan_id": "pl2"}, "http://h"))
    assert fake_httpx.calls == [("GET", "http://h/projects/p1/plans/pl2", None)]


def test_post_strips_path_param_keeps_body(fake_httpx):
    asyncio.run(
        execute_tool(
            "create_plan",
            {"project_id": "p1", "title": "T", "steps": ["a", "b"]},
            "http://h",
        )
    )
    assert fake_httpx.calls == [("POST", "http://h/projects/p1/plans", {"title": "T", "steps": ["a", "b"]}, None)]


def test_acquire_search_is_post(fake_httpx):
    asyncio.run(execute_tool("acquire_search", {"source": "freesound", "query": "dog", "limit": 5}, "http://h"))
    assert fake_httpx.calls == [
        ("POST", "http://h/acquire/search", {"source": "freesound", "query": "dog", "limit": 5}, None)
    ]


def test_unknown_tool_no_dispatch(fake_httpx):
    res = asyncio.run(execute_tool("does_not_exist", {"a": 1}, "http://h"))
    assert res == "Unknown tool: does_not_exist"
    assert fake_httpx.calls == []


def test_read_only_tools_are_parallel_safe():
    for name in (
        "list_projects",
        "get_project",
        "get_project_context",
        "list_project_sources",
        "list_project_plans",
        "get_plan",
    ):
        assert name in _PARALLEL_SAFE_TOOLS, name
        assert TOOL_METHODS[name] == "GET"
        assert NEW_TOOL_NAMES.__contains__(name)

    assert "create_plan" not in _PARALLEL_SAFE_TOOLS
    assert "acquire_download" not in _PARALLEL_SAFE_TOOLS
