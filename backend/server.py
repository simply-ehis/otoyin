"""
Entry point for PyInstaller-bundled otoyin server.

This module provides an entry point that works with PyInstaller by using
absolute imports instead of relative imports.
"""

import logging
import os
import sys


# On Windows with --noconsole (PyInstaller), sys.stdout/stderr are None.
# They can also be broken file objects in some edge cases.
# Redirect to devnull to prevent crashes from print()/tqdm/logging.
def _is_writable(stream):
    """Check if a stream is usable for writing."""
    if stream is None:
        return False
    try:
        stream.write("")
        return True
    except Exception:
        logger.debug("suppressed exception in server.py:23", exc_info=True)
        return False


if not _is_writable(sys.stdout):
    # Keep the handle open for the program lifetime (redirected to /dev/null).
    sys.stdout = open(os.devnull, "w")
if not _is_writable(sys.stderr):
    # Keep the handle open for the program lifetime (redirected to /dev/null).
    sys.stderr = open(os.devnull, "w")

# PyInstaller + multiprocessing: child processes re-execute the frozen binary
# with internal arguments. freeze_support() handles this and exits early.
import contextlib
import multiprocessing

multiprocessing.freeze_support()

# In frozen builds, piper_phonemize's espeak-ng C library falls back to
# /usr/share/espeak-ng-data/ which doesn't exist.  Point it at the bundled
# data directory instead.
if getattr(sys, "frozen", False):
    _meipass = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
    _espeak_data = os.path.join(_meipass, "piper_phonemize", "espeak-ng-data")
    if os.path.isdir(_espeak_data):
        os.environ.setdefault("ESPEAK_DATA_PATH", _espeak_data)

# Fast path: handle --version before any heavy imports so the Rust
# version check doesn't block for 30+ seconds loading torch etc.
if "--version" in sys.argv:
    from backend import __version__

    print(f"otoyin-server {__version__}")
    sys.exit(0)


# Set up logging FIRST, before any imports that might fail
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    stream=sys.stderr,  # Log to stderr so it's captured by Tauri
)
logger = logging.getLogger(__name__)

# Log startup immediately to confirm binary execution
logger.info("=" * 60)
logger.info("otoyin-server starting up...")
logger.info(f"Python version: {sys.version}")
logger.info(f"Executable: {sys.executable}")
logger.info(f"Arguments: {sys.argv}")
logger.info("=" * 60)

try:
    logger.info("Importing argparse...")
    import argparse

    logger.info("Importing uvicorn...")
    import uvicorn

    logger.info("Standard library imports successful")

    # Import the FastAPI app from the backend package
    logger.info("Importing backend.config...")
    from backend import config

    logger.info("Importing backend.database...")
    from backend import database

    logger.info("Importing backend.main (this may take a while due to torch/transformers)...")
    from backend.main import app

    logger.info("Backend imports successful")
except Exception as e:
    logger.error(f"Failed to import required modules: {e}", exc_info=True)
    sys.exit(1)

_watchdog_disabled = False


def disable_watchdog():
    """Disable the parent watchdog so the server keeps running after parent exits."""
    global _watchdog_disabled
    _watchdog_disabled = True
    # Ignore SIGHUP so the server survives when the parent Tauri process exits.
    # On Unix, child processes receive SIGHUP when the parent's session leader
    # exits, which would kill the server even though we want it to persist.
    if sys.platform != "win32":
        import signal

        signal.signal(signal.SIGHUP, signal.SIG_IGN)


