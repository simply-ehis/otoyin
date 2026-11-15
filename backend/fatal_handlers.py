"""Process-level fatal handlers: faulthandler + exception hooks.

Installed once at import of ``backend.app`` so every entry point (frozen
``server.py``, ``uvicorn backend.main:app``, tests) gets the same safety
net. All handlers are best-effort and never raise — a broken crash handler
must not become a second crash.

What each piece catches:
- ``faulthandler``: native segfaults / hard hangs (SIGABRT dump). Python
  exception handlers never see these, so without this a fatal fault
  leaves zero diagnostics.
- ``sys.excepthook``: uncaught exceptions on the main thread (lifespan
  callbacks, uvicorn edge paths outside FastAPI's handler).
- ``threading.excepthook``: uncaught exceptions in worker threads
  (voice-changer pipeline, plugin subprocess watchers, download threads).
- ``sys.unraisablehook``: async-GC and destructor failures (e.g. Event
  loop GC of a failed task) that otherwise print to stderr and vanish.
"""

from __future__ import annotations

import contextlib
import logging
import sys
import threading

logger = logging.getLogger(__name__)

_installed = False


def _fatal_log_path():
    """Best-effort path for the faulthandler dump file (None = stderr)."""
    try:
        from . import config

        log_dir = config.get_data_dir() / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)
        return str(log_dir / "fatal.log")
    except Exception:
        logger.debug("suppressed exception in fatal_handlers.py:40", exc_info=True)
        return None


def _capture_uncaught(exc_type, exc_value, exc_tb, *, origin: str) -> None:
    """Log + locally record an otherwise-fatal exception. Never raises."""
    with contextlib.suppress(Exception):
        logger.critical("Uncaught %s exception", origin, exc_info=(exc_type, exc_value, exc_tb))
    try:
        from .services import crash_reports

        crash_reports.capture_exception(
            exc_value if isinstance(exc_value, BaseException) else RuntimeError(str(exc_value)),
            context={"origin": origin},
        )
    except Exception:
        logger.debug("suppressed exception in fatal_handlers.py:55", exc_info=True)


def _excepthook(exc_type, exc_value, exc_tb) -> None:
    if issubclass(exc_type, KeyboardInterrupt):
        sys.__excepthook__(exc_type, exc_value, exc_tb)
        return
    _capture_uncaught(exc_type, exc_value, exc_tb, origin="main-thread")


def _threading_excepthook(args: threading.ExceptHookArgs) -> None:
    _capture_uncaught(args.exc_type, args.exc_value, args.exc_traceback, origin=f"thread:{args.thread.name}")


def _unraisablehook(unraisable) -> None:
    try:
        exc = unraisable.exc_value
    except Exception:
        logger.debug("suppressed exception in fatal_handlers.py:73", exc_info=True)
        return
    if exc is None:
        return
    _capture_uncaught(
        type(exc),
        exc,
        getattr(exc, "__traceback__", None),
        origin=f"unraisable:{unraisable.object!r}"[:120],
    )


def install_fatal_handlers() -> bool:
    """Install faulthandler + exception hooks. Idempotent. Returns success."""
    global _installed
    if _installed:
        return True
    _installed = True
    try:
        import faulthandler

        log_path = _fatal_log_path()
        if log_path is not None:
            try:
                _fatal_file = open(log_path, "a", encoding="utf-8")  # noqa: SIM115
                faulthandler.enable(file=_fatal_file)
                # Keep a reference so the file is not GC-closed.
                globals()["_fatal_file"] = _fatal_file
            except Exception:
                logger.debug("suppressed exception in fatal_handlers.py:101", exc_info=True)
                faulthandler.enable()
        else:
            faulthandler.enable()
    except Exception as e:
        logger.debug("faulthandler unavailable: %s", e)
        return False
    sys.excepthook = _excepthook
    threading.excepthook = _threading_excepthook
    with contextlib.suppress(AttributeError):
        sys.unraisablehook = _unraisablehook
    return True
