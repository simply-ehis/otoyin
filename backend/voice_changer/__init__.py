"""Headless voice-changer service for otoyin.

Standalone lightweight process that converts voice in real-time:
  mic → Silero VAD → DeepFilterNet → Whisper → kokoro TTS → LavaSR → out

Run standalone:  python -m backend.voice_changer
Run from app:    spawned as subprocess, controlled via WebSocket

Protocol: OpenAI Realtime API compatible.
"""

import logging
import os
import subprocess
import sys
from typing import Optional

from ..utils.hidden_subprocess import popen_hidden, run_hidden

logger = logging.getLogger(__name__)

# Module-level reference to the spawned subprocess (if any)
_vc_process: subprocess.Popen | None = None
_vc_port: int | None = None
_vc_host: str | None = None


def get_voice_changer_port() -> int | None:
    """Return the port the spawned voice-changer is listening on, or None."""
    return _vc_port if is_voice_changer_running() else None


def spawn_voice_changer(port: int = 17494, host: str = "127.0.0.1") -> subprocess.Popen | None:
    """Spawn the voice-changer service as a subprocess.

    If ``port`` is busy, automatically picks the next free port so a
    port conflict never crashes the caller.  Returns the Popen object,
    or None if already running / spawn failed.
    """
    global _vc_process, _vc_port, _vc_host

    # Don't double-spawn
    if _vc_process and _vc_process.poll() is None:
        logger.debug("Voice-changer already running (pid=%d) on %s:%d", _vc_process.pid, _vc_host, _vc_port)
        return _vc_process

    # Resolve port conflicts up-front so the child doesn't crash on EADDRINUSE.
    # Prefer the requested port, but fall back to an ephemeral one so models
    # don't fight over 17494 when the user restarts quickly.
    try:
        from ..utils.port import find_free_port

        free = find_free_port(host, preferred=port)
        if free != port:
            logger.warning(
                "Voice-changer port %d busy — using %d instead (set voice_changer_port to pin)",
                port,
                free,
            )
            port = free
    except Exception:
        logger.debug("Port pre-scan failed; using requested port", exc_info=True)  # child reports bind errors

    try:
        python = sys.executable
        cmd = [python, "-m", "backend.voice_changer", "--host", host, "--port", str(port)]
        _vc_process = popen_hidden(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")),
        )
        _vc_port = port
        _vc_host = host
        # Give the child a moment to fail on EADDRINUSE so we can report it now
        # instead of leaving a zombie that the health check later calls "not running".
        try:
            # 0.5s is enough for the child to bind or die; don't block the API thread.
            import time as _time

            _time.sleep(0.5)
            if _vc_process.poll() is not None:
                # Child already exited — read stderr for the real reason
                try:
                    _, err = _vc_process.communicate(timeout=1)
                    msg = err.decode(errors="ignore")[:500] if err else "unknown"
                except Exception:
                    logger.debug("Could not read voice-changer stderr", exc_info=True)
                    msg = "unknown"
                logger.warning("Voice-changer failed to start on %s:%d: %s", host, port, msg)
                _vc_process = None
                _vc_port = None
                _vc_host = None
                return None
        except Exception:
            logger.debug("Post-spawn health peek failed", exc_info=True)
        logger.info("Spawned voice-changer (pid=%d) on %s:%d", _vc_process.pid, host, port)
        return _vc_process
    except Exception as exc:
        logger.warning("Failed to spawn voice-changer: %s", exc)
        _vc_process = None
        _vc_port = None
        _vc_host = None
        return None


def is_voice_changer_running() -> bool:
    """Return True if the spawned subprocess is still alive."""
    return _vc_process is not None and _vc_process.poll() is None


def kill_voice_changer() -> None:
    """Terminate the voice-changer subprocess if running."""
    global _vc_process, _vc_port, _vc_host
    if _vc_process and _vc_process.poll() is None:
        logger.info("Killing voice-changer (pid=%d)", _vc_process.pid)
        _vc_process.terminate()
        try:
            _vc_process.wait(timeout=5)
        except Exception:
            logger.debug("Voice-changer terminate timed out; killing", exc_info=True)
            _vc_process.kill()
    _vc_process = None
    _vc_port = None
    _vc_host = None
