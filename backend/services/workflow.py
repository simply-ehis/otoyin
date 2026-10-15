"""Workflow planner and executor for otoyin MCP tools.

Decomposes complex audio tasks into ordered steps of MCP tool calls,
then executes them sequentially with dependency tracking and error handling.
"""

from __future__ import annotations

import logging
import time
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class StepStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class PlanStep(BaseModel):
    """A single tool call in a workflow plan."""

    step_id: str = Field(description="Unique step identifier (e.g. 'step_1')")
    tool: str = Field(description="MCP tool name to call (e.g. '21labs.speak')")
    description: str = Field(description="Human-readable description of what this step does")
    params: dict[str, Any] = Field(default_factory=dict, description="Parameters to pass to the tool")
    depends_on: list[str] = Field(
        default_factory=list,
        description="Step IDs that must complete before this step runs",
    )
    optional: bool = Field(default=False, description="If true, failure doesn't stop the plan")
    output_key: str | None = Field(
        default=None,
        description="Key to store this step's result under, for use in downstream params via {step_id.field}",
    )


class WorkflowPlan(BaseModel):
    """A complete workflow plan — ordered list of tool calls."""

    plan_id: str = Field(description="Unique plan identifier")
    description: str = Field(description="High-level description of what this plan accomplishes")
    steps: list[PlanStep] = Field(description="Ordered list of steps to execute")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Arbitrary metadata")


class StepResult(BaseModel):
    """Result of executing a single plan step."""

    step_id: str
    status: StepStatus
    output: dict[str, Any] | None = None
    error: str | None = None
    duration_ms: float = 0.0


class PlanExecutionResult(BaseModel):
    """Result of executing an entire workflow plan."""

    plan_id: str
    status: StepStatus  # overall status
    step_results: list[StepResult]
    total_duration_ms: float = 0.0


# ---------------------------------------------------------------------------
# Template library — common workflows
# ---------------------------------------------------------------------------

PLAN_TEMPLATES: dict[str, dict[str, Any]] = {
    "voice_conversion": {
        "description": "Convert speech from one voice to another",
        "steps": [
            {"tool": "21labs.transcribe", "description": "Transcribe source audio"},
            {"tool": "21labs.speak", "description": "Generate speech in target voice"},
        ],
    },
    "clean_and_master": {
        "description": "Clean noise and master audio to loudness target",
        "steps": [
            {"tool": "21labs.noise_reduce", "description": "Remove background noise"},
            {"tool": "21labs.eq", "description": "Apply EQ corrections"},
            {"tool": "21labs.normalize", "description": "Normalize to target loudness"},
        ],
    },
    "podcast_episode": {
        "description": "Generate a podcast segment from script",
        "steps": [
            {"tool": "21labs.speak", "description": "Generate host narration"},
            {"tool": "21labs.speak", "description": "Generate guest lines"},
            {"tool": "21labs.splice", "description": "Assemble into timeline"},
            {"tool": "21labs.normalize", "description": "Normalize final mix"},
        ],
    },
    "sfx_design": {
        "description": "Design sound effects from synthesis and processing",
        "steps": [
            {"tool": "21labs.dsp_synth", "description": "Synthesize base sound"},
            {"tool": "21labs.dsp_effect", "description": "Apply effects processing"},
            {"tool": "21labs.trim_silence", "description": "Clean up silence"},
        ],
    },
    "batch_tts": {
        "description": "Generate speech for multiple text segments",
        "steps": [
            {"tool": "21labs.speak", "description": "Generate each segment"},
            {"tool": "21labs.splice", "description": "Combine segments"},
        ],
    },
}


# ---------------------------------------------------------------------------
# Plan builder
# ---------------------------------------------------------------------------


# Hard cap on plan length: plans arrive from agents, and each step is a real
# tool call (TTS/SD/download minutes). Anything larger is a runaway loop.
MAX_PLAN_STEPS = 25


