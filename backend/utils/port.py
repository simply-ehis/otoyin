"""Port utilities — avoid EADDRINUSE crashes when models/services share a host.

All services in otoyin (main API on 17493, voice-changer on 17494, and the
ephemeral llama-server sidecars) run on localhost.  Without coordination two
callers that try to bind the same port at the same instant crash with
``OSError: [Errno 98] Address already in use`` instead of a helpful message.

This module is the single chokepoint for port checks so every caller gets
the same friendly diagnostics and the same free-port discovery logic.
"""

from __future__ import annotations

import logging
import socket

logger = logging.getLogger(__name__)


def is_port_free(host: str, port: int) -> bool:
    """Return True if ``host:port`` can be bound right now.

    Strategy: try to ``connect`` first — if a server is listening the
    connect succeeds and the port is busy.  Otherwise try to ``bind``.
    On Windows ``SO_REUSEADDR`` must NOT be set or a busy port would still
    appear free.  We probe both ways so the result is correct on Unix and
    Windows regardless of TIME_WAIT vs LISTEN.
    """
    # Fast path: if something is listening, connect succeeds → busy
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.25)
        try:
            s.connect((host, port))
            return False  # connect succeeded → something is listening
        except (ConnectionRefusedError, TimeoutError, OSError):
            pass  # nothing listening, now try bind to catch non-listening binds
    # Fallback: try to bind without REUSEADDR — if it fails port is busy
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind((host, port))
            return True
        except OSError:
            return False


def find_free_port(host: str = "127.0.0.1", preferred: int | None = None) -> int:
    """Return a free port, trying ``preferred`` first then an OS-assigned one.

    If ``preferred`` is given and is free, it is returned as-is so callers
    that want a stable default (17493/17494) keep it.  Otherwise the OS picks
    a free ephemeral port via ``bind(0)``.  The socket is closed immediately
    — callers must handle the residual TOCTOU race by retrying on
    ``EADDRINUSE`` when they actually bind (see :func:`require_port_free`).
    """
    if preferred is not None and is_port_free(host, preferred):
        return preferred
    if preferred is not None:
        logger.warning("Port %d on %s is busy — picking an ephemeral free port", preferred, host)
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((host, 0))
        return s.getsockname()[1]


def require_port_free(host: str, port: int, *, label: str = "server") -> None:
    """Raise a helpful ``OSError`` if ``host:port`` is already in use.

    Import in ``main.py``/``server.py`` before ``uvicorn.run`` so the user
    sees a diagnostic with next steps instead of a raw traceback.

    Example::

        require_port_free("127.0.0.1", 17493, label="otoyin API")
        uvicorn.run(..., host="127.0.0.1", port=17493)
    """
    if is_port_free(host, port):
        return
    hint = (
        f"Port {port} on {host} is already in use ({label}). "
        f"Another otoyin instance or another app is listening there. "
        f"Close it (just kill / lsof -i :{port}) or run with a different port: "
        f"TWENTYLABS_PORT={port + 1} just dev  /  python -m backend.main --port {port + 1}"
    )
    raise OSError(hint)


def pick_free_port_with_retry(
    host: str = "127.0.0.1",
    preferred: int | None = None,
    attempts: int = 5,
) -> int:
    """Pick a free port with a short retry loop to survive TOCTOU races.

    Used by the GGUF sidecar which binds a moment after :func:`find_free_port`
    returns.  If the ephemeral port got snatched between the check and the
    bind, the caller will get ``EADDRINUSE``; this helper is not involved in
    that — instead, callers that bind should loop and call
    :func:`find_free_port` again on failure.  This wrapper simply re-probes a
    few times if the first ephemeral choice is unlucky.
    """
    last: int | None = None
    for _ in range(attempts):
        cand = find_free_port(host, preferred if last is None else None)
        if cand != last:
            return cand
        last = cand
    return cand  # last resort