def _start_parent_watchdog(parent_pid, data_dir=None):
    """Monitor parent process and exit if it dies.

    This is the clean shutdown mechanism: instead of the Tauri app trying to
    forcefully kill the server (which spawns console windows on Windows),
    the server monitors its parent and shuts itself down gracefully.

    The Tauri app writes a .keep-running sentinel file to data_dir before
    exiting when "remain running after close" is enabled. This is a reliable
    fallback for the HTTP /watchdog/disable request, which can race with
    process exit on Windows.
    """
    import os
    import threading
    import time

    # Set up a file logger so we can debug in production
    watchdog_logger = logging.getLogger("watchdog")
    if data_dir:
        try:
            log_dir = os.path.join(data_dir, "logs")
            os.makedirs(log_dir, exist_ok=True)
            fh = logging.FileHandler(os.path.join(log_dir, "watchdog.log"))
            fh.setFormatter(logging.Formatter("%(asctime)s - %(message)s"))
            watchdog_logger.addHandler(fh)
        except Exception as e:
            logging.debug("Failed to set up watchdog log handler: %s", e)
    watchdog_logger.setLevel(logging.INFO)

    def _is_pid_alive(pid):
        """Check if a process with the given PID exists (cross-platform)."""
        try:
            if sys.platform == "win32":
                import ctypes

                kernel32 = ctypes.windll.kernel32
                PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
                handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
                if handle:
                    # Check if process has actually exited
                    STILL_ACTIVE = 259
                    exit_code = ctypes.c_ulong()
                    result = kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code))
                    kernel32.CloseHandle(handle)
                    if result and exit_code.value == STILL_ACTIVE:
                        return True
                    watchdog_logger.info(f"PID {pid}: exited with code {exit_code.value}")
                    return False
                # OpenProcess failed — check if it's an access error (process exists
                # but we can't open it) vs process not found
                error = ctypes.GetLastError()
                ACCESS_DENIED = 5
                if error == ACCESS_DENIED:
                    return True  # process exists, we just can't open it
                watchdog_logger.info(f"PID {pid}: OpenProcess failed, error={error}")
                return False
            os.kill(pid, 0)
            return True
        except (OSError, PermissionError):
            return False

    def _watch():
        watchdog_logger.info(f"Parent watchdog started, monitoring PID {parent_pid}, server PID {os.getpid()}")
        # Verify parent is alive before starting the loop
        alive = _is_pid_alive(parent_pid)
        watchdog_logger.info(f"Parent PID {parent_pid} initial check: alive={alive}")
        if not alive:
            watchdog_logger.warning(f"Parent PID {parent_pid} not found on first check — disabling watchdog")
            return
        # Clear any stale .keep-running sentinel from a previous session. The
        # sentinel is only removed by the watchdog when it's consumed during a
        # grace period; if the HTTP /watchdog/disable path wins the race on a
        # "keep running" exit, the sentinel is left on disk. Wipe it here so a
        # future session can't inherit that stale signal.
        if data_dir:
            stale = os.path.join(data_dir, ".keep-running")
            if os.path.exists(stale):
                try:
                    os.remove(stale)
                    watchdog_logger.info("Removed stale .keep-running sentinel from previous session")
                except OSError as e:
                    watchdog_logger.warning(f"Failed to remove stale sentinel: {e}")
        while True:
            if _watchdog_disabled:
                watchdog_logger.info("Watchdog disabled (keep server running), stopping monitor")
                return
            if not _is_pid_alive(parent_pid):
                # Parent is gone. Before shutting down, give the app a moment
                # to send /watchdog/disable — there is a race where the Tauri
                # RunEvent::Exit handler sends the disable request while we are
                # mid-iteration (already past the _watchdog_disabled check above).
                watchdog_logger.info(f"Parent process {parent_pid} gone, waiting for possible disable request...")
                time.sleep(1)
                if _watchdog_disabled:
                    watchdog_logger.info("Watchdog was disabled during grace period, keeping server alive")
                    return
                # Check for sentinel file written by Tauri before exit.
                # This catches the case where the HTTP disable request
                # didn't arrive before the parent process died (common
                # on Windows where process teardown is fast).
                sentinel = os.path.join(data_dir, ".keep-running") if data_dir else None
                if sentinel and os.path.exists(sentinel):
                    watchdog_logger.info("Found .keep-running sentinel file, keeping server alive")
                    with contextlib.suppress(OSError):
                        os.remove(sentinel)
                    return
                watchdog_logger.info("Watchdog still enabled after grace period, shutting down server...")
                # Cross-platform graceful exit: runs _run_shutdown() to
                # unload models, stop lifecycle scheduler, kill voice-changer,
                # then exits cleanly. Works on Windows (no os._exit).
                try:
                    from backend.app import graceful_exit

                    graceful_exit()
                except Exception as exc:
                    watchdog_logger.warning("graceful_exit failed: %s", exc)
                    os._exit(0)  # last resort — process is unrecoverable
                return
            time.sleep(2)

    t = threading.Thread(target=_watch, daemon=True)
    t.start()


