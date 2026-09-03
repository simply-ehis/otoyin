"""
Unit tests for backend.utils.rate_limiter.

Verifies call pacing (token-bucket spacing) and retry-with-backoff
(success-after-failure, and re-raise after exhausting attempts) without
any network or model dependency.
"""

import time

import pytest

from backend.utils.rate_limiter import (
    RateLimitConfig,
    RateLimiter,
    get_limiter,
    with_retry,
)


@pytest.mark.asyncio
async def test_rate_limiter_paces_calls():
    limiter = RateLimiter(RateLimitConfig(min_interval=0.2, max_burst=1))
    starts = []

    async def spaced():
        for _ in range(3):
            await limiter.acquire()
            starts.append(time.monotonic())

    await spaced()
    # Three calls should be ~0.2s apart => total elapsed ~0.4s.
    gaps = [starts[i + 1] - starts[i] for i in range(len(starts) - 1)]
    assert all(gap >= 0.15 for gap in gaps), f"gaps too small: {gaps}"
    assert starts[-1] - starts[0] >= 0.35, f"total too short: {starts}"


@pytest.mark.asyncio
async def test_with_retry_succeeds_after_failures():
    state = {"tries": 0}

    async def flaky():
        state["tries"] += 1
        if state["tries"] < 3:
            raise ValueError("transient")
        return "ok"

    result = await with_retry(flaky, attempts=3, base_delay=0.01, label="test")
    assert result == "ok"
    assert state["tries"] == 3


@pytest.mark.asyncio
async def test_with_retry_reraises_after_exhausting():
    state = {"tries": 0}

    async def always_fail():
        state["tries"] += 1
        raise RuntimeError("boom")

    with pytest.raises(RuntimeError):
        await with_retry(always_fail, attempts=2, base_delay=0.01, label="test")
    assert state["tries"] == 2


def test_get_limiter_is_shared_per_domain():
    a = get_limiter("tts")
    b = get_limiter("tts")
    c = get_limiter("music")
    assert a is b
    assert a is not c
