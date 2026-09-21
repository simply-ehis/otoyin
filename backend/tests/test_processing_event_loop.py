"""P1.1: DSP must not block the event loop.

Sidechain-duck, compress, and silence-removal used to run per-sample Python
loops inside ``async`` route handlers, stalling every other request for the
duration. These tests run each handler in this loop next to a 20 ms heartbeat
and fail if the loop ever stalls longer than ``MAX_GAP``.
"""

from __future__ import annotations

import asyncio
import base64
import contextlib
import io
import time
import uuid

import numpy as np
import soundfile as sf

from backend.config import get_exports_dir, to_storage_path
from backend.routes.audio_pipeline.processing import (
    apply_sidechain_duck,
    compress_audio,
    silence_removal_audio,
)

SR = 24000
DUR_S = 60  # long enough that per-sample Python loops stall the loop pre-fix
MAX_GAP = 0.5  # seconds; pre-fix stalls are multi-second, post-fix ~ms


def _tone(n: int, freq: float = 220.0, amp: float = 0.3) -> np.ndarray:
    return (amp * np.sin(2 * np.pi * freq * np.arange(n) / SR)).astype(np.float32)


def _write_fixture(name: str, audio: np.ndarray) -> str:
    out = get_exports_dir() / f"{uuid.uuid4().hex[:8]}_{name}"
    sf.write(str(out), audio.astype(np.float32), SR)
    return str(to_storage_path(out)).replace("\\", "/")


def _wav_b64(audio: np.ndarray) -> str:
    buf = io.BytesIO()
    sf.write(buf, audio.astype(np.float32), SR, format="WAV")
    return base64.b64encode(buf.getvalue()).decode()


def _cleanup(*storage_paths: str) -> None:
    exports = get_exports_dir()
    for sp in storage_paths:
        if not sp:
            continue
        name = sp.replace("\\", "/").split("/")[-1]
        with contextlib.suppress(OSError):
            (exports / name).unlink(missing_ok=True)


async def _max_gap_during(coro):
    """Run *coro* while a 20 ms heartbeat records worst loop stall."""
    gaps: list[float] = []
    stop = False
    last = time.perf_counter()

    async def beat():
        nonlocal last
        while not stop:
            await asyncio.sleep(0.02)
            now = time.perf_counter()
            gaps.append(now - last)
            last = now

    task = asyncio.create_task(beat())
    try:
        result = await coro
    finally:
        stop = True
        await task
    return result, max(gaps) if gaps else 0.0


async def test_duck_does_not_block_event_loop():
    n = DUR_S * SR
    master = _tone(n)
    side = np.zeros(n, dtype=np.float32)
    side[: n // 2] = _tone(n // 2, freq=110.0, amp=0.6)
    sp = _write_fixture("duck_master.wav", master)
    try:
        res, gap = await _max_gap_during(apply_sidechain_duck(sp, [{"track_id": "t1", "audio_data": _wav_b64(side)}]))
        assert res["output_path"], "duck produced no output"
        assert gap < MAX_GAP, f"event loop stalled {gap:.2f}s during duck"
    finally:
        _cleanup(sp, res.get("output_path") if "res" in dir() else None)


async def test_compress_does_not_block_event_loop():
    n = DUR_S * SR
    sp = _write_fixture("compress_in.wav", _tone(n))
    try:
        res, gap = await _max_gap_during(compress_audio(sp))
        assert res["output_path"], "compress produced no output"
        assert gap < MAX_GAP, f"event loop stalled {gap:.2f}s during compress"
    finally:
        _cleanup(sp, res.get("output_path") if "res" in dir() else None)


async def test_silence_removal_does_not_block_event_loop():
    n = DUR_S * SR
    sig = _tone(n)
    sig[n // 3 : 2 * n // 3] = 0.0  # a 20 s gap to remove
    sp = _write_fixture("silence_in.wav", sig)
    try:
        res, gap = await _max_gap_during(silence_removal_audio(sp))
        assert res["output_path"], "silence-removal produced no output"
        assert gap < MAX_GAP, f"event loop stalled {gap:.2f}s during silence-removal"
    finally:
        _cleanup(sp, res.get("output_path") if "res" in dir() else None)
