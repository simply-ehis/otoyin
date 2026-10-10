from contextlib import AsyncExitStack, asynccontextmanager

import pytest
from fastapi import FastAPI

from backend.utils import startup_defer


@pytest.mark.asyncio
async def test_ensure_mcp_built_enters_child_lifespan(monkeypatch):
    entered = False
    closed = False

    @asynccontextmanager
    async def child_lifespan(_):
        nonlocal entered, closed
        entered = True
        try:
            yield
        finally:
            closed = True

    child_app = FastAPI(lifespan=child_lifespan)
    child_app.lifespan = child_lifespan

    class FakeMcp:
        def http_app(self, **_kwargs):
            return child_app

    monkeypatch.setattr("backend.mcp_server.server.build_mcp_server", lambda: FakeMcp())
    monkeypatch.setattr(
        "backend.tool_registry_populate.startup_verify",
        lambda _mcp: {
            "errors": [],
            "total_tools": 1,
            "mcp_tools": 1,
            "assistant_tools": 1,
            "dual_surface": 1,
        },
    )
    startup_defer._mcp_event.clear()
    parent_app = FastAPI()

    try:
        async with AsyncExitStack() as lifespan_stack:
            parent_app.state.mcp_lifespan_stack = lifespan_stack
            await startup_defer.ensure_mcp_built(parent_app)
            assert entered is True
            assert any(getattr(route, "path", None) == "/mcp" for route in parent_app.routes)
        assert closed is True
    finally:
        startup_defer._mcp_event.clear()
