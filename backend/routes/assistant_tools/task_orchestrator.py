"""Multi-task orchestration for the in-app assistant.

Decomposes a user request into ordered sub-tasks, detects dependencies,
and groups tools into parallel-safe batches. Designed for small on-device
models (2B--4B) that cannot reliably chain many tool calls on their own —
the orchestrator provides the structure so the model only needs to
select *one* task at a time.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)


class TaskStatus(Enum):
    PENDING = "pending"
    READY = "ready"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class ParallelGroup(Enum):
    """Groups of tools that can safely execute in parallel."""

    READ_ONLY = "read_only"  # list_*, get_*, analyze_*
    INDEPENDENT_GENERATION = "independent_generation"  # separate generate calls
    MUTATING = "mutating"  # write/delete/create — sequential
    STUDIO = "studio"  # studio tools — sequential


@dataclass
class SubTask:
    """A single sub-task extracted from a user request."""

    id: str
    description: str
    tool_names: list[str]
    parallel_group: ParallelGroup = ParallelGroup.MUTATING
    depends_on: list[str] = field(default_factory=list)
    status: TaskStatus = TaskStatus.PENDING
    result: Any = None

    @property
    def ready(self) -> bool:
        return self.status == TaskStatus.READY

    @property
    def can_run_parallel(self) -> bool:
        return self.parallel_group in (
            ParallelGroup.READ_ONLY,
            ParallelGroup.INDEPENDENT_GENERATION,
        )


@dataclass
class ExecutionPlan:
    """A complete execution plan with ordered task groups.

    Groups are ordered so that dependent tasks run first, and tools
    within a group that are parallel-safe can be executed concurrently.
    """

    tasks: list[SubTask] = field(default_factory=list)
    parallel_batches: list[list[str]] = field(default_factory=list)
    sequential_steps: list[list[str]] = field(default_factory=list)
    total_tool_calls: int = 0
    estimated_parallelizable: int = 0
    estimated_sequential: int = 0
    budget_warnings: list[str] = field(default_factory=list)

    @property
    def is_empty(self) -> bool:
        return len(self.tasks) == 0

    @property
    def parallel_batch_count(self) -> int:
        return len(self.parallel_batches)

    @property
    def sequential_step_count(self) -> int:
        return len(self.sequential_steps)

    @property
    def total_steps(self) -> int:
        return self.parallel_batch_count + self.sequential_step_count


# Tools that are read-only and can always run in parallel.
# This is the same set as PARALLEL_SAFE_TOOLS in dispatcher.py but
# derived here for orchestration purposes without importing the dispatcher.
READ_ONLY_TOOLS: frozenset[str] = frozenset(
    {
        "list_voices",
        "list_effects",
        "list_captures",
        "list_models",
        "list_conversation_presets",
        "list_batch_jobs",
        "get_batch_job",
        "list_community_presets",
        "list_community_preset_categories",
        "list_builtin_presets",
        "voice_changer_capabilities",
        "list_channels",
        "get_channel",
        "get_channel_voices",
        "list_stories",
        "get_story",
        "list_project_templates",
        "list_plugins",
        "plugin_status",
        "list_scripting_functions",
        "model_cache_dir",
        "model_progress",
        "telemetry_status",
        "cuda_status",
        "list_import_formats",
        "import_info",
        "generation_version_audio",
        "list_audio_tags",
        "sample_manifest",
        "video_preview",
        "audio_preview",
        "list_projects",
        "get_project",
        "get_project_context",
        "list_project_sources",
        "list_project_plans",
        "get_plan",
        "list_audiobooks",
        "get_audiobook",
        "list_reference_voices",
        "get_reference_voice",
        "list_convolution_presets",
        "list_spatial_presets",
        "spatial_status",
        "app_help",
        "list_skills",
        "plan_templates",
        "list_export_presets",
        "dub_languages",
        "dub_status",
        "translate_languages",
        "adr_list_sessions",
        "adr_get_session",
        "studio_list_sessions",
        "list_preset_voices",
        "list_profile_samples",
        # File I/O tools
        "read_file",
        "read_pdf",
        "read_epub",
        "list_supported_files",
        "validate_file",
        # Transcription and compaction
        "transcribe_file",
        "compact_text",
    }
)

# Tools that produce independent outputs and can run in parallel
# with other generation tools (e.g., generate_sfx alongside generate_music).
INDEPENDENT_GENERATION_TOOLS: frozenset[str] = frozenset(
    {
        "generate_sfx",
        "generate_music",
    }
)


def _classify_tool_parallel_group(name: str) -> ParallelGroup:
    """Classify a tool into its parallel execution group."""
    if name in READ_ONLY_TOOLS:
        return ParallelGroup.READ_ONLY
    if name in INDEPENDENT_GENERATION_TOOLS:
        return ParallelGroup.INDEPENDENT_GENERATION
    return ParallelGroup.MUTATING


def decompose_tasks(query: str) -> list[SubTask]:
    """Decompose a natural-language query into sub-tasks.

    Uses keyword matching to identify distinct operations in the query
    and groups them into sub-tasks with appropriate parallel groups.
    Small models benefit from this because they don't need to reason
    about execution ordering — the orchestrator handles it.
    """
    q_lower = query.lower()
    tasks: list[SubTask] = []
    task_id = 0

    # Detect generation operations
    if any(
        kw in q_lower for kw in ["generate", "speak", "say", "narrate", "voiceover", "music", "sfx", "sound effect"]
    ):
        gen_tools = []
        if any(kw in q_lower for kw in ["speak", "say", "narrate", "voiceover", "generate"]):
            gen_tools.append("generate_speech")
        if any(kw in q_lower for kw in ["music", "song", "beat"]):
            gen_tools.append("generate_music")
        if any(kw in q_lower for kw in ["sfx", "sound effect", "foley"]):
            gen_tools.append("generate_sfx")
        if gen_tools:
            task_id += 1
            tasks.append(
                SubTask(
                    id=f"task_{task_id}",
                    description="Generate audio",
                    tool_names=gen_tools,
                    parallel_group=ParallelGroup.INDEPENDENT_GENERATION,
                )
            )

    # Detect voice/profile operations
    if any(kw in q_lower for kw in ["voice", "profile", "clone", "character", "vocal"]):
        voice_tools = []
        if "list" in q_lower or "available" in q_lower or "show" in q_lower:
            voice_tools.append("list_voices")
        if "clone" in q_lower:
            voice_tools.append("clone_voice")
        if "create" in q_lower and ("profile" in q_lower or "voice" in q_lower):
            voice_tools.append("create_profile")
        if "get " in q_lower or "info about" in q_lower:
            voice_tools.append("get_profile")
        if voice_tools:
            task_id += 1
            tasks.append(
                SubTask(
                    id=f"task_{task_id}",
                    description="Voice/profile management",
                    tool_names=voice_tools,
                    parallel_group=ParallelGroup.READ_ONLY
                    if "list" in q_lower or "get" in q_lower
                    else ParallelGroup.MUTATING,
                )
            )

    # Detect analysis/measurement
    if any(
        kw in q_lower for kw in ["analyze", "measure", "loudness", "pitch", "spectrogram", "check quality", "quality"]
    ):
        analysis_tools = []
        if any(kw in q_lower for kw in ["loudness", "measure", "lufs", "db", "peak"]):
            analysis_tools.append("measure_loudness")
        if any(kw in q_lower for kw in ["pitch", "note", "frequency"]):
            analysis_tools.append("analyze_pitch")
        if any(kw in q_lower for kw in ["spectrogram", "visual"]):
            analysis_tools.append("spectrogram")
        if any(kw in q_lower for kw in ["clean", "noise", "denoise", "de-noise"]):
            analysis_tools.append("noise_reduce")
        if analysis_tools:
            task_id += 1
            tasks.append(
                SubTask(
                    id=f"task_{task_id}",
                    description="Analyze/measure audio",
                    tool_names=analysis_tools,
                    parallel_group=ParallelGroup.READ_ONLY,
                )
            )

    # Detect effects
    if any(
        kw in q_lower
        for kw in ["effect", "apply", "reverb", "compress", "eq", "normalize", "duck", "fade", "silence", "denoise"]
    ):
        effect_tools = []
        if any(kw in q_lower for kw in ["apply", "effect", "chain"]):
            effect_tools.append("apply_effects")
        if "noise" in q_lower or "denoise" in q_lower or "clean" in q_lower:
            effect_tools.append("noise_reduce")
        if any(kw in q_lower for kw in ["normalize", "compress", "duck", "gate"]):
            if "normalize" in q_lower:
                effect_tools.append("normalize_audio")
            if any(kw in q_lower for kw in ["compress", "duck"]):
                effect_tools.append("compress_audio")
        if any(kw in q_lower for kw in ["fade in", "fade out", "fade"]):
            effect_tools.append("fade_in" if "in" in q_lower else "fade_out")
        if effect_tools:
            task_id += 1
            tasks.append(
                SubTask(
                    id=f"task_{task_id}",
                    description="Apply audio effects",
                    tool_names=effect_tools,
                    parallel_group=ParallelGroup.MUTATING,
                )
            )

    # Detect export/download
    if any(
        kw in q_lower for kw in ["export", "download", "save", "deliver", "platform", "preset", "spotify", "audible"]
    ):
        export_tools = []
        if any(kw in q_lower for kw in ["export", "save"]):
            export_tools.append("export_audio")
        if any(kw in q_lower for kw in ["preset", "platform", "spotify", "audible"]):
            export_tools.append("apply_export_preset")
        if export_tools:
            task_id += 1
            tasks.append(
                SubTask(
                    id=f"task_{task_id}",
                    description="Export audio",
                    tool_names=export_tools,
                    parallel_group=ParallelGroup.MUTATING,
                )
            )

    # Detect conversation/dialogue
    if any(
        kw in q_lower
        for kw in ["conversation", "dialogue", "chat", "interview", "panel", "auto duck", "auto level", "duck", "level"]
    ):
        conv_tools = []
        if any(kw in q_lower for kw in ["auto duck", "duck", "level", "auto level"]):
            conv_tools.append("conversation_auto_duck")
            conv_tools.append("conversation_auto_level")
        if conv_tools:
            task_id += 1
            tasks.append(
                SubTask(
                    id=f"task_{task_id}",
                    description="Conversation/dialogue processing",
                    tool_names=conv_tools,
                    parallel_group=ParallelGroup.MUTATING,
                )
            )

    # Detect ADR
    if any(kw in q_lower for kw in ["adr", "replace dialogue", "re-record", "replacement"]):
        adr_tools = ["adr_create_session", "adr_upload_guide", "adr_upload_take", "adr_auto_select"]
        task_id += 1
        tasks.append(
            SubTask(
                id=f"task_{task_id}",
                description="ADR dialogue replacement",
                tool_names=adr_tools,
                parallel_group=ParallelGroup.MUTATING,
            )
        )

    # Detect transcription
    if any(kw in q_lower for kw in ["transcribe", "subtitle", "captions", "diarize", "stt"]):
        trans_tools = ["transcribe"]
        if "subtitle" in q_lower or "caption" in q_lower:
            trans_tools.append("export_subtitles")
        task_id += 1
        tasks.append(
            SubTask(
                id=f"task_{task_id}",
                description="Transcription",
                tool_names=trans_tools,
                parallel_group=ParallelGroup.READ_ONLY
                if "subtitle" not in q_lower and "caption" not in q_lower
                else ParallelGroup.MUTATING,
            )
        )

    # Detect batch
    if any(kw in q_lower for kw in ["batch", "bulk", "queue", "render all", "all lines"]):
        batch_tools = ["batch_create_from_list", "batch_job_progress"]
        task_id += 1
        tasks.append(
            SubTask(
                id=f"task_{task_id}",
                description="Batch production",
                tool_names=batch_tools,
                parallel_group=ParallelGroup.MUTATING,
            )
        )

    # Detect studio/Daw
    if any(kw in q_lower for kw in ["studio", "session", "track", "daw", "arrange", "import session"]):
        studio_tools = []
        if "save" in q_lower or "save session" in q_lower:
            studio_tools.append("studio_save_session")
        if "load" in q_lower or "open" in q_lower:
            studio_tools.append("studio_load_session")
        if not studio_tools:
            studio_tools = ["studio_list_sessions"]
        task_id += 1
        tasks.append(
            SubTask(
                id=f"task_{task_id}",
                description="Audio Studio session",
                tool_names=studio_tools,
                parallel_group=ParallelGroup.STUDIO,
            )
        )

    # Detect master/finish
    if any(kw in q_lower for kw in ["master", "finish", "broadcast", "final", "glue"]):
        master_tools = ["master_audio", "run_recipe"]
        task_id += 1
        tasks.append(
            SubTask(
                id=f"task_{task_id}",
                description="Master audio",
                tool_names=master_tools,
                parallel_group=ParallelGroup.MUTATING,
            )
        )

    # If nothing detected, treat the whole query as a single task
    if not tasks:
        tasks.append(
            SubTask(
                id=f"task_{task_id + 1}",
                description=query,
                tool_names=[],
                parallel_group=ParallelGroup.MUTATING,
            )
        )

    # Build dependencies: later tasks depend on earlier ones
    for i in range(1, len(tasks)):
        tasks[i].depends_on = [tasks[i - 1].id]

    return tasks


def build_execution_plan(tasks: list[SubTask], max_tool_calls: int = 50) -> ExecutionPlan:
    """Build an execution plan from decomposed sub-tasks.

    Groups tools into parallel batches and sequential steps based on
    dependencies and parallel safety. Enforces a tool-call budget
    appropriate for small models (default 50 calls).
    """
    plan = ExecutionPlan()
    plan.tasks = tasks
    plan.total_tool_calls = sum(len(t.tool_names) for t in tasks)

    # Check budget
    if plan.total_tool_calls > max_tool_calls:
        plan.budget_warnings.append(
            f"Task requires {plan.total_tool_calls} tool calls "
            f"exceeding budget of {max_tool_calls}. Consider splitting into multiple requests."
        )
        logger.warning(
            "Execution plan exceeds budget: %d > %d",
            plan.total_tool_calls,
            max_tool_calls,
        )

    # Group tasks into parallel batches and sequential steps
    # Tasks with no pending dependencies are ready to run.
    pending = list(tasks)
    completed_ids: set[str] = set()

    while pending:
        # Find tasks whose dependencies are all satisfied
        ready_tasks = [t for t in pending if all(d in completed_ids for d in t.depends_on)]

        if not ready_tasks:
            # Circular dependency or missing dependency — break the cycle
            ready_tasks = [pending[0]]
            pending.pop(0)
            continue

        # Separate parallel-safe and mutating tasks within the ready set
        parallel_ready = [t for t in ready_tasks if t.can_run_parallel]
        mutating_ready = [t for t in ready_tasks if not t.can_run_parallel]

        # Build parallel batch from independent read-only and generation tools
        if parallel_ready:
            batch_names: list[str] = []
            for t in parallel_ready:
                batch_names.extend(t.tool_names)
                t.status = TaskStatus.READY
            plan.parallel_batches.append(batch_names)
            for t in parallel_ready:
                pending.remove(t)
                completed_ids.add(t.id)
                t.status = TaskStatus.RUNNING

        # Build sequential steps for mutating tasks
        for t in mutating_ready:
            plan.sequential_steps.append(t.tool_names)
            t.status = TaskStatus.READY
            pending.remove(t)
            completed_ids.add(t.id)
            t.status = TaskStatus.RUNNING

        if not parallel_ready and not mutating_ready:
            # Safety: break infinite loop
            break

    # Count estimated parallelizable vs sequential
    plan.estimated_parallelizable = sum(len(b) for b in plan.parallel_batches)
    plan.estimated_sequential = sum(len(s) for s in plan.sequential_steps)

    return plan


def format_execution_plan(plan: ExecutionPlan) -> str:
    """Format an execution plan as human-readable text for the model.

    Returns a concise plan summary that the model can include in its
    response to show what it intends to do. This reduces hallucination
    by making the execution explicit before any tools are called.
    """
    if plan.is_empty:
        return "No tasks to execute."

    lines = [f"Execution plan ({plan.total_steps} steps, {plan.total_tool_calls} tool calls):"]

    step_num = 0
    for batch in plan.parallel_batches:
        step_num += 1
        lines.append(f"  Step {step_num} [PARALLEL]: {', '.join(batch)}")

    for _i, step in enumerate(plan.sequential_steps):
        step_num += 1
        lines.append(f"  Step {step_num} [SEQUENTIAL]: {', '.join(step)}")

    if plan.budget_warnings:
        lines.append("")
        lines.append("Warnings:")
        for w in plan.budget_warnings:
            lines.append(f"  ⚠ {w}")

    return "\n".join(lines)


def validate_plan(plan: ExecutionPlan) -> list[str]:
    """Validate an execution plan. Returns a list of error messages."""
    errors: list[str] = []
    if plan.is_empty:
        errors.append("Execution plan is empty — no tasks to execute.")

    all_tool_names: list[str] = []
    for batch in plan.parallel_batches:
        all_tool_names.extend(batch)
    for step in plan.sequential_steps:
        all_tool_names.extend(step)

    # Check for duplicate tool calls in the same parallel batch
    for batch in plan.parallel_batches:
        seen = set()
        for name in batch:
            if name in seen:
                errors.append(f"Duplicate tool '{name}' in parallel batch")
            seen.add(name)

    # Check for conflicting mutations in parallel
    mutating_in_parallel = {
        "apply_effects",
        "noise_reduce",
        "normalize_audio",
        "compress_audio",
        "master_audio",
        "export_audio",
    }
    for batch in plan.parallel_batches:
        conflicting = [n for n in batch if n in mutating_in_parallel]
        if conflicting:
            errors.append(f"Mutating tools {conflicting} cannot run in parallel — move to sequential steps")

    return errors
