"""ACP client over a hidden coding-agent subprocess.

Otoyin is the *client* in Agent Client Protocol terms: it launches an ACP
agent (``opencode acp``, ``copilot --acp``, a codex-acp adapter, …) as a
child process with no console window and exchanges newline-delimited
JSON-RPC 2.0 on its stdin/stdout.

The reader thread routes messages three ways:

* responses  → resolve the matching pending future
* requests   → answer them (permission approval, unsupported methods)
* notifications → forward ``session/update`` to the caller's sink

Only the ACP v1 surface Otoyin needs is implemented: initialize,
session/new, session/load, session/prompt, session/cancel. File-system and
terminal capabilities are deliberately *not* advertised, so agents cannot
ask Otoyin to run shells or read files on its behalf.
"""

from __future__ import annotations

import contextlib
import json
import logging
import os
import subprocess
import threading
from collections.abc import Callable
from concurrent.futures import Future
from typing import Any

from ..utils.hidden_subprocess import popen_hidden, run_hidden

logger = logging.getLogger(__name__)

_INIT_TIMEOUT = 30
_SESSION_TIMEOUT = 30
_PROMPT_TIMEOUT = 900

UpdateSink = Callable[[dict[str, Any]], None]


class AcpProtocolError(RuntimeError):
    """The agent returned a JSON-RPC error or closed the pipe mid-request."""


