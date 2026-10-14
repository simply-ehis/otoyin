"""
Task tracking for active downloads and generations.
"""

import threading
from dataclasses import dataclass, field
from datetime import UTC, datetime


class DownloadCancelledError(Exception):
    """Raised inside a download worker when the user cancelled the task.

    Its name is listed in ``rate_limiter._NON_RETRYABLE_NAMES`` so
    ``with_retry`` gives up immediately instead of retrying a deliberate
    cancel three times.
    """


@dataclass
class DownloadTask:
    """Represents an active download task."""

    model_name: str
    status: str = "downloading"  # downloading, extracting, complete, error
    started_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    error: str | None = None
    # Set by TaskManager.cancel_download; the worker polls it to abort
    # mid-file instead of downloading to completion behind the UI's back.
    cancel_event: threading.Event = field(default_factory=threading.Event)


@dataclass
class GenerationTask:
    """Represents an active generation task."""

    task_id: str
    profile_id: str
    text_preview: str  # First 50 chars of text
    started_at: datetime = field(default_factory=lambda: datetime.now(UTC))


class TaskManager:
    """Manages active downloads and generations."""

    def __init__(self):
        self._active_downloads: dict[str, DownloadTask] = {}
        self._active_generations: dict[str, GenerationTask] = {}

    def start_download(self, model_name: str) -> DownloadTask:
        """Mark a download as started and return the task instance.

        Callers keep the returned task to guard against cancel/complete
        races (see :meth:`is_active_download`).
        """
        task = DownloadTask(
            model_name=model_name,
            status="downloading",
        )
        self._active_downloads[model_name] = task
        return task

    def is_active_download(self, model_name: str, task: DownloadTask) -> bool:
        """Return True if ``task`` is still the live task for ``model_name``.

        After a cancel (or a restarted download) the stored task is removed
        or replaced, so a stale background worker must not overwrite state.
        """
        return self._active_downloads.get(model_name) is task

    def complete_download(self, model_name: str) -> None:
        """Mark a download as complete."""
        if model_name in self._active_downloads:
            del self._active_downloads[model_name]

    def error_download(self, model_name: str, error: str) -> None:
        """Mark a download as failed."""
        if model_name in self._active_downloads:
            self._active_downloads[model_name].status = "error"
            self._active_downloads[model_name].error = error

    def start_generation(self, task_id: str, profile_id: str, text: str) -> None:
        """Mark a generation as started."""
        text_preview = text[:50] + "..." if len(text) > 50 else text
        self._active_generations[task_id] = GenerationTask(
            task_id=task_id,
            profile_id=profile_id,
            text_preview=text_preview,
        )

    def complete_generation(self, task_id: str) -> None:
        """Mark a generation as complete."""
        if task_id in self._active_generations:
            del self._active_generations[task_id]

    def get_active_downloads(self) -> list[DownloadTask]:
        """Get all active downloads."""
        return list(self._active_downloads.values())

    def get_active_generations(self) -> list[GenerationTask]:
        """Get all active generations."""
        return list(self._active_generations.values())

    def cancel_download(self, model_name: str) -> bool:
        """Cancel/dismiss a download task (removes it from active list).

        Signals the task's cancel event first so the background worker
        aborts the in-flight transfer instead of finishing it.
        """
        task = self._active_downloads.pop(model_name, None)
        if task is None:
            return False
        task.cancel_event.set()
        return True

    def clear_all(self) -> None:
        """Clear all download and generation tasks."""
        self._active_downloads.clear()
        self._active_generations.clear()

    def is_download_active(self, model_name: str) -> bool:
        """Check if a download is active."""
        return model_name in self._active_downloads

    def is_generation_active(self, task_id: str) -> bool:
        """Check if a generation is active."""
        return task_id in self._active_generations


# Global task manager instance
_task_manager: TaskManager | None = None


def get_task_manager() -> TaskManager:
    """Get or create the global task manager."""
    global _task_manager
    if _task_manager is None:
        _task_manager = TaskManager()
    return _task_manager