if __name__ == "__main__":
    try:
        parser = argparse.ArgumentParser(description="otoyin backend server")
        parser.add_argument(
            "--host",
            type=str,
            default=os.environ.get("OTOYIN_HOST") or os.environ.get("TWENTYLABS_HOST", "127.0.0.1"),
            help="Host to bind to (use 0.0.0.0 for remote access)",
        )
        parser.add_argument(
            "--port",
            type=int,
            default=int(os.environ.get("OTOYIN_PORT") or os.environ.get("TWENTYLABS_PORT", "17493")),
            help="Port to bind to",
        )
        parser.add_argument(
            "--data-dir",
            type=str,
            default=None,
            help="Data directory for database, profiles, and generated audio",
        )
        parser.add_argument(
            "--remote",
            action="store_true",
            help="Enable remote access (binds 0.0.0.0 with bearer token auth)",
        )
        parser.add_argument(
            "--parent-pid",
            type=int,
            default=None,
            help="PID of parent process to monitor; server exits when parent dies",
        )
        parser.add_argument(
            "--version",
            action="store_true",
            help="Print version and exit (handled above, kept for argparse help)",
        )
        args = parser.parse_args()

        if args.parent_pid is not None and args.parent_pid <= 0:
            parser.error("--parent-pid must be a positive integer")

        # Detect backend variant from binary name
        # otoyin-server-cuda → sets TWENTYLABS_BACKEND_VARIANT=cuda
        binary_name = os.path.basename(sys.executable).lower()
        if "cuda" in binary_name:
            os.environ["TWENTYLABS_BACKEND_VARIANT"] = "cuda"
            logger.info("Backend variant: CUDA")
        else:
            os.environ["TWENTYLABS_BACKEND_VARIANT"] = "cpu"
            logger.info("Backend variant: CPU")

        # Register parent watchdog to start after server is fully ready
        if args.parent_pid is not None:
            _parent_pid = args.parent_pid
            _data_dir = args.data_dir

            @app.on_event("startup")
            async def _on_startup():
                _start_parent_watchdog(_parent_pid, _data_dir)

        logger.info(f"Parsed arguments: host={args.host}, port={args.port}, data_dir={args.data_dir}")

        # Remote mode: enforce bearer token authentication
        if args.remote:
            import hmac
            import secrets
            from typing import ClassVar

            import starlette.middleware.base
            import starlette.responses

            _remote_token = secrets.token_urlsafe(32)

            class RemoteAuthMiddleware(starlette.middleware.base.BaseHTTPMiddleware):
                """Require Bearer token for all requests in remote mode."""

                # NOTE: no "/" here — prefix matching turns it into
                # startswith("/") which exempts EVERY path and silently
                # disables bearer auth for the whole API in remote mode.
                EXEMPT_PATHS: ClassVar[tuple[str, ...]] = ("/health", "/docs", "/openapi.json")

                @classmethod
                def _is_exempt(cls, path: str) -> bool:
                    # Prefix match so /health/ready and /health/models are also
                    # exempt (exact match left them token-gated).
                    return any(path == p or path.startswith(p.rstrip("/") + "/") for p in cls.EXEMPT_PATHS)

                async def dispatch(self, request, call_next):
                    if self._is_exempt(request.url.path):
                        return await call_next(request)
                    auth = request.headers.get("Authorization", "")
                    if not hmac.compare_digest(auth.encode("utf-8"), f"Bearer {_remote_token}".encode()):
                        return starlette.responses.JSONResponse(
                            status_code=401,
                            content={"detail": "Missing or invalid bearer token"},
                        )
                    return await call_next(request)

            app.add_middleware(RemoteAuthMiddleware)
            # Override host to listen on all interfaces
            args.host = "0.0.0.0"
            logger.warning("=" * 60)
            logger.warning("REMOTE MODE ENABLED — Bearer token required")
            logger.warning("Token printed to stdout below — copy it now")
            logger.warning("Use: Authorization: Bearer <token>")
            logger.warning("=" * 60)
            # Print to stdout only (not stderr, not logs) so the user can copy it.
            # Never log the token — logs get shipped to aggregation systems.
            print(f"\n{'=' * 60}", flush=True)
            print(f"  REMOTE ACCESS TOKEN: {_remote_token}", flush=True)
            print(f"  Use header: Authorization: Bearer {_remote_token}", flush=True)
            print(f"{'=' * 60}\n", flush=True)

        # Set data directory if provided
        if args.data_dir:
            logger.info(f"Setting data directory to: {args.data_dir}")
            config.set_data_dir(args.data_dir)

        # Initialize database after data directory is set
        logger.info("Initializing database...")
        database.init_db()
        logger.info("Database initialized successfully")

        logger.info(f"Starting uvicorn server on {args.host}:{args.port}...")
        # Friendly port-in-use check before uvicorn's raw traceback
        try:
            from backend.utils.port import require_port_free

            require_port_free(args.host, args.port, label="otoyin API")
        except OSError as e:
            print(f"\n{e}\n", file=sys.stderr)
            sys.exit(1)
        # Use Server directly so we can store a reference for graceful_exit().
        # On Windows, graceful_exit() sets server.should_exit = True to
        # trigger uvicorn's clean shutdown path (no SIGTERM support on Win32).
        config = uvicorn.Config(
            app,
            host=args.host,
            port=args.port,
            log_level="info",
        )
        server = uvicorn.Server(config)
        try:
            from backend.app import _set_uvicorn_server

            _set_uvicorn_server(server)
        except ImportError:
            pass  # running as standalone module
        try:
            server.run()
        except OSError as e:
            if "Address already in use" in str(e) or "address already in use" in str(e).lower():
                print(
                    f"\nPort {args.port} on {args.host} is already in use. "
                    f"Close the other process (just kill / netstat -ano | findstr {args.port}) "
                    f"or use a different port: --port {args.port + 1}\n",
                    file=sys.stderr,
                )
                sys.exit(1)
            raise
    except SystemExit:
        raise
    except Exception as e:
        logger.error(f"Server startup failed: {e}", exc_info=True)
        sys.exit(1)
