"""REST endpoints for workflow planner and executor.

Provides REST API for the 3 workflow MCP tools so they can be called
via ENDPOINT_MAP like all other tools (dual-surface: MCP + assistant).
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from ..services.workflow import PLAN_TEMPLATES, WorkflowPlan, build_plan, execute_plan

logger = logging.getLogger(__name__)

router = APIRouter()


class PlanWorkflowRequest(BaseModel):
    description: str
    steps: list[dict[str, Any]]
    template: str | None = None


class ExecutePlanRequest(BaseModel):
    plan: dict[str, Any]
    stop_on_failure: bool = True


@router.post("/workflow/plan")
async def plan_workflow_route(data: PlanWorkflowRequest) -> dict:
    """Build a workflow plan from a description and step definitions."""
    plan = build_plan(
        description=data.description,
        steps=data.steps,
        template=data.template,
    )
    return {
        "plan_id": plan.plan_id,
        "description": plan.description,
        "steps": [s.model_dump() for s in plan.steps],
        "metadata": plan.metadata,
        "step_count": len(plan.steps),
        "templates_available": list(PLAN_TEMPLATES.keys()),
    }


@router.post("/workflow/execute")
async def execute_plan_route(data: ExecutePlanRequest) -> dict:
    """Execute a workflow plan step-by-step."""
    workflow = WorkflowPlan(**data.plan)

    async def _noop_executor(tool_name: str, **params: Any) -> dict[str, Any]:
        """Placeholder executor for REST context — MCP tools use the real one."""
        return {"tool": tool_name, "params": params, "status": "delegated"}

    result = await execute_plan(
        plan=workflow,
        tool_executor=_noop_executor,
        stop_on_failure=data.stop_on_failure,
    )
    return {
        "plan_id": result.plan_id,
        "status": result.status.value,
        "total_duration_ms": result.total_duration_ms,
        "steps": [s.model_dump() for s in result.step_results],
        "completed": sum(1 for s in result.step_results if s.status.value == "completed"),
        "failed": sum(1 for s in result.step_results if s.status.value == "failed"),
        "skipped": sum(1 for s in result.step_results if s.status.value == "skipped"),
    }


@router.get("/workflow/templates")
async def list_workflow_templates() -> dict:
    """List available workflow plan templates with descriptions and step outlines."""
    return {
        "templates": {
            name: {
                "description": tmpl["description"],
                "step_count": len(tmpl["steps"]),
                "tools": [s["tool"] for s in tmpl["steps"]],
            }
            for name, tmpl in PLAN_TEMPLATES.items()
        }
    }
