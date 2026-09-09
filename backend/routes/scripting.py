"""REST API routes for the scripting/automation API."""

import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(tags=["scripting"])


def _require_localhost(request: Request) -> None:
    """Allow only localhost clients."""
    client = request.client
    if client and client.host not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(status_code=403, detail="Access denied: localhost only")


class ExecuteRequest(BaseModel):
    function: str
    args: dict = {}


@router.get("/scripting/functions")
async def list_functions():
    from ..services.scripting_api import list_api_functions

    return {"functions": list_api_functions()}


@router.post("/scripting/execute")
async def execute_function(data: ExecuteRequest, request: Request):
    _require_localhost(request)
    from ..services.scripting_api import execute_api

    result = execute_api(data.function, data.args)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result
