"""REST API routes for the scripting/automation API."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(tags=["scripting"])


class ExecuteRequest(BaseModel):
    function: str
    args: dict = {}


@router.get("/scripting/functions")
async def list_functions():
    from ..services.scripting_api import list_api_functions

    return {"functions": list_api_functions()}


@router.post("/scripting/execute")
async def execute_function(data: ExecuteRequest):
    from ..services.scripting_api import execute_api

    result = execute_api(data.function, data.args)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result
