"""Tests for the multi-task orchestrator (Phase 2).

Covers:
- decompose_tasks keyword matching
- build_execution_plan dependency ordering
- format_execution_plan output
- validate_plan error detection
- ParallelGroup classification
"""

from backend.routes.assistant_tools.task_orchestrator import (
    ParallelGroup,
    SubTask,
    TaskStatus,
    build_execution_plan,
    decompose_tasks,
    format_execution_plan,
    validate_plan,
)


class TestSubTask:
    def test_defaults(self):
        t = SubTask(id="s1", description="test", tool_names=["tool_a"])
        assert t.id == "s1"
        assert t.description == "test"
        assert t.tool_names == ["tool_a"]
        assert t.parallel_group == ParallelGroup.MUTATING
        assert t.depends_on == []
        assert t.status == TaskStatus.PENDING

    def test_ready_property(self):
        t = SubTask(id="s1", description="test", tool_names=[], status=TaskStatus.READY)
        assert t.ready is True

    def test_can_run_parallel(self):
        t = SubTask(id="s1", description="test", tool_names=[], parallel_group=ParallelGroup.READ_ONLY)
        assert t.can_run_parallel is True

        t2 = SubTask(id="s2", description="test", tool_names=[], parallel_group=ParallelGroup.MUTATING)
        assert t2.can_run_parallel is False

    def test_can_run_independent_generation(self):
        t = SubTask(id="s1", description="test", tool_names=[], parallel_group=ParallelGroup.INDEPENDENT_GENERATION)
        assert t.can_run_parallel is True


class TestDecomposeTasks:
    def test_generation_detected(self):
        tasks = decompose_tasks("generate speech saying hello")
        assert len(tasks) >= 1
        assert any("generate_speech" in t.tool_names for t in tasks)

    def test_voice_detected(self):
        tasks = decompose_tasks("clone this voice")
        assert len(tasks) >= 1
        assert any("clone_voice" in t.tool_names for t in tasks)

    def test_analysis_detected(self):
        tasks = decompose_tasks("measure the loudness")
        assert len(tasks) >= 1
        assert any("measure_loudness" in t.tool_names for t in tasks)

    def test_effects_detected(self):
        tasks = decompose_tasks("apply reverb and compress")
        assert len(tasks) >= 1
        assert any("apply_effects" in t.tool_names for t in tasks)

    def test_export_detected(self):
        tasks = decompose_tasks("export to mp3")
        assert len(tasks) >= 1
        assert any("export_audio" in t.tool_names for t in tasks)

    def test_conversation_detected(self):
        tasks = decompose_tasks("auto duck the music")
        assert len(tasks) >= 1
        assert any("conversation_auto_duck" in t.tool_names for t in tasks)

    def test_adr_detected(self):
        tasks = decompose_tasks("adr replace dialogue")
        assert len(tasks) >= 1
        assert any("adr_create_session" in t.tool_names for t in tasks)

    def test_transcription_detected(self):
        tasks = decompose_tasks("transcribe this audio")
        assert len(tasks) >= 1
        assert any("transcribe" in t.tool_names for t in tasks)

    def test_batch_detected(self):
        tasks = decompose_tasks("batch render all")
        assert len(tasks) >= 1
        assert any("batch_create_from_list" in t.tool_names for t in tasks)

    def test_studio_detected(self):
        tasks = decompose_tasks("save studio session")
        assert len(tasks) >= 1
        assert any("studio_save_session" in t.tool_names for t in tasks)

    def test_master_detected(self):
        tasks = decompose_tasks("master the audio")
        assert len(tasks) >= 1
        assert any("master_audio" in t.tool_names for t in tasks)

    def test_empty_query_returns_single_task(self):
        tasks = decompose_tasks("")
        assert len(tasks) == 1

    def test_all_dependencies_chained(self):
        tasks = decompose_tasks("generate speech and export")
        if len(tasks) > 1:
            for i in range(1, len(tasks)):
                assert tasks[i].depends_on == [tasks[i - 1].id]


