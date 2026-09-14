"""
Progress tracking for model downloads using Server-Sent Events.
"""

import asyncio
import contextlib
import json
import threading
from datetime import datetime


class ProgressManager:
    """Manages download progress for multiple models.

    Thread-safe: can be called from background threads (e.g., via asyncio.to_thread).
    """

    # Throttle settings to prevent overwhelming SSE clients
    THROTTLE_INTERVAL_SECONDS = 0.5  # Minimum time between updates
    THROTTLE_PROGRESS_DELTA = 1.0  # Minimum progress change (%) to force update

    def __init__(self):
        self._progress: dict[str, dict] = {}
        self._listeners: dict[str, list] = {}
        self._lock = threading.Lock()  # Thread-safe lock for progress dict
        self._main_loop: asyncio.AbstractEventLoop | None = None
        self._last_notify_time: dict[str, float] = {}  # Last notification time per model
        self._last_notify_progress: dict[str, float] = {}  # Last notified progress per model

    def _set_main_loop(self, loop: asyncio.AbstractEventLoop):
        """Set the main event loop for thread-safe operations."""
        self._main_loop = loop

    def _notify_listeners_threadsafe(self, model_name: str, progress_data: dict):
        """Notify listeners in a thread-safe manner."""
        import logging

        logger = logging.getLogger(__name__)

        if model_name not in self._listeners:
            return

        # Terminal payloads (complete/error) must always be delivered: the
        # SSE subscriber only exits on them, so a dropped terminal hangs the
        # client on heartbeats forever. Non-terminal updates may drop.
        is_terminal = progress_data.get("status") in ("complete", "error")

        # Snapshot under the lock: subscribe/unsubscribe mutate this list
        # from other threads/tasks while we iterate.
        with self._lock:
            queues = list(self._listeners.get(model_name, []))
        for queue in queues:
            try:
                # Check if we're in the main event loop thread
                try:
                    asyncio.get_running_loop()
                    # We're in an async context, can use put_nowait directly
                    try:
                        queue.put_nowait(progress_data.copy())
                    except asyncio.QueueFull:
                        if not is_terminal:
                            raise
                        with contextlib.suppress(asyncio.QueueEmpty):
                            queue.get_nowait()
                        queue.put_nowait(progress_data.copy())
                except RuntimeError:
                    # Not in async context (running in background thread)
                    # Use call_soon_threadsafe to safely put on queue
                    if self._main_loop and self._main_loop.is_running():

                        def _deliver(q=queue, d=progress_data.copy(), terminal=is_terminal):
                            try:
                                q.put_nowait(d)
                            except asyncio.QueueFull:
                                if not terminal:
                                    return
                                with contextlib.suppress(asyncio.QueueEmpty):
                                    q.get_nowait()
                                with contextlib.suppress(asyncio.QueueFull):
                                    q.put_nowait(d)

                        self._main_loop.call_soon_threadsafe(_deliver)
                    else:
                        logger.debug(f"No main loop available for {model_name}, skipping notification")
            except asyncio.QueueFull:
                logger.warning(f"Queue full for {model_name}, dropping update")
            except Exception as e:
                logger.warning(f"Error notifying listener for {model_name}: {e}")

    def update_progress(
        self,
        model_name: str,
        current: int,
        total: int,
        filename: str | None = None,
        status: str = "downloading",
    ):
        """
        Update progress for a model download.

        Thread-safe: can be called from background threads.

        Progress updates are throttled to prevent overwhelming SSE clients.
        Updates are sent at most every THROTTLE_INTERVAL_SECONDS, or when
        progress changes by at least THROTTLE_PROGRESS_DELTA percent.

        Args:
            model_name: Name of the model (e.g., "kokoro", "whisper-base")
            current: Current bytes downloaded
            total: Total bytes to download
            filename: Current file being downloaded
            status: Status string (downloading, extracting, complete, error)
        """
        import logging
        import time

        logger = logging.getLogger(__name__)

        # Calculate progress percentage, clamped to 0-100 range
        # This prevents crazy percentages from edge cases like:
        # - current > total temporarily during aggregation
        # - mixing file-count progress with byte-count progress
        if total > 0:
            progress_pct = min(100.0, max(0.0, (current / total * 100)))
        else:
            progress_pct = 0

        progress_data = {
            "model_name": model_name,
            "current": current,
            "total": total,
            "progress": progress_pct,
            "filename": filename,
            "status": status,
            "timestamp": datetime.now().isoformat(),
        }

        # Thread-safe update of progress dict (always update internal state)
        with self._lock:
            self._progress[model_name] = progress_data

        # Check if we should notify listeners (throttling)
        current_time = time.time()
        last_time = self._last_notify_time.get(model_name, 0)
        last_progress = self._last_notify_progress.get(model_name, -100)

        time_delta = current_time - last_time
        progress_delta = abs(progress_pct - last_progress)

        # Always notify for complete/error status, or if throttle conditions are met
        should_notify = (
            status in ("complete", "error")
            or time_delta >= self.THROTTLE_INTERVAL_SECONDS
            or progress_delta >= self.THROTTLE_PROGRESS_DELTA
        )

        if not should_notify:
            return  # Skip this update (throttled)

        # Update throttle tracking
        self._last_notify_time[model_name] = current_time
        self._last_notify_progress[model_name] = progress_pct

        # Notify all listeners (thread-safe)
        listener_count = len(self._listeners.get(model_name, []))

        if listener_count > 0:
            logger.debug(f"Notifying {listener_count} listeners for {model_name}: {progress_pct:.1f}% ({filename})")
            self._notify_listeners_threadsafe(model_name, progress_data)
        else:
            logger.debug(f"No listeners for {model_name}, progress update stored: {progress_pct:.1f}%")

    def get_progress(self, model_name: str) -> dict | None:
        """Get current progress for a model. Thread-safe."""
        with self._lock:
            progress = self._progress.get(model_name)
            return progress.copy() if progress else None

    def get_all_active(self) -> list[dict]:
        """Get all active downloads (status is 'downloading' or 'extracting'). Thread-safe."""
        active = []
        with self._lock:
            for _model_name, progress in self._progress.items():
                status = progress.get("status", "")
                if status in ("downloading", "extracting"):
                    active.append(progress.copy())
        return active

    def create_progress_callback(self, model_name: str, filename: str | None = None):
        """
        Create a progress callback function for HuggingFace downloads.

        Args:
            model_name: Name of the model
            filename: Optional filename filter

        Returns:
            Callback function
        """

        def callback(progress: dict):
            """HuggingFace Hub progress callback."""
            if "total" in progress and "current" in progress:
                current = progress.get("current", 0)
                total = progress.get("total", 0)
                file_name = progress.get("filename", filename)

                self.update_progress(
                    model_name=model_name,
                    current=current,
                    total=total,
                    filename=file_name,
                    status="downloading",
                )

        return callback

    async def subscribe(self, model_name: str):
        """
        Subscribe to progress updates for a model.

        Yields progress updates as Server-Sent Events.
        """
        import logging

        logger = logging.getLogger(__name__)

        # Store the main event loop for thread-safe operations
        with contextlib.suppress(RuntimeError):
            self._main_loop = asyncio.get_running_loop()

        queue = asyncio.Queue(maxsize=10)

        # Add to listeners (under lock — notify iterates this list).
        with self._lock:
            if model_name not in self._listeners:
                self._listeners[model_name] = []
            self._listeners[model_name].append(queue)

        logger.info(f"SSE client subscribed to {model_name}, total listeners: {len(self._listeners[model_name])}")

        try:
            # Send initial progress if available and still in progress (thread-safe read)
            with self._lock:
                initial_progress = self._progress.get(model_name)
                if initial_progress:
                    initial_progress = initial_progress.copy()

            if initial_progress:
                status = initial_progress.get("status")
                # Only send initial progress if download is actually in progress
                # Don't send old 'complete' or 'error' status from previous downloads
                if status in ("downloading", "extracting"):
                    logger.info(f"Sending initial progress for {model_name}: {status}")
                    yield f"data: {json.dumps(initial_progress)}\n\n"
                else:
                    logger.info(f"Skipping initial progress for {model_name} (status: {status})")
            else:
                logger.info(f"No initial progress available for {model_name}")

            # Stream updates
            while True:
                try:
                    # Wait for update with timeout
                    progress = await asyncio.wait_for(queue.get(), timeout=1.0)
                    logger.debug(
                        f"Sending progress update for {model_name}: {progress.get('status')} - {progress.get('progress', 0):.1f}%"
                    )
                    yield f"data: {json.dumps(progress)}\n\n"

                    # Stop if complete or error
                    if progress.get("status") in ("complete", "error"):
                        logger.info(f"Download {progress.get('status')} for {model_name}, closing SSE connection")
                        break
                except TimeoutError:
                    # Send heartbeat
                    yield ": heartbeat\n\n"
                    continue
        except (BrokenPipeError, ConnectionResetError, asyncio.CancelledError):
            logger.debug(f"SSE client disconnected from {model_name}")
        finally:
            # Remove from listeners (under lock to avoid race with _notify_listeners_threadsafe)
            with self._lock:
                if model_name in self._listeners:
                    with contextlib.suppress(ValueError):
                        self._listeners[model_name].remove(queue)
                    if not self._listeners[model_name]:
                        del self._listeners[model_name]
                    logger.info(
                        f"SSE client unsubscribed from {model_name}, remaining listeners: {len(self._listeners.get(model_name, []))}"
                    )

    def mark_complete(self, model_name: str):
        """Mark a model download as complete. Thread-safe."""
        import logging
        import time as _time

        logger = logging.getLogger(__name__)

        with self._lock:
            if model_name in self._progress:
                self._progress[model_name]["status"] = "complete"
                self._progress[model_name]["progress"] = 100.0
                self._progress[model_name]["completed_at"] = _time.time()
                progress_data = self._progress[model_name].copy()
            else:
                logger.warning(f"Cannot mark {model_name} as complete: not found in progress")
                return

        logger.info(f"Marked {model_name} as complete")
        # Notify listeners (thread-safe)
        self._notify_listeners_threadsafe(model_name, progress_data)
        self.prune_finished(max_age_sec=300)

    def mark_error(self, model_name: str, error: str):
        """Mark a model download as failed. Thread-safe."""
        import logging
        import time as _time

        logger = logging.getLogger(__name__)

        with self._lock:
            if model_name in self._progress:
                self._progress[model_name]["status"] = "error"
                self._progress[model_name]["error"] = error
                self._progress[model_name]["completed_at"] = _time.time()
                progress_data = self._progress[model_name].copy()
            else:
                # Create new progress entry for error
                progress_data = {
                    "model_name": model_name,
                    "current": 0,
                    "total": 0,
                    "progress": 0,
                    "filename": None,
                    "status": "error",
                    "error": error,
                    "timestamp": datetime.now().isoformat(),
                    "completed_at": _time.time(),
                }
                self._progress[model_name] = progress_data

        logger.error(f"Marked {model_name} as error: {error}")
        # Notify listeners (thread-safe)
        self._notify_listeners_threadsafe(model_name, progress_data)
        self.prune_finished(max_age_sec=300)

    def prune_finished(self, max_age_sec: float = 300) -> int:
        """Evict terminal (complete/error) entries older than *max_age_sec*.

        Prevents unbounded growth of _progress/_last_notify_* when many
        models are downloaded over a long session.
        """
        import time as _time

        now = _time.time()
        removed = 0
        with self._lock:
            for name in list(self._progress.keys()):
                entry = self._progress.get(name, {})
                if entry.get("status") not in ("complete", "error"):
                    continue
                done_at = entry.get("completed_at")
                try:
                    age = now - float(done_at) if done_at is not None else 0
                except (TypeError, ValueError):
                    age = 0
                if age >= max_age_sec:
                    self._progress.pop(name, None)
                    self._last_notify_time.pop(name, None)
                    self._last_notify_progress.pop(name, None)
                    removed += 1
        return removed

    def dismiss(self, model_name: str) -> None:
        """Drop all state for *model_name* (cancel/delete path)."""
        with self._lock:
            self._progress.pop(model_name, None)
            self._last_notify_time.pop(model_name, None)
            self._last_notify_progress.pop(model_name, None)


# Global progress manager instance
_progress_manager: ProgressManager | None = None


def get_progress_manager() -> ProgressManager:
    """Get or create the global progress manager."""
    global _progress_manager
    if _progress_manager is None:
        _progress_manager = ProgressManager()
    return _progress_manager
