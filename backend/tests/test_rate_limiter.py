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
            raise RuntimeError("transient")
        return "ok"

    result = await with_retry(flaky, attempts=3, base_delay=0.01, label="test")
    assert result == "ok"
    assert state["tries"] == 3


@pytest.mark.asyncio
async def test_with_retry_fails_fast_on_client_errors():
    """Permanent errors (ValueError, HTTP 4xx) must not burn retries."""
    from fastapi import HTTPException

    state = {"tries": 0}

    async def bad_request():
        state["tries"] += 1
        raise ValueError("bad params")

    with pytest.raises(ValueError):
        await with_retry(bad_request, attempts=3, base_delay=0.01, label="test")
    assert state["tries"] == 1

    state["tries"] = 0

    async def not_found():
        state["tries"] += 1
        raise HTTPException(status_code=404, detail="missing")

    with pytest.raises(HTTPException):
        await with_retry(not_found, attempts=3, base_delay=0.01, label="test")
    assert state["tries"] == 1


@pytest.mark.asyncio
async def test_with_retry_still_retries_server_errors():
    from fastapi import HTTPException

    state = {"tries": 0}

    async def flaky_server():
        state["tries"] += 1
        if state["tries"] < 2:
            raise HTTPException(status_code=503, detail="busy")
        return "ok"

    result = await with_retry(flaky_server, attempts=3, base_delay=0.01, label="test")
    assert result == "ok"
    assert state["tries"] == 2


@pytest.mark.asyncio
async def test_with_retry_custom_predicate_wins():
    state = {"tries": 0}

    async def always_value_error():
        state["tries"] += 1
        raise ValueError("retry me anyway")

    with pytest.raises(ValueError):
        await with_retry(
            always_value_error,
            attempts=2,
            base_delay=0.01,
            label="test",
            retryable=lambda e: True,
        )
    assert state["tries"] == 2


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