class TestBuildExecutionPlan:
    def test_empty_tasks(self):
        plan = build_execution_plan([])
        assert plan.is_empty
        assert plan.total_tool_calls == 0

    def test_single_task(self):
        tasks = [SubTask(id="s1", description="gen", tool_names=["generate_speech"])]
        plan = build_execution_plan(tasks)
        assert plan.total_tool_calls == 1

    def test_dependent_ordering(self):
        tasks = [
            SubTask(id="s1", description="gen", tool_names=["generate_speech"]),
            SubTask(id="s2", description="export", tool_names=["export_audio"], depends_on=["s1"]),
        ]
        plan = build_execution_plan(tasks)
        assert plan.total_tool_calls == 2

    def test_budget_warning(self):
        many_tasks = [SubTask(id=f"s{i}", description=f"task {i}", tool_names=["generate_speech"]) for i in range(60)]
        plan = build_execution_plan(many_tasks, max_tool_calls=50)
        assert len(plan.budget_warnings) > 0

    def test_read_only_in_parallel(self):
        tasks = [
            SubTask(id="s1", description="list", tool_names=["list_voices"], parallel_group=ParallelGroup.READ_ONLY),
        ]
        plan = build_execution_plan(tasks)
        assert plan.parallel_batch_count >= 1

    def test_independent_generation_parallel(self):
        tasks = [
            SubTask(
                id="s1",
                description="sfx",
                tool_names=["generate_sfx"],
                parallel_group=ParallelGroup.INDEPENDENT_GENERATION,
            ),
            SubTask(
                id="s2",
                description="music",
                tool_names=["generate_music"],
                parallel_group=ParallelGroup.INDEPENDENT_GENERATION,
            ),
        ]
        plan = build_execution_plan(tasks)
        # Both are independent generation, should be in parallel batch
        assert plan.parallel_batch_count >= 1

    def test_parallel_batch_count(self):
        tasks = [
            SubTask(id="s1", description="list", tool_names=["list_voices"], parallel_group=ParallelGroup.READ_ONLY),
        ]
        plan = build_execution_plan(tasks)
        assert plan.total_steps == plan.parallel_batch_count + plan.sequential_step_count


class TestFormatExecutionPlan:
    def test_empty_plan(self):
        plan = build_execution_plan([])
        assert format_execution_plan(plan) == "No tasks to execute."

    def test_non_empty_plan(self):
        tasks = [
            SubTask(id="s1", description="list", tool_names=["list_voices"], parallel_group=ParallelGroup.READ_ONLY),
        ]
        plan = build_execution_plan(tasks)
        result = format_execution_plan(plan)
        assert "Execution plan" in result
        assert "tool calls" in result

    def test_includes_parallel_steps(self):
        tasks = [
            SubTask(id="s1", description="list", tool_names=["list_voices"], parallel_group=ParallelGroup.READ_ONLY),
        ]
        plan = build_execution_plan(tasks)
        result = format_execution_plan(plan)
        assert "PARALLEL" in result

    def test_includes_sequential_steps(self):
        tasks = [
            SubTask(id="s1", description="gen", tool_names=["generate_speech"]),
        ]
        plan = build_execution_plan(tasks)
        result = format_execution_plan(plan)
        assert "SEQUENTIAL" in result or "Step" in result

    def test_includes_budget_warnings(self):
        many_tasks = [SubTask(id=f"s{i}", description=f"task {i}", tool_names=["generate_speech"]) for i in range(60)]
        plan = build_execution_plan(many_tasks, max_tool_calls=50)
        result = format_execution_plan(plan)
        assert "Warnings:" in result


class TestValidatePlan:
    def test_empty_plan_errors(self):
        plan = build_execution_plan([])
        errors = validate_plan(plan)
        assert any("empty" in e for e in errors)

    def test_valid_plan_no_errors(self):
        tasks = [
            SubTask(id="s1", description="list", tool_names=["list_voices"], parallel_group=ParallelGroup.READ_ONLY),
        ]
        plan = build_execution_plan(tasks)
        errors = validate_plan(plan)
        assert errors == []

    def test_duplicate_tool_in_parallel_batch_errors(self):
        tasks = [
            SubTask(
                id="s1",
                description="dup",
                tool_names=["generate_speech", "generate_speech"],
                parallel_group=ParallelGroup.READ_ONLY,
            ),
        ]
        plan = build_execution_plan(tasks)
        errors = validate_plan(plan)
        assert any("Duplicate" in e for e in errors)

    def test_mutating_in_parallel_errors(self):
        tasks = [
            SubTask(id="s1", description="mut", tool_names=["export_audio"], parallel_group=ParallelGroup.READ_ONLY),
        ]
        plan = build_execution_plan(tasks)
        errors = validate_plan(plan)
        assert any("Mutating tools" in e for e in errors)


class TestParallelGroup:
    def test_enum_values(self):
        assert ParallelGroup.READ_ONLY.value == "read_only"
        assert ParallelGroup.INDEPENDENT_GENERATION.value == "independent_generation"
        assert ParallelGroup.MUTATING.value == "mutating"
        assert ParallelGroup.STUDIO.value == "studio"