class AcpSession:
    """One ACP child process, mirroring the spec's client lifecycle."""

    def __init__(
        self,
        argv: list[str],
        cwd: str,
        on_update: UpdateSink | None = None,
        auto_approve: bool = True,
    ) -> None:
        self.argv = argv
        self.cwd = cwd
        self.on_update = on_update
        self.auto_approve = auto_approve
        self.protocol_version: int | None = None
        self.capabilities: dict[str, Any] = {}
        self._proc: subprocess.Popen[str] | None = None
        self._reader: threading.Thread | None = None
        self._send_lock = threading.Lock()
        self._state_lock = threading.Lock()
        self._pending: dict[int, Future] = {}
        self._next_id = 0
        self._closed = False

    # -- lifecycle ---------------------------------------------------------

    def start(self) -> None:
        """Spawn the hidden agent and complete ACP initialization."""
        self._proc = popen_hidden(
            self.argv,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            # An agent that logs heavily would block on an unread stderr
            # pipe; protocol traffic never goes there, so discard it.
            stderr=subprocess.DEVNULL,
            cwd=self.cwd,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )
        self._reader = threading.Thread(target=self._read_loop, daemon=True, name="acp-reader")
        self._reader.start()
        result = self._request(
            "initialize",
            {
                "protocolVersion": 1,
                "clientCapabilities": {},
                "clientInfo": {"name": "otoyin", "title": "Otoyin", "version": "0.5.0"},
            },
            _INIT_TIMEOUT,
        )
        self.protocol_version = result.get("protocolVersion")
        self.capabilities = result.get("agentCapabilities") or {}
        if self.protocol_version != 1:
            raise AcpProtocolError(f"Unsupported ACP protocol version: {self.protocol_version}")

    def close(self) -> None:
        """Terminate the agent and its descendants, then release the pipes."""
        with self._state_lock:
            if self._closed:
                return
            self._closed = True
            proc = self._proc
            self._proc = None
        for future in list(self._pending.values()):
            if not future.done():
                future.set_exception(AcpProtocolError("ACP session closed"))
        self._pending.clear()
        if proc is None:
            return
        if proc.poll() is None:
            self._kill_tree(proc.pid)
        for stream in (proc.stdin, proc.stdout):
            if stream is not None:
                with contextlib.suppress(OSError):
                    stream.close()

    @staticmethod
    def _kill_tree(pid: int) -> None:
        """Kill a Windows process *and its children* (agents spawn helpers)."""
        if os.name == "nt":  # pragma: no cover - platform branch
            try:
                run_hidden(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True, timeout=10)
                return
            except (OSError, subprocess.SubprocessError):
                pass
        with contextlib.suppress(OSError, subprocess.SubprocessError):
            subprocess.run(["kill", "-TERM", str(pid)], capture_output=True, timeout=5)

    # -- wire --------------------------------------------------------------

    def _send(self, message: dict[str, Any]) -> None:
        proc = self._proc
        if proc is None or proc.stdin is None:
            raise AcpProtocolError("ACP agent is not running")
        try:
            with self._send_lock:
                proc.stdin.write(json.dumps(message, ensure_ascii=False) + "\n")
                proc.stdin.flush()
        except (BrokenPipeError, OSError) as exc:
            raise AcpProtocolError("ACP agent closed its input") from exc

    def _request(self, method: str, params: dict[str, Any], timeout: int) -> dict[str, Any]:
        with self._state_lock:
            request_id = self._next_id
            self._next_id += 1
            future: Future = Future()
            self._pending[request_id] = future
        try:
            self._send({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params})
            return future.result(timeout=timeout)
        finally:
            with self._state_lock:
                self._pending.pop(request_id, None)

    def _notify(self, method: str, params: dict[str, Any]) -> None:
        self._send({"jsonrpc": "2.0", "method": method, "params": params})

    def _read_loop(self) -> None:
        proc = self._proc
        if proc is None or proc.stdout is None:
            return
        try:
            for line in proc.stdout:
                line = line.strip()
                if not line:
                    continue
                try:
                    message = json.loads(line)
                except json.JSONDecodeError:
                    logger.debug("Ignored non-JSON ACP line: %s", line[:200])
                    continue
                self._dispatch(message)
        except (OSError, ValueError):
            logger.debug("ACP reader stopped", exc_info=True)
        finally:
            self.close()

    def _dispatch(self, message: dict[str, Any]) -> None:
        has_id = "id" in message
        method = message.get("method")
        if has_id and method:
            self._handle_request(message)
        elif has_id:
            self._resolve(message)
        elif method == "session/update" and self.on_update:
            params = message.get("params") or {}
            try:
                self.on_update(params)
            except Exception:
                logger.debug("ACP update sink raised", exc_info=True)

    def _resolve(self, message: dict[str, Any]) -> None:
        with self._state_lock:
            future = self._pending.pop(message["id"], None)
        if future is None or future.done():
            return
        error = message.get("error")
        if error:
            detail = error.get("message") if isinstance(error, dict) else str(error)
            future.set_exception(AcpProtocolError(str(detail)))
        else:
            future.set_result(message.get("result") or {})

    def _handle_request(self, message: dict[str, Any]) -> None:
        """Answer requests the agent sends back to us."""
        method = message.get("method")
        request_id = message["id"]
        if method == "session/request_permission":
            result = self._permission_result(message.get("params") or {})
        else:
            # We advertise no fs/terminal capabilities; reject cleanly
            # instead of silently ignoring (which would hang the agent).
            result = None
            self._send(
                {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "error": {"code": -32601, "message": f"Unsupported client method: {method}"},
                }
            )
            return
        self._send({"jsonrpc": "2.0", "id": request_id, "result": result})

    def _permission_result(self, params: dict[str, Any]) -> dict[str, Any]:
        """Auto-approve or auto-deny a tool permission request."""
        outcome = "cancelled"
        if self.auto_approve:
            for option in params.get("options") or []:
                kind = str(option.get("kind", ""))
                if kind.startswith("allow"):
                    outcome = {"outcome": "selected", "optionId": option.get("optionId")}
                    break
        return {"outcome": outcome}

    # -- session operations ------------------------------------------------

    def new_session(self, cwd: str) -> str:
        """Create an ACP session and return its opaque session id."""
        result = self._request(
            "session/new",
            {"cwd": cwd, "mcpServers": []},
            _SESSION_TIMEOUT,
        )
        session_id = result.get("sessionId")
        if not session_id:
            raise AcpProtocolError("session/new returned no sessionId")
        return str(session_id)

    def load_session(self, session_id: str, cwd: str) -> None:
        """Replay a previous session when the agent supports session/load."""
        if not self.capabilities.get("loadSession"):
            raise AcpProtocolError("Agent does not support session/load")
        self._request(
            "session/load",
            {"sessionId": session_id, "cwd": cwd, "mcpServers": []},
            _SESSION_TIMEOUT,
        )

    def prompt(self, session_id: str, text: str) -> str:
        """Send a text prompt and return the stop reason when the turn ends."""
        result = self._request(
            "session/prompt",
            {"sessionId": session_id, "prompt": [{"type": "text", "text": text}]},
            _PROMPT_TIMEOUT,
        )
        return str(result.get("stopReason", "end_turn"))

    def cancel(self, session_id: str) -> None:
        """Cancel the in-flight prompt turn."""
        self._notify("session/cancel", {"sessionId": session_id})

    @property
    def alive(self) -> bool:
        return self._proc is not None and self._proc.poll() is None


# Live sessions, keyed by Otoyin conversation id. Conversations persist in
# SQLite; this registry only holds the in-memory child-process handles.
_registry: dict[str, AcpSession] = {}
_registry_lock = threading.Lock()


def register(conversation_id: str, session: AcpSession) -> None:
    """Track a live ACP session for a conversation."""
    with _registry_lock:
        _registry[conversation_id] = session


def get(conversation_id: str) -> AcpSession | None:
    """Return the live ACP session for a conversation, if any."""
    with _registry_lock:
        return _registry.get(conversation_id)


def unregister(conversation_id: str) -> AcpSession | None:
    """Stop tracking (and return) a live session."""
    with _registry_lock:
        return _registry.pop(conversation_id, None)


def close_all() -> None:
    """Close every live session — called on app shutdown."""
    with _registry_lock:
        sessions = list(_registry.values())
        _registry.clear()
    for session in sessions:
        session.close()
