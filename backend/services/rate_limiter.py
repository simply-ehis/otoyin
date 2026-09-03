"""Rate limiting and concurrency controls for voice chat and realtime endpoints.

Provides:
- Global session limits (prevent resource exhaustion)
- Per-connection concurrency control
- Processing rate limiting
"""

import asyncio
import logging
import time
from collections import defaultdict
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Defaults
MAX_GLOBAL_SESSIONS = 10
MAX_SESSIONS_PER_CLIENT = 2
MAX_CONCURRENT_PROCESSING = 3
PROCESSING_RATE_LIMIT_SEC = 0.5  # Min seconds between processing requests
SESSION_IDLE_TIMEOUT_SEC = 300  # 5 minutes


@dataclass
class _ClientState:
    """Per-client rate limiting state."""

    active_sessions: int = 0
    last_processing_time: float = 0.0


class RateLimiter:
    """Rate limiter for voice chat / realtime WebSocket endpoints."""

    def __init__(
        self,
        max_global_sessions: int = MAX_GLOBAL_SESSIONS,
        max_sessions_per_client: int = MAX_SESSIONS_PER_CLIENT,
        max_concurrent_processing: int = MAX_CONCURRENT_PROCESSING,
        processing_rate_limit: float = PROCESSING_RATE_LIMIT_SEC,
    ):
        self.max_global_sessions = max_global_sessions
        self.max_sessions_per_client = max_sessions_per_client
        self.max_concurrent_processing = max_concurrent_processing
        self.processing_rate_limit = processing_rate_limit

        self._global_sessions = 0
        self._client_states: dict[str, _ClientState] = defaultdict(_ClientState)
        self._processing_count = 0
        self._lock = asyncio.Lock()

    def _get_client_id(self, websocket) -> str:
        """Extract client identifier from WebSocket connection."""
        if hasattr(websocket, "client") and websocket.client:
            return f"{websocket.client.host}:{websocket.client.port}"
        return "unknown"

    async def can_open_session(self, websocket) -> tuple[bool, str]:
        """Check if a new session can be opened."""
        async with self._lock:
            client_id = self._get_client_id(websocket)
            client = self._client_states[client_id]

            if self._global_sessions >= self.max_global_sessions:
                return False, f"Global session limit reached ({self.max_global_sessions})"

            if client.active_sessions >= self.max_sessions_per_client:
                return False, f"Per-client session limit reached ({self.max_sessions_per_client})"

            return True, ""

    async def register_session(self, websocket) -> None:
        """Register a new session."""
        async with self._lock:
            self._global_sessions += 1
            client_id = self._get_client_id(websocket)
            self._client_states[client_id].active_sessions += 1
            logger.debug(
                "Session registered: global=%d, client=%s sessions=%d",
                self._global_sessions,
                client_id,
                self._client_states[client_id].active_sessions,
            )

    async def unregister_session(self, websocket) -> None:
        """Unregister a session."""
        async with self._lock:
            self._global_sessions = max(0, self._global_sessions - 1)
            client_id = self._get_client_id(websocket)
            state = self._client_states[client_id]
            state.active_sessions = max(0, state.active_sessions - 1)
            logger.debug(
                "Session unregistered: global=%d, client=%s sessions=%d",
                self._global_sessions,
                client_id,
                state.active_sessions,
            )

    async def can_process(self, websocket) -> tuple[bool, str]:
        """Check if audio processing is allowed (rate + concurrency)."""
        async with self._lock:
            if self._processing_count >= self.max_concurrent_processing:
                return False, "Too many concurrent processing requests"

            client_id = self._get_client_id(websocket)
            client = self._client_states[client_id]
            now = time.time()
            elapsed = now - client.last_processing_time

            if elapsed < self.processing_rate_limit:
                wait = self.processing_rate_limit - elapsed
                return False, f"Rate limited, retry in {wait:.1f}s"

            return True, ""

    async def register_processing(self, websocket) -> None:
        """Register a processing request."""
        async with self._lock:
            self._processing_count += 1
            client_id = self._get_client_id(websocket)
            self._client_states[client_id].last_processing_time = time.time()

    async def unregister_processing(self) -> None:
        """Unregister a processing request."""
        async with self._lock:
            self._processing_count = max(0, self._processing_count - 1)

    def get_stats(self) -> dict:
        """Get current rate limiter stats."""
        return {
            "global_sessions": self._global_sessions,
            "max_global_sessions": self.max_global_sessions,
            "processing_count": self._processing_count,
            "max_concurrent_processing": self.max_concurrent_processing,
        }


# Singleton instances
_voice_chat_limiter = RateLimiter(
    max_global_sessions=10,
    max_sessions_per_client=2,
    max_concurrent_processing=3,
    processing_rate_limit=0.5,
)

_realtime_limiter = RateLimiter(
    max_global_sessions=10,
    max_sessions_per_client=2,
    max_concurrent_processing=3,
    processing_rate_limit=0.3,
)


def get_voice_chat_limiter() -> RateLimiter:
    return _voice_chat_limiter


def get_realtime_limiter() -> RateLimiter:
    return _realtime_limiter
