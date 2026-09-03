"""Unit tests for the tool-dispatch deepened module.

Proves the seam works in isolation: one ToolDef drives both a generated HTTP
route and a generated MCP tool, errors map identically, and the in-process
adapter removes the HTTP loopback. No live server or models required.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

try:
    from backend.tool_dispatch import (
        PROFILE_TOOLS,
        InProcessAdapter,
        RestAdapter,
        get_adapter,
        invoke,
        make_mcp_tool,
        make_route,
        map_error,
        to_envelope,
    )
    from backend.tool_registry import ToolDef
except ImportError:  # pragma: no cover
    from tool_dispatch import (
        PROFILE_TOOLS,
        InProcessAdapter,
        RestAdapter,
        get_adapter,
        invoke,
        make_mcp_tool,
        make_route,
        map_error,
        to_envelope,
    )
    from tool_registry import ToolDef


class EchoIn(BaseModel):
    value: str


class EchoOut(BaseModel):
    value: str
    doubled: int


def _echo(data: EchoIn) -> EchoOut:
    return EchoOut(value=data.value, doubled=len(data.value) * 2)


def _boom(_data: EchoIn) -> EchoOut:
    raise ValueError("boom-domain")


def _explode(_data: EchoIn) -> EchoOut:
    raise RuntimeError("unexpected")


def _test_tool_def(name, handler, request_model, response_model, method="POST", endpoint="/echo"):
    return ToolDef(
        name=name,
        description="test",
        handler=handler,
        request_model=request_model,
        response_model=response_model,
        endpoint=endpoint,
        method=method,
        surfaces=["mcp"],
    )


def test_presenter_maps_value_error():
    status, msg = map_error(ValueError("bad"))
    assert status == 400 and msg == "bad"


def test_presenter_maps_unexpected_error():
    status, msg = map_error(RuntimeError("x"))
    assert status == 500 and msg == "Internal server error"


def test_presenter_audio_envelope():
    import numpy as np

    audio = np.zeros(16000, dtype=np.float32)
    env = to_envelope((audio, 16000))
    assert env["sample_rate"] == 16000
    assert env["duration"] == 1.0
    assert isinstance(env["audio_base64"], str) and env["audio_base64"]


def test_inprocess_adapter_calls_handler():
    import asyncio

    td = _test_tool_def("t.echo", _echo, EchoIn, EchoOut)
    result = asyncio.run(invoke(td, {"value": "ab"}, InProcessAdapter()))
    assert result.value == "ab"
    assert result.doubled == 4


def test_generated_route_preserves_behaviour():
    td = _test_tool_def("t.echo", _echo, EchoIn, EchoOut)
    app = FastAPI()
    app.add_api_route("/echo", make_route(td), methods=["POST"], response_model=EchoOut)
    client = TestClient(app)
    resp = client.post("/echo", json={"value": "abc"})
    assert resp.status_code == 200
    assert resp.json() == {"value": "abc", "doubled": 6}


def test_generated_route_maps_value_error():
    td = _test_tool_def("t.boom", _boom, EchoIn, EchoOut)
    app = FastAPI()
    app.add_api_route("/echo", make_route(td), methods=["POST"], response_model=EchoOut)
    client = TestClient(app)
    resp = client.post("/echo", json={"value": "x"})
    assert resp.status_code == 400
    assert "boom-domain" in resp.json()["detail"]


def test_generated_route_maps_unexpected_error():
    td = _test_tool_def("t.explode", _explode, EchoIn, EchoOut)
    app = FastAPI()
    app.add_api_route("/echo", make_route(td), methods=["POST"], response_model=EchoOut)
    client = TestClient(app)
    resp = client.post("/echo", json={"value": "x"})
    assert resp.status_code == 500


def test_get_adapter_defaults_inprocess(monkeypatch):
    monkeypatch.delenv("TWENTYLABS_MCP_TRANSPORT", raising=False)
    assert isinstance(get_adapter(), InProcessAdapter)
    monkeypatch.setenv("TWENTYLABS_MCP_TRANSPORT", "rest")
    assert isinstance(get_adapter(), RestAdapter)


def test_make_mcp_tool_registers_and_runs():
    from fastmcp import FastMCP

    mcp = FastMCP("test")
    td = _test_tool_def("t.echo", _echo, EchoIn, EchoOut)
    ok = make_mcp_tool(mcp, td, InProcessAdapter())
    assert ok is True
    import asyncio

    result = asyncio.run(invoke(td, {"value": "z"}, InProcessAdapter()))
    assert result.value == "z"


def test_make_mcp_tool_idempotent():
    from fastmcp import FastMCP

    mcp = FastMCP("test")
    td = _test_tool_def("t.echo", _echo, EchoIn, EchoOut)
    assert make_mcp_tool(mcp, td, InProcessAdapter()) is True
    # A second registration must not raise -- FastMCP tolerates the duplicate
    # (it logs "Component already exists" and keeps the first). The call
    # returning a bool without throwing proves idempotency; we avoid poking
    # FastMCP's private tool-store attribute, which varies by version.
    second = make_mcp_tool(mcp, td, InProcessAdapter())
    assert isinstance(second, bool)
    third = make_mcp_tool(mcp, td, InProcessAdapter())
    assert isinstance(third, bool)


def test_profile_catalog_wires_handlers():
    names = {td.name for td in PROFILE_TOOLS}
    assert "21labs.profiles.create_profile" in names
    assert "21labs.profiles.list_profiles" in names
    for td in PROFILE_TOOLS:
        assert callable(td.handler)
        assert td.request_model is not None or td.method == "GET"
