"""Shared GGUF-via-llama.cpp-server sidecar manager.

Both the planner LLM backend (:mod:`backend.backends.gguf_server_backend`)
and the Orpheus TTS backend (:mod:`backend.backends.orpheus_backend`) load
GGUF models through one native ``llama-server`` process. This module is the
single place that resolves the binary, spawns the sidecar, waits for it to
become healthy, and talks to it over the OpenAI-compatible HTTP API — so the
two backends never duplicate that logic and never import ``llama_cpp``.

The server binary is resolved in order: ``TWENTYLABS_LLAMA_SERVER`` env,
``data/models/llama-server.exe`` (bundled sidecar), then PATH. If absent,
starts fail with a clear ``load_error`` surfaced by ``GET /llm/status``.

Sidecar lifecycle is adopt-or-reap: before spawning, running llama-server
processes are scanned (via psutil). A healthy one already serving the same
model file and context size is adopted — including orphans whose parent
backend died — so a restart never pays the 25-40s cold load again and two
backends never fight over the same model. Orphans running a *different*
model are killed so abandoned sidecars can't pile up (~1.3GB each) and
starve the machine into crashing the active one.

Spawns are memory-frugal: KV caches are quantized (q8_0, half the f16 RAM)
and the server runs a single parallel slot — on a 2-core box concurrent
requests serialize anyway, and 4 concurrent KV allocations were the exact
pressure that crashed the sidecar. Both are overridable via env.

Adopted sidecars may be shared by several backends; a module-level owner
count decides who may kill on stop so one backend shutting down can never
yank the server out from under another mid-generation.
"""

from __future__ import annotations

import contextlib
import logging
import os
import shutil
import socket
import subprocess
import time
from pathlib import Path

import psutil
import requests

from ..utils.hidden_subprocess import popen_hidden

logger = logging.getLogger(__name__)

# Health-check deadline for the spawned server. Override with
# TWENTYLABS_LLAMA_STARTUP_TIMEOUT (seconds) for large models / slow disks.
# 60s was too tight on 3-4GB RAM boxes under memory pressure (observed 60-180s).
# Increased to 300s (5 min) to allow time for initial model download.
_SERVER_STARTUP_TIMEOUT_S = float(os.environ.get("TWENTYLABS_LLAMA_STARTUP_TIMEOUT", "300.0"))

# Read timeout for a single completion request against the sidecar. Override
# with TWENTYLABS_LLAMA_GEN_TIMEOUT (seconds) on slow hardware.
_GEN_TIMEOUT_S = float(os.environ.get("TWENTYLABS_LLAMA_GEN_TIMEOUT", "180.0"))

# KV-cache quantization (f16 -> q8_0 halves KV RAM) and parallel slots.
# Single-user box -> one slot: concurrent requests queue instead of
# allocating 4 full KV caches that can OOM the machine into a crash.
_KV_CACHE_TYPE = os.environ.get("TWENTYLABS_LLAMA_KV_CACHE_TYPE", "q8_0")
_PARALLEL_SLOTS = os.environ.get("TWENTYLABS_LLAMA_PARALLEL", "1")

# pid -> number of live owners. A sidecar is only killed by stop() when the
# last owner releases it, so a shared (adopted) server survives another
# backend's shutdown.
_OWNERS: dict[int, int] = {}


def _register_owner(pid: int) -> None:
    _OWNERS[pid] = _OWNERS.get(pid, 0) + 1


def _unregister_owner(pid: int) -> bool:
    """Release one owner; return True when the last owner must kill."""
    remaining = _OWNERS.get(pid, 0) - 1
    if remaining <= 0:
        _OWNERS.pop(pid, None)
        return True
    _OWNERS[pid] = remaining
    return False


# Loaded model id reported to the server (cosmetic; not used for routing).
_MODEL_ID = "local-gguf"