def build_plan(
    description: str,
    steps: list[dict[str, str]],
    template: str | None = None,
) -> WorkflowPlan:
    """Build a WorkflowPlan from a description and step definitions.

    Args:
        description: What this plan accomplishes.
        steps: List of dicts with 'tool', 'description', and optional 'params', 'depends_on', 'optional'.
        template: Optional template name to merge with.
    """
    plan_id = f"plan_{int(time.time() * 1000)}"

    if len(steps) > MAX_PLAN_STEPS:
        raise ValueError(f"Plan has {len(steps)} steps, exceeding the {MAX_PLAN_STEPS}-step budget")

    # Merge with template if provided
    if template and template in PLAN_TEMPLATES:
        tmpl = PLAN_TEMPLATES[template]
        description = description or tmpl["description"]
        # Template steps are defaults — user steps override by index
        tmpl_steps = tmpl["steps"]
        for i, step_def in enumerate(steps):
            if i < len(tmpl_steps):
                merged = {**tmpl_steps[i], **step_def}
                steps[i] = merged

    plan_steps: list[PlanStep] = []
    for i, step_def in enumerate(steps):
        step_id = step_def.get("step_id", f"step_{i + 1}")
        plan_steps.append(
            PlanStep(
                step_id=step_id,
                tool=step_def["tool"],
                description=step_def.get("description", ""),
                params=step_def.get("params", {}),
                depends_on=step_def.get("depends_on", []),
                optional=step_def.get("optional", False),
                output_key=step_def.get("output_key"),
            )
        )

    return WorkflowPlan(
        plan_id=plan_id,
        description=description,
        steps=plan_steps,
    )


# ---------------------------------------------------------------------------
# Parameter interpolation
# ---------------------------------------------------------------------------


def _interpolate_params(
    params: dict[str, Any],
    step_results: dict[str, StepResult],
) -> dict[str, Any]:
    """Replace {step_id.field} references in params with actual values from prior results."""
    resolved = {}
    for key, value in params.items():
        if isinstance(value, str) and value.startswith("{") and value.endswith("}"):
            ref = value[1:-1]  # strip { }
            parts = ref.split(".", 1)
            if len(parts) == 2:
                ref_step, ref_field = parts
                result = step_results.get(ref_step)
                if result and result.output:
                    resolved[key] = result.output.get(ref_field, value)
                else:
                    resolved[key] = value  # keep unresolved
            else:
                resolved[key] = value
        else:
            resolved[key] = value
    return resolved


# ---------------------------------------------------------------------------
# Executor
# ---------------------------------------------------------------------------


async def execute_plan(
    plan: WorkflowPlan,
    tool_executor: Any,  # callable: async def(tool_name, **params) -> dict
    stop_on_failure: bool = True,
) -> PlanExecutionResult:
    """Execute a workflow plan by calling tools in dependency order.

    Args:
        plan: The workflow plan to execute.
        tool_executor: Async callable that takes (tool_name, **params) and returns result dict.
        stop_on_failure: If True, stop on first non-optional failure.
    """
    step_results: dict[str, StepResult] = {}
    results_list: list[StepResult] = []
    overall_status = StepStatus.COMPLETED
    start_time = time.perf_counter()

    # Defensive slice: plans built outside build_plan() skip the budget check.
    steps = list(plan.steps)[:MAX_PLAN_STEPS]

    # Build dependency graph
    completed_steps: set[str] = set()

    for step in steps:
        # Check dependencies
        deps_met = all(dep in completed_steps for dep in step.depends_on)
        if not deps_met:
            step_result = StepResult(
                step_id=step.step_id,
                status=StepStatus.SKIPPED,
                error=f"Dependencies not met: {step.depends_on}",
            )
            step_results[step.step_id] = step_result
            results_list.append(step_result)
            continue

        # Interpolate params
        resolved_params = _interpolate_params(step.params, step_results)

        # Execute
        step_start = time.perf_counter()
        try:
            output = await tool_executor(step.tool, **resolved_params)
            duration = (time.perf_counter() - step_start) * 1000
            step_result = StepResult(
                step_id=step.step_id,
                status=StepStatus.COMPLETED,
                output=output if isinstance(output, dict) else {"result": output},
                duration_ms=duration,
            )
            completed_steps.add(step.step_id)
        except Exception as e:
            logger.debug("suppressed exception in workflow.py:270", exc_info=True)
            duration = (time.perf_counter() - step_start) * 1000
            step_result = StepResult(
                step_id=step.step_id,
                status=StepStatus.FAILED,
                error=str(e),
                duration_ms=duration,
            )
            if stop_on_failure and not step.optional:
                overall_status = StepStatus.FAILED
                step_results[step.step_id] = step_result
                results_list.append(step_result)
                break

        step_results[step.step_id] = step_result
        results_list.append(step_result)

    total_duration = (time.perf_counter() - start_time) * 1000

    # If no failures but some steps were skipped, mark as partial
    if overall_status == StepStatus.COMPLETED:
        statuses = [r.status for r in results_list]
        if StepStatus.SKIPPED in statuses:
            overall_status = StepStatus.COMPLETED  # partial success is still complete

    return PlanExecutionResult(
        plan_id=plan.plan_id,
        status=overall_status,
        step_results=results_list,
        total_duration_ms=total_duration,
    )
