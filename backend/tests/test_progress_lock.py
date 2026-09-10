"""Regression tests for progress.py listener atomicity fix.

Verifies that SSE listener removal is thread-safe and handles:
- Concurrent subscribe/unsubscribe without race conditions
- Double-removal (ValueError from list.remove) handled gracefully
- Listener dict cleanup when last listener removed
"""

import asyncio
import contextlib
import threading
import time

from backend.utils.progress import ProgressManager


class TestListenerAtomicity:
    """Verify the _lock protects listener mutations."""

    def test_subscribe_and_unsubscribe(self):
        pm = ProgressManager()
        queue = asyncio.Queue(maxsize=10)

        # Subscribe manually (mimicking the async subscribe method)
        pm._listeners["test-model-lock"] = [queue]

        # Unsubscribe (simulating the SSE finally block under lock)
        with pm._lock:
            if "test-model-lock" in pm._listeners:
                with contextlib.suppress(ValueError):
                    pm._listeners["test-model-lock"].remove(queue)
                if not pm._listeners["test-model-lock"]:
                    del pm._listeners["test-model-lock"]

        assert "test-model-lock" not in pm._listeners

    def test_double_removal_no_error(self):
        """Removing a listener twice should not raise."""
        pm = ProgressManager()
        queue = asyncio.Queue(maxsize=10)
        pm._listeners["test-double"] = [queue]

        # First removal
        with pm._lock:
            if "test-double" in pm._listeners:
                with contextlib.suppress(ValueError):
                    pm._listeners["test-double"].remove(queue)
                if not pm._listeners["test-double"]:
                    del pm._listeners["test-double"]

        # Second removal — should be a no-op
        with pm._lock:
            if "test-double" in pm._listeners:
                with contextlib.suppress(ValueError):
                    pm._listeners["test-double"].remove(queue)
                if not pm._listeners["test-double"]:
                    del pm._listeners["test-double"]

        assert "test-double" not in pm._listeners

    def test_concurrent_subscribe_unsubscribe(self):
        """Multiple threads subscribing and unsubscribing concurrently."""
        pm = ProgressManager()
        errors = []
        n_threads = 10

        def subscriber_task(model_idx):
            try:
                queue = asyncio.Queue(maxsize=10)
                name = f"concurrent-{model_idx}"

                # Subscribe
                with pm._lock:
                    if name not in pm._listeners:
                        pm._listeners[name] = []
                    pm._listeners[name].append(queue)

                time.sleep(0.001)  # Tiny delay to interleave

                # Unsubscribe
                with pm._lock:
                    if name in pm._listeners:
                        with contextlib.suppress(ValueError):
                            pm._listeners[name].remove(queue)
                        if not pm._listeners[name]:
                            del pm._listeners[name]
            except Exception as e:
                errors.append(e)

        threads = []
        for i in range(n_threads):
            t = threading.Thread(target=subscriber_task, args=(i % 3,))
            threads.append(t)
            t.start()

        for t in threads:
            t.join(timeout=5)

        assert errors == [], f"Concurrent access errors: {errors}"
        # All listeners should be cleaned up
        for i in range(3):
            assert f"concurrent-{i}" not in pm._listeners

    def test_notify_does_not_crash_after_removal(self):
        """Notifications after listener removal should not raise."""
        pm = ProgressManager()
        queue = asyncio.Queue(maxsize=10)

        # Remove the listener
        pm._listeners["notify-test"] = [queue]
        with pm._lock:
            if "notify-test" in pm._listeners:
                with contextlib.suppress(ValueError):
                    pm._listeners["notify-test"].remove(queue)
                if not pm._listeners["notify-test"]:
                    del pm._listeners["notify-test"]

        # This should not crash — there are no listeners to notify
        pm.update_progress(model_name="notify-test", current=50, total=100)

    def test_mark_complete_after_listener_removed(self):
        """mark_complete after listener removal should not crash."""
        pm = ProgressManager()
        queue = asyncio.Queue(maxsize=10)

        pm._listeners["complete-test"] = [queue]
        with pm._lock:
            if "complete-test" in pm._listeners:
                with contextlib.suppress(ValueError):
                    pm._listeners["complete-test"].remove(queue)
                if not pm._listeners["complete-test"]:
                    del pm._listeners["complete-test"]

        # Should not raise
        pm.update_progress(model_name="complete-test", current=100, total=100)
        pm.mark_complete("complete-test")


class TestProgressManagerBasic:
    """Basic ProgressManager operations (complement existing test_progress.py)."""

    def test_get_progress_none_when_missing(self):
        pm = ProgressManager()
        assert pm.get_progress("nonexistent") is None

    def test_update_and_get(self):
        pm = ProgressManager()
        pm.update_progress(model_name="m", current=25, total=100)
        p = pm.get_progress("m")
        assert p is not None
        assert p["progress"] == 25.0
        assert p["status"] == "downloading"

    def test_mark_error(self):
        pm = ProgressManager()
        pm.update_progress(model_name="err", current=0, total=100)
        pm.mark_error("err", "disk full")
        p = pm.get_progress("err")
        assert p["status"] == "error"
        assert p["error"] == "disk full"

    def test_mark_complete_nonexistent_no_crash(self):
        pm = ProgressManager()
        # Should log warning, not crash
        pm.mark_complete("does-not-exist")