def _pick_free_port(preferred: int | None = None) -> int:
    """Return a free localhost TCP port for the sidecar.

    If ``preferred`` is given and free, it is returned so callers that want
    a stable port can keep it.  Otherwise an OS-assigned ephemeral port is
    used.  The socket is closed immediately — the caller must handle the
    TOCTOU race by retrying on EADDRINUSE (see :meth:`GGUFServerProcess.start`).
    """
    if preferred is not None:
        try:
            from ..utils.port import is_port_free

            if is_port_free("127.0.0.1", preferred):
                return preferred
        except OSError as e:
            logger.debug("Port check failed for %d: %s", preferred, e)
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _parse_server_args(cmdline: list[str]) -> tuple[str | None, int | None, int | None]:
    """Extract ``(model_path, port, n_ctx)`` from a llama-server command line."""
    model = None
    port = None
    n_ctx = None
    i = 0
    while i < len(cmdline):
        arg = cmdline[i]
        nxt = cmdline[i + 1] if i + 1 < len(cmdline) else None
        if arg in ("-m", "--model") and nxt:
            model = nxt
        elif arg == "--port" and nxt:
            port = int(nxt) if nxt.isdigit() else None
        elif arg in ("-c", "--ctx-size") and nxt:
            n_ctx = int(nxt) if nxt.isdigit() else None
        i += 1
    return model, port, n_ctx


def _find_running_servers() -> list[dict]:
    """List running llama-server processes with parsed args and parent liveness."""
    found: list[dict] = []
    for proc in psutil.process_iter(["pid", "ppid", "name", "cmdline"]):
        try:
            info = proc.info
            if "llama-server" not in (info.get("name") or "").lower():
                continue
            cmdline = info.get("cmdline") or []
            model, port, n_ctx = _parse_server_args(cmdline)
            if model is None:
                continue
            ppid = info.get("ppid") or 0
            found.append(
                {
                    "pid": info["pid"],
                    "parent_alive": ppid != 0 and psutil.pid_exists(ppid),
                    "model": model,
                    "port": port,
                    "n_ctx": n_ctx,
                }
            )
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return found


def _kill_pid(pid: int) -> None:
    """Force-kill a process by PID, ignoring already-gone races."""
    try:
        proc = psutil.Process(pid)
        proc.kill()
        proc.wait(timeout=5)
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        pass


def _server_is_healthy(port: int, timeout_s: float = 2.0) -> bool:
    """Poll GET /health on a candidate sidecar for a short grace period."""
    import urllib.error
    import urllib.request

    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1) as resp:
                if resp.status == 200:
                    return True
        except (urllib.error.URLError, OSError):
            pass
        time.sleep(0.25)
    return False


def _scan_for_adoption(model_path: str, n_ctx: int) -> dict | None:
    """Find a healthy sidecar already serving the same model; reap orphans.

    Returns a candidate dict (``pid``/``port``) to adopt, or ``None`` to spawn
    fresh. Sidecars for other models are left alone while their parent is
    alive (a live backend needs them); orphaned ones are killed.
    """
    for candidate in _find_running_servers():
        same_model = (
            candidate["model"] is not None
            and os.path.normcase(candidate["model"]) == os.path.normcase(model_path)
            and candidate["n_ctx"] == n_ctx
        )
        if same_model:
            if candidate["port"] and _server_is_healthy(candidate["port"]):
                return candidate
            if candidate["parent_alive"]:
                # Another live backend is still cold-loading this model —
                # wait for it instead of tearing it down or duplicating the
                # 25-40s load. If it never comes up, that backend's own
                # startup timeout kills it; we spawn fresh.
                if _server_is_healthy(candidate["port"], timeout_s=_SERVER_STARTUP_TIMEOUT_S):
                    return candidate
                continue
            # Stale orphan duplicate of the model we want — never leave it
            # around (its parent is gone, so nothing will clean it up).
            _kill_pid(candidate["pid"])
            continue
        if not candidate["parent_alive"]:
            logger.info(
                "Reaping orphaned llama-server (pid=%d, model=%s)",
                candidate["pid"],
                Path(candidate["model"]).name,
            )
            _kill_pid(candidate["pid"])
    return None


