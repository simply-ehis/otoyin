"""Workflow planner and executor MCP tools.

Provides two tools:
- ``21labs.plan_workflow``: Decomposes a complex audio task into ordered MCP tool calls.
- ``21labs.execute_plan``: Runs a plan step-by-step, collecting results.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastmcp import FastMCP

from ...services.workflow import (
    PLAN_TEMPLATES,
    StepStatus,
    WorkflowPlan,
    build_plan,
    execute_plan,
)

logger = logging.getLogger(__name__)


def register_workflow_tools(mcp: FastMCP) -> None:
    # ── Plan Workflow ──────────────────────────────────────────────────

    @mcp.tool(
        name="21labs.plan_workflow",
        description=(
            "Decompose a complex audio task into an ordered plan of MCP tool calls. "
            "Returns a WorkflowPlan with steps, dependencies, and parameters. "
            "Use this before executing multi-step workflows to validate the plan "
            "before running it. Available templates: voice_conversion, clean_and_master, "
            "podcast_episode, sfx_design, batch_tts."
        ),
    )
    async def twentylabs_plan_workflow(
        description: str,
        steps: list[dict[str, Any]],
        template: str | None = None,
    ) -> dict[str, Any]:
        """Build a workflow plan from a description and step definitions.

        Each step dict should have:
        - tool: MCP tool name (e.g. "21labs.speak")
        - description: What this step does
        - params: (optional) Parameters to pass
        - depends_on: (optional) List of step_ids this depends on
        - optional: (optional) If true, failure doesn't stop the plan
        - output_key: (optional) Key to store result under for interpolation
        """
        plan = build_plan(description=description, steps=steps, template=template)
        return {
            "plan_id": plan.plan_id,
            "description": plan.description,
            "steps": [s.model_dump() for s in plan.steps],
            "metadata": plan.metadata,
            "step_count": len(plan.steps),
            "templates_available": list(PLAN_TEMPLATES.keys()),
        }

    # ── Execute Plan ───────────────────────────────────────────────────

    @mcp.tool(
        name="21labs.execute_plan",
        description=(
            "Execute a workflow plan step-by-step. Each step calls an MCP tool "
            "with the specified parameters. Results from earlier steps can be "
            "referenced in later steps via {step_id.field} interpolation. "
            "Returns execution results for each step including status, output, and timing."
        ),
    )
    async def twentylabs_execute_plan(
        plan: dict[str, Any],
        stop_on_failure: bool = True,
    ) -> dict[str, Any]:
        """Execute a workflow plan.

        Args:
            plan: A WorkflowPlan dict (as returned by plan_workflow).
            stop_on_failure: If True, stop on first non-optional failure.
        """
        # Parse plan
        workflow = WorkflowPlan(**plan)

        # Create tool executor that calls MCP tools via the FastMCP instance
        async def tool_executor(tool_name: str, **params: Any) -> dict[str, Any]:
            result = await mcp.call_tool(tool_name, params)
            # FastMCP returns a list of content blocks; extract the data
            if isinstance(result, list) and result:
                content = result[0]
                if hasattr(content, "text"):
                    try:
                        return json.loads(content.text)
                    except (json.JSONDecodeError, AttributeError):
                        return {"text": content.text}
                return {"data": str(content)}
            return {"result": str(result)}

        result = await execute_plan(
            plan=workflow,
            tool_executor=tool_executor,
            stop_on_failure=stop_on_failure,
        )

        return {
            "plan_id": result.plan_id,
            "status": result.status.value,
            "total_duration_ms": result.total_duration_ms,
            "steps": [s.model_dump() for s in result.step_results],
            "completed": sum(1 for s in result.step_results if s.status == StepStatus.COMPLETED),
            "failed": sum(1 for s in result.step_results if s.status == StepStatus.FAILED),
            "skipped": sum(1 for s in result.step_results if s.status == StepStatus.SKIPPED),
        }

    # ── List Templates ─────────────────────────────────────────────────

    @mcp.tool(
        name="21labs.plan_templates",
        description="List available workflow plan templates with their descriptions and step outlines.",
    )
    async def twentylabs_plan_templates() -> dict[str, Any]:
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
