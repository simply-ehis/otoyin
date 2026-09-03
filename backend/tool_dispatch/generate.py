"""Generate the two surfaces -- HTTP route and MCP tool -- from one ToolDef.

Both builders read the same definition, so the route and the tool can never
drift: same handler, same request/response models, same error mapping.
"""

from __future__ import annotations

import inspect
import logging

from .core import invoke
from .presenter import map_error

logger = logging.getLogger(__name__)


def _is_session(annotation) -> bool:
    return annotation is not None and getattr(annotation, "__name__", "") == "Session"


def _is_body_model(annotation) -> bool:
    from pydantic import BaseModel

    return isinstance(annotation, type) and issubclass(annotation, BaseModel)


def make_route(tool_def):
    """Build a FastAPI endpoint from a ToolDef.

    The handler's signature drives the endpoint: a pydantic-model parameter
    becomes the request body, a database-session parameter becomes a
    ``Depends(get_db)``. Errors are mapped through the shared presenter.
    """
    from typing import Annotated

    from fastapi import Body, Depends, HTTPException

    from ..database import get_db

    handler = tool_def.handler
    sig = inspect.signature(handler, eval_str=True)
    new_params = []
    for param in sig.parameters.values():
        if _is_session(param.annotation):
            new_params.append(param.replace(default=Depends(get_db)))
        elif _is_body_model(param.annotation):
            # Force the pydantic model to be the request body so FastAPI does
            # not treat it as a (flattened) query parameter.
            new_params.append(param.replace(annotation=Annotated[param.annotation, Body()]))
        else:
            new_params.append(param)

    async def endpoint(*args, **kwargs):
        try:
            if inspect.iscoroutinefunction(handler):
                return await handler(**kwargs)
            return handler(**kwargs)
        except ValueError as exc:
            status, message = map_error(exc)
            raise HTTPException(status_code=status, detail=message) from exc
        except Exception as exc:
            status, message = map_error(exc)
            raise HTTPException(status_code=status, detail=message) from exc

    endpoint.__signature__ = inspect.Signature(new_params, return_annotation=tool_def.response_model)
    endpoint.__name__ = f"route_{tool_def.name.replace('.', '_')}"
    return endpoint


def make_mcp_tool(mcp, tool_def, adapter) -> bool:
    """Register an MCP tool from a ToolDef. Returns True if registered.

    The tool takes the request model as a single parameter so FastMCP derives
    the input schema natively (robust against string annotations). Skips
    silently when a tool with the same name is already registered, so this is
    safe to call even when the TR dispatcher has already added a loopback
    proxy for the same capability.
    """
    tool_manager = getattr(mcp, "_tool_manager", None)
    if tool_manager is not None and tool_def.name in getattr(tool_manager, "_tools", {}):
        return False

    rm = tool_def.request_model

    if rm is None:

        async def _tool():
            return await invoke(tool_def, {}, adapter)
    else:

        async def _tool(data):
            return await invoke(tool_def, data.model_dump(), adapter)

        # Attach the real model class as the parameter annotation so FastMCP can
        # build the input schema. We set it programmatically rather than in the
        # source signature, because ``from __future__ import annotations`` would
        # otherwise store it as an unresolvable string.
        _tool.__signature__ = inspect.Signature(
            [inspect.Parameter("data", inspect.Parameter.POSITIONAL_OR_KEYWORD, annotation=rm)]
        )
        _tool.__annotations__ = {"data": rm}

    _tool.__name__ = f"mcp_{tool_def.name.replace('.', '_')}"

    try:
        mcp.tool(name=tool_def.name, description=tool_def.description)(_tool)
        return True
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Failed to register MCP tool %s: %s", tool_def.name, exc)
        return False