def find_llama_server() -> Path | None:
    """Resolve the llama.cpp server binary (env override, bundled sidecar, PATH)."""
    env_path = os.environ.get("TWENTYLABS_LLAMA_SERVER")
    if env_path and Path(env_path).exists():
        return Path(env_path)

    from ..config import get_models_dir

    bundled = get_models_dir() / ("llama-server.exe" if os.name == "nt" else "llama-server")
    if bundled.exists():
        return bundled

    exe = "llama-server.exe" if os.name == "nt" else "llama-server"
    found = shutil.which(exe)
    return Path(found) if found else None


class GGUFServerProcess:
    """Manages one ``llama-server`` sidecar loading a single GGUF model.

    spawn/health/HTTP all live here. Backends hold one instance and call
    :meth:`chat_completion` (planner) or :meth:`text_completion` (Orpheus).
    """

    def __init__(
        self,
        model_path: str | Path,
        *,
        n_ctx: int = 4096,
        n_gpu_layers: int = 0,
        port: int | None = None,
        kv_cache_type: str | None = None,
        moe_stream_cache_size: str | None = None,
        moe_stream_direct: bool = False,
        server_binary: str | Path | None = None,
    ):
        self.model_path = str(model_path)
        self.n_ctx = int(n_ctx)
        self.n_gpu_layers = int(n_gpu_layers)
        self._port = int(port) if port is not None else _pick_free_port()
        self.kv_cache_type = kv_cache_type or _KV_CACHE_TYPE
        self.moe_stream_cache_size = moe_stream_cache_size
        self.moe_stream_direct = moe_stream_direct
        self._server_binary = str(server_binary) if server_binary else None
        self._proc: subprocess.Popen | psutil.Process | None = None
        self.load_error: str | None = None

    @property
    def port(self) -> int:
        return self._port

    @property
    def is_alive(self) -> bool:
        if self._proc is None:
            return False
        try:
            if isinstance(self._proc, subprocess.Popen):
                return self._proc.poll() is None
            return self._proc.is_running()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return False

    def start(self) -> None:
        """Spawn the server sidecar and block until it is healthy."""
        server_path = None
        if self._server_binary:
            candidate = Path(self._server_binary)
            if candidate.exists():
                server_path = candidate
            else:
                logger.warning("Custom server binary not found at %s, falling back to default", candidate)
        if server_path is None:
            server_path = find_llama_server()
        if server_path is None:
            self.load_error = (
                "llama.cpp server binary not found. Download it into data/models/ "
                "(llama-server.exe) or set TWENTYLABS_LLAMA_SERVER."
            )
            raise FileNotFoundError(self.load_error)

        adopted = _scan_for_adoption(self.model_path, self.n_ctx)
        if adopted is not None:
            self._proc = psutil.Process(adopted["pid"])
            self._port = adopted["port"]
            self.load_error = None
            _register_owner(adopted["pid"])
            logger.info(
                "Adopted existing llama-server (pid=%d, port=%d) for %s",
                adopted["pid"],
                self._port,
                Path(self.model_path).name,
            )
            return

        # Retry on EADDRINUSE — two backends racing for the same ephemeral port
        # is rare but possible (TOCTOU after _pick_free_port).  Retry with a
        # fresh free port up to 3 times so one caller wins instead of both crashing.
        last_exc: Exception | None = None
        for attempt in range(3):
            cmd = [
                str(server_path),
                "--host",
                "127.0.0.1",
                "--port",
                str(self._port),
                "-m",
                self.model_path,
                "-c",
                str(self.n_ctx),
                "-ngl",
                str(self.n_gpu_layers),
                "--no-webui",
            ]
            # Optional Vulkan device selection, e.g. "0", "1", "cpu".
            device = os.environ.get("TWENTYLABS_LLAMA_DEVICE")
            if device:
                cmd += ["-dev", device]
            # Fit the context to available VRAM and let llama.cpp pick flash-attn
            # automatically. Models are memory-mapped (no --mlock) for fast cold
            # start. Quantize KV caches and use a single slot to cap RAM so
            # generation can't push the machine into an OOM crash.
            cmd += ["--fit", "on", "--flash-attn", "auto"]
            cmd += ["--cache-type-k", self.kv_cache_type, "--cache-type-v", self.kv_cache_type]
            cmd += ["--parallel", _PARALLEL_SLOTS]
            # MoE expert weight streaming (PR #25294).  When set, routed
            # expert weights are read from SSD via the OS page cache instead
            # of being mmap'd into RAM — critical for large MoE models
            # (30B+ params) that exceed available RAM.
            if self.moe_stream_cache_size:
                cmd += ["--moe-stream-cache", self.moe_stream_cache_size]
            if self.moe_stream_direct:
                cmd += ["--moe-stream-direct"]
            logger.info(
                "Spawning %s for %s (n_ctx=%d, ngl=%d, kv=%s, parallel=%s, moe_cache=%s, moe_direct=%s, port=%d) attempt %d/3",
                server_path.name,
                Path(self.model_path).name,
                self.n_ctx,
                self.n_gpu_layers,
                self.kv_cache_type,
                _PARALLEL_SLOTS,
                self.moe_stream_cache_size or "off",
                self.moe_stream_direct,
                self._port,
                attempt + 1,
            )
            try:
                self._proc = popen_hidden(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                _register_owner(self._proc.pid)
                self._wait_until_healthy()
                self.load_error = None
                logger.info("llama-server healthy (port=%d)", self._port)
                return
            except (OSError, RuntimeError) as exc:
                # Detect port collision: llama-server exits instantly with EADDRINUSE
                msg = str(exc).lower()
                is_port_collision = "address already in use" in msg or "addr already in use" in msg
                # Also check if proc died during health wait and port is busy
                if self._proc is not None and self._proc.poll() is not None:
                    # Peek at whether the port is now busy (another server won the race)
                    try:
                        from ..utils.port import is_port_free

                        if not is_port_free("127.0.0.1", self._port):
                            is_port_collision = True
                    except OSError as e:
                        logger.debug("Port collision check failed for %d: %s", self._port, e)
                if is_port_collision and attempt < 2:
                    logger.warning(
                        "Port %d busy — retrying with a new free port (attempt %d/3)", self._port, attempt + 1
                    )
                    if self._proc is not None:
                        with contextlib.suppress(Exception):
                            self._proc.kill()
                        _OWNERS.pop(self._proc.pid, None)
                        self._proc = None
                    self._port = _pick_free_port()
                    last_exc = exc
                    continue
                if self._proc is not None:
                    with contextlib.suppress(Exception):
                        self._proc.kill()
                    with contextlib.suppress(Exception):
                        _OWNERS.pop(self._proc.pid, None)
                    self._proc = None
                self.load_error = str(exc)
                logger.warning("llama-server start failed: %s", exc)
                if last_exc is not None and is_port_collision:
                    raise OSError(f"llama-server failed to bind port {self._port} after 3 attempts: {exc}") from exc
                raise
            except Exception as exc:
                if self._proc is not None:
                    with contextlib.suppress(Exception):
                        self._proc.kill()
                    _OWNERS.pop(self._proc.pid, None)
                    self._proc = None
                self.load_error = str(exc)
                logger.warning("llama-server start failed: %s", exc)
                raise

    def _wait_until_healthy(self) -> None:
        """Poll GET /health until the server responds or the deadline passes."""
        import urllib.error
        import urllib.request

        deadline = time.monotonic() + _SERVER_STARTUP_TIMEOUT_S
        while time.monotonic() < deadline:
            if self._proc is None or self._proc.poll() is not None:
                code = self._proc.poll() if self._proc is not None else None
                raise RuntimeError(f"llama-server exited during startup (code {code})")
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{self._port}/health", timeout=1) as resp:
                    if resp.status == 200:
                        return
            except (urllib.error.URLError, OSError):
                pass
            time.sleep(0.5)
        raise TimeoutError(f"llama-server did not become healthy within {_SERVER_STARTUP_TIMEOUT_S}s")

    def stop(self) -> None:
        """Release this owner; only the last owner terminates the sidecar."""
        if self._proc is None:
            return
        pid = getattr(self._proc, "pid", None)
        try:
            alive = self.is_alive
        except Exception:
            logger.debug("Failed to check llama-server liveness", exc_info=True)
            alive = False
        if not alive or pid is None:
            _OWNERS.pop(pid, None) if pid is not None else None
            self._proc = None
            return
        if _unregister_owner(pid):
            logger.info("Stopping llama-server (port=%d)", self._port)
            try:
                self._proc.terminate()
                if self._proc.wait(timeout=5) is None:
                    self._proc.kill()
            except subprocess.TimeoutExpired:
                self._proc.kill()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        else:
            logger.info(
                "llama-server (pid=%d) still owned by others; leaving it up",
                pid,
            )
        self._proc = None

    def chat_completion(
        self,
        messages: list[dict],
        *,
        max_tokens: int,
        temperature: float = 0.7,
        top_p: float = 0.9,
        repeat_penalty: float = 1.1,
        frequency_penalty: float = 0.0,
        presence_penalty: float = 0.0,
        timeout: float | None = None,
        grammar: str | None = None,
    ) -> dict:
        """OpenAI-style chat completion. Returns the ``message`` dict.

        ``grammar`` is an optional GBNF constraint (see
        :mod:`backend.routes.assistant_tools.grammar`). It is forwarded to the
        llama.cpp server; if the server rejects it the caller decides whether
        to retry without it.
        """
        payload = {
            "model": _MODEL_ID,
            "messages": messages,
            "max_tokens": int(max_tokens),
            "temperature": temperature,
            "top_p": top_p,
        }
        if repeat_penalty != 1.0:
            payload["repeat_penalty"] = repeat_penalty
        if frequency_penalty != 0.0:
            payload["frequency_penalty"] = frequency_penalty
        if presence_penalty != 0.0:
            payload["presence_penalty"] = presence_penalty
        if grammar:
            payload["grammar"] = grammar
        resp = requests.post(
            f"http://127.0.0.1:{self._port}/v1/chat/completions",
            json=payload,
            timeout=_GEN_TIMEOUT_S if timeout is None else timeout,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"llama-server returned {resp.status_code}: {resp.text[:300]}")
        data = resp.json()
        choices = data.get("choices", [])
        if not choices:
            raise RuntimeError("LLM returned empty choices (context overflow or safety filter)")
        return choices[0]

    def text_completion(
        self,
        prompt: str,
        *,
        max_tokens: int,
        temperature: float = 0.7,
        top_p: float = 0.9,
        repeat_penalty: float | None = None,
        seed: int | None = None,
        stop: list[str] | None = None,
        timeout: float | None = None,
    ) -> str:
        """OpenAI-style text completion. Returns the generated ``text``."""
        payload: dict = {
            "model": _MODEL_ID,
            "prompt": prompt,
            "max_tokens": int(max_tokens),
            "temperature": temperature,
            "top_p": top_p,
        }
        if repeat_penalty is not None:
            payload["repeat_penalty"] = repeat_penalty
        if seed is not None:
            payload["seed"] = seed
        if stop:
            payload["stop"] = stop
        resp = requests.post(
            f"http://127.0.0.1:{self._port}/v1/completions",
            json=payload,
            timeout=_GEN_TIMEOUT_S if timeout is None else timeout,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"llama-server returned {resp.status_code}: {resp.text[:300]}")
        data = resp.json()
        choices = data.get("choices", [])
        if not choices:
            raise RuntimeError("LLM returned empty choices (context overflow or safety filter)")
        return choices[0].get("text", "")
