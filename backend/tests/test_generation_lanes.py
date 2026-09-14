"""Tests for generation execution improvements.

Covers: preview-lane queue jumping (+ anti-starvation bound), dedup keys
over full synthesis params, status_bus ownership, per-chunk retry, and the
streaming chunk janitor. No models, GPU, or network needed.
"""

import asyncio
import contextlib

import pytest


@pytest.fixture
def _queue_state():
    """Isolated task_queue globals (never touches the app lifespan queue)."""
    import backend.services.task_queue as tq

    saved = (
        tq._generation_queue,
        set(tq._queued_generation_ids),
        dict(tq._running_generation_tasks),
        set(tq._cancelled_generation_ids),
        set(tq._inflight_dedup_keys),
        tq._preview_jumps,
    )
    tq._generation_queue = asyncio.Queue(maxsize=20)
    tq._queued_generation_ids = set()
    tq._running_generation_tasks = {}
    tq._cancelled_generation_ids = set()
    tq._inflight_dedup_keys = set()
    tq._preview_jumps = 0
    yield tq
    for job_id in list(tq._queued_generation_ids):
        tq._queued_generation_ids.discard(job_id)
    while not tq._generation_queue.empty():
        try:
            job = tq._generation_queue.get_nowait()
        except asyncio.QueueEmpty:
            break
        with contextlib.suppress(Exception):
            job.coro.close()
    (
        tq._generation_queue,
        tq._queued_generation_ids,
        tq._running_generation_tasks,
        tq._cancelled_generation_ids,
        tq._inflight_dedup_keys,
        tq._preview_jumps,
    ) = (
        saved[0],
        saved[1],
        saved[2],
        saved[3],
        saved[4],
        saved[5],
    )


def _noop_coro():
    async def _noop():
        return None

    return _noop()


def _drain_ids(tq):
    ids = []
    while not tq._generation_queue.empty():
        ids.append(tq._generation_queue.get_nowait().generation_id)
    return ids


@pytest.mark.usefixtures("_queue_state")
def test_preview_jumps_ahead_of_waiting_default():
    import backend.services.task_queue as tq

    tq.enqueue_generation("main-1", _noop_coro())
    tq.enqueue_generation("main-2", _noop_coro())
    tq.enqueue_generation("preview-1", _noop_coro(), lane="preview")
    assert _drain_ids(tq) == ["preview-1", "main-1", "main-2"]


@pytest.mark.usefixtures("_queue_state")
def test_preview_jump_budget_then_normal_queueing():
    import backend.services.task_queue as tq

    tq.enqueue_generation("main-1", _noop_coro())
    for i in range(1, 5):
        tq.enqueue_generation(f"preview-{i}", _noop_coro(), lane="preview")
    # Three jumps, then the fourth preview queues normally at the back.
    assert _drain_ids(tq) == ["preview-1", "preview-2", "preview-3", "main-1", "preview-4"]
    assert tq._preview_jumps == 3


@pytest.mark.usefixtures("_queue_state")
def test_default_lane_keeps_fifo_order():
    import backend.services.task_queue as tq

    tq.enqueue_generation("a", _noop_coro())
    tq.enqueue_generation("b", _noop_coro())
    assert _drain_ids(tq) == ["a", "b"]


@pytest.mark.usefixtures("_queue_state")
def test_preview_without_waiting_default_queues_normally():
    import backend.services.task_queue as tq

    tq.enqueue_generation("preview-1", _noop_coro(), lane="preview")
    assert _drain_ids(tq) == ["preview-1"]
    assert tq._preview_jumps == 0


def test_dedup_key_covers_full_params():
    from backend.services.task_queue import compute_generation_dedup_key

    base = dict(text="hello", profile_id="p", engine="kokoro")
    assert compute_generation_dedup_key(**base) == compute_generation_dedup_key(**base)
    assert compute_generation_dedup_key(**base, temperature=0.9) != compute_generation_dedup_key(**base)
    assert compute_generation_dedup_key(**base, voice_clean=True) != compute_generation_dedup_key(**base)
    assert compute_generation_dedup_key(**base, emotion="happy") != compute_generation_dedup_key(**base)
    assert compute_generation_dedup_key(**base, personality=True) != compute_generation_dedup_key(**base)
    assert compute_generation_dedup_key(**base, use_cloud=True) != compute_generation_dedup_key(**base)
    assert compute_generation_dedup_key(**base, normalize=False) != compute_generation_dedup_key(
        **{**base, "normalize": True}
    )


def test_status_bus_single_owner():
    from backend.routes import generations as rg
    from backend.services import status_bus

    assert rg.notify_generation_status is status_bus.notify_generation_status
    assert rg._status_subscribers is status_bus._status_subscribers


@pytest.mark.asyncio
async def test_status_bus_notify_roundtrip():
    from backend.services import status_bus

    q: asyncio.Queue = asyncio.Queue()
    status_bus._status_subscribers.setdefault("gen-x", []).append(q)
    try:
        await status_bus.notify_generation_status("gen-x", "generating", {"id": "gen-x"})
        got = q.get_nowait()
        assert got["id"] == "gen-x"
    finally:
        subs = status_bus._status_subscribers.get("gen-x", [])
        if q in subs:
            subs.remove(q)
        status_bus._status_subscribers.pop("gen-x", None)


@pytest.mark.asyncio
async def test_per_chunk_retry_recovers_transient_failure():
    import numpy as np

    from backend.utils.chunked_tts import generate_chunked

    calls = {"n": 0}

    class _FlakyBackend:
        async def generate(self, text, voice_prompt, language, seed, instruct, temperature):
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("transient")
            return np.zeros(240, dtype=np.float32), 24000

    audio, sr = await generate_chunked(
        _FlakyBackend(),
        "This is definitely longer than twenty characters, yes.",
        {},
        max_chunk_chars=20,
        crossfade_ms=50,
    )
    assert sr == 24000
    assert len(audio) > 0
    assert calls["n"] >= 2


@pytest.mark.asyncio
async def test_per_chunk_retry_fails_fast_on_validation_error():
    from backend.utils.chunked_tts import generate_chunked

    calls = {"n": 0}

    class _BrokenBackend:
        async def generate(self, text, voice_prompt, language, seed, instruct, temperature):
            calls["n"] += 1
            raise ValueError("bad voice")

    with pytest.raises(ValueError):
        await generate_chunked(
            _BrokenBackend(),
            "This is definitely longer than twenty characters, yes.",
            {},
            max_chunk_chars=20,
            crossfade_ms=50,
        )
    assert calls["n"] == 1


def test_chunk_janitor_removes_only_chunks(tmp_path, monkeypatch):
    from backend import config
    from backend.services.generation import delete_chunk_files

    gid = "gen-janitor-test"
    (tmp_path / f"{gid}_chunk_0.wav").write_bytes(b"a")
    (tmp_path / f"{gid}_chunk_1.wav").write_bytes(b"b")
    (tmp_path / f"{gid}.wav").write_bytes(b"main")
    (tmp_path / f"{gid}_abc12345.wav").write_bytes(b"take")
    monkeypatch.setattr(config, "get_generations_dir", lambda: tmp_path)

    assert delete_chunk_files(gid) == 2
    remaining = {p.name for p in tmp_path.iterdir()}
    assert remaining == {f"{gid}.wav", f"{gid}_abc12345.wav"}
