"""Transport adapters for the tool-dispatch core.

Two adapters give the seam its real meaning: the MCP surface can call the
service layer directly (in-process) or reach it over REST (remote). The choice
is a configuration flag, not a rewrite -- the ``ToolDef`` and the ``invoke``
interface are identical on both paths.
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


def _build_kwargs(tool_def, params: dict):
    """Construct the handler's keyword arguments from a flat params dict.

    * a pydantic-model parameter is built from ALL flat fields (MCP passes
      them un-nested), consuming the params
    * a database-session parameter is supplied by the adapter, not the caller
    * any other parameter is taken straight from ``params``
    """
    import inspect

    from pydantic import BaseModel

    from ..database import SessionLocal

    sig = inspect.signature(tool_def.handler, eval_str=True)
    kwargs: dict[str, Any] = {}
    session = None
    remaining = dict(params)
    for name, param in sig.parameters.items():
        ann = param.annotation
        if ann is not None and getattr(ann, "__name__", "") == "Session":
            session = SessionLocal()
            kwargs[name] = session
            continue
        if isinstance(ann, type) and issubclass(ann, BaseModel):
            kwargs[name] = ann(**remaining)
            remaining.clear()
            continue
        if name in remaining:
            kwargs[name] = remaining.pop(name)
    return kwargs, session


class InProcessAdapter:
    """Call the service layer directly, in the same process."""

    async def invoke(self, tool_def, params: dict):
        import inspect

        handler = tool_def.handler
        kwargs, session = _build_kwargs(tool_def, params)
        try:
            if inspect.iscoroutinefunction(handler):
                return await handler(**kwargs)
            return handler(**kwargs)
        finally:
            if session is not None:
                session.close()


class RestAdapter:
    """Reach the capability over HTTP -- the previous loopback behaviour.

    Kept for a detached MCP topology. It does not open a session locally; the
    REST route owns the database session. The base URL mirrors the env-var
    convention used everywhere else in the server.
    """

    async def invoke(self, tool_def, params: dict):
        import httpx

        host = os.environ.get("TWENTYLABS_HOST") or os.environ.get("TWENTYONE_LABS_HOST", "127.0.0.1")
        port = os.environ.get("TWENTYLABS_PORT") or os.environ.get("TWENTYONE_LABS_PORT", "17493")
        url = f"http://{host}:{port}{tool_def.endpoint}"
        method = tool_def.method.upper()
        async with httpx.AsyncClient(timeout=300) as client:
            if method == "GET":
                resp = await client.get(url, params=params or None)
            elif method == "DELETE":
                resp = await client.delete(url, params=params or None)
            else:
                resp = await client.request(method, url, json=params or None)
            resp.raise_for_status()
            return resp.json()


def get_adapter():
    """Pick the adapter from ``TWENTYLABS_MCP_TRANSPORT`` (default in-process)."""
    transport = os.environ.get("TWENTYLABS_MCP_TRANSPORT", "inprocess").lower()
    if transport == "rest":
        return RestAdapter()
    return InProcessAdapter()
