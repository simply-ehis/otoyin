"""
Unit tests for the llama-server sidecar lifecycle (adopt-or-reap).

Covers the pure parsing + scan logic without spawning real sidecars:
``_parse_server_args``, ``_find_running_servers`` (psutil monkeypatched),
and ``_scan_for_adoption`` (adopt same-model healthy, kill stale duplicates
and orphans running other models, leave live foreign sidecars alone).

Run:  python -m pytest backend/tests/test_gguf_runner.py
"""

import os
from types import SimpleNamespace

from backend.backends import gguf_runner

MODEL_A = os.path.join("C:", "models", "Qwen.gguf")
MODEL_B = os.path.join("C:", "models", "Other.gguf")


def fake_procs(fake: list[dict]) -> list[SimpleNamespace]:
    """Wrap psutil-style ``info`` dicts so ``proc.info`` works in the scanner."""
    return [SimpleNamespace(info=item) for item in fake]


def test_parse_server_args_full():
    cmdline = [
        "llama-server.exe",
        "--host",
        "127.0.0.1",
        "--port",
        "65025",
        "-m",
        MODEL_A,
        "-c",
        "4096",
        "--no-webui",
    ]
    assert gguf_runner._parse_server_args(cmdline) == (MODEL_A, 65025, 4096)


def test_parse_server_args_long_flags_and_missing_values():
    cmdline = ["llama-server", "--model", MODEL_B, "--ctx-size", "8192"]
    assert gguf_runner._parse_server_args(cmdline) == (MODEL_B, None, 8192)
    assert gguf_runner._parse_server_args(["--port"]) == (None, None, None)
    assert gguf_runner._parse_server_args(["-m", MODEL_A, "-c", "abc"]) == (
        MODEL_A,
        None,
        None,
    )


def test_find_running_servers_filters_and_flags_orphans(monkeypatch):
    fake = [
        {
            "pid": 1,
            "ppid": 999,
            "name": "llama-server.exe",
            "cmdline": ["llama-server.exe", "--port", "65025", "-m", MODEL_A, "-c", "4096"],
        },
        {
            "pid": 2,
            "ppid": 0,
            "name": "llama-server",
            "cmdline": ["llama-server", "-m", MODEL_B],
        },
        {"pid": 3, "ppid": 1, "name": "python.exe", "cmdline": ["python"]},
        {
            "pid": 4,
            "ppid": 7,
            "name": "llama-server.exe",
            "cmdline": ["llama-server.exe", "--port", "1", "-m", MODEL_A, "-c", "4096"],
        },
        {"pid": 5, "ppid": 8, "name": "llama-server.exe", "cmdline": ["llama-server.exe"]},
    ]
    monkeypatch.setattr(gguf_runner.psutil, "process_iter", lambda attrs: fake_procs(fake))
    monkeypatch.setattr(
        gguf_runner.psutil,
        "pid_exists",
        lambda pid: pid == 999,  # only pid 999 is a live parent
    )

    found = gguf_runner._find_running_servers()

    assert [f["pid"] for f in found] == [1, 2, 4]
    by_pid = {f["pid"]: f for f in found}
    assert by_pid[1]["parent_alive"] is True
    assert by_pid[1]["port"] == 65025
    assert by_pid[2]["parent_alive"] is False  # ppid 0 is never a live parent
    assert by_pid[4]["parent_alive"] is False  # parent 7 dead
    assert by_pid[4]["n_ctx"] == 4096


def test_scan_adopts_same_model_healthy(monkeypatch):
    candidates = [{"pid": 11, "parent_alive": False, "model": MODEL_A, "port": 6001, "n_ctx": 4096}]
    killed: list[int] = []
    monkeypatch.setattr(gguf_runner, "_find_running_servers", lambda: candidates)
    monkeypatch.setattr(gguf_runner, "_server_is_healthy", lambda port, timeout_s=2.0: True)
    monkeypatch.setattr(gguf_runner, "_kill_pid", lambda pid: killed.append(pid))

    adopted = gguf_runner._scan_for_adoption(MODEL_A, 4096)

    assert adopted == candidates[0]
    assert killed == []


def test_scan_kills_stale_duplicate_then_adopts_other(monkeypatch):
    candidates = [
        # Unhealthy duplicate of our model -> killed, continue scanning.
        {"pid": 21, "parent_alive": False, "model": MODEL_A, "port": 6001, "n_ctx": 4096},
        # Healthy match on another port -> adopted.
        {"pid": 22, "parent_alive": True, "model": MODEL_A, "port": 6002, "n_ctx": 4096},
    ]
    killed: list[int] = []
    monkeypatch.setattr(
        gguf_runner,
        "_find_running_servers",
        lambda: [candidates[0]],
    )
    monkeypatch.setattr(gguf_runner, "_server_is_healthy", lambda port, timeout_s=2.0: False)
    monkeypatch.setattr(gguf_runner, "_kill_pid", lambda pid: killed.append(pid))

    assert gguf_runner._scan_for_adoption(MODEL_A, 4096) is None
    assert killed == [21]

    monkeypatch.setattr(gguf_runner, "_find_running_servers", lambda: [candidates[1]])
    monkeypatch.setattr(gguf_runner, "_server_is_healthy", lambda port, timeout_s=2.0: True)

    assert gguf_runner._scan_for_adoption(MODEL_A, 4096) == candidates[1]
    assert killed == [21]


def test_scan_reaps_orphan_other_model_leaves_live_foreign(monkeypatch):
    candidates = [
        # Orphan running a different model -> reaped.
        {"pid": 31, "parent_alive": False, "model": MODEL_B, "port": 6101, "n_ctx": 4096},
        # Live parent running a different model -> untouched.
        {"pid": 32, "parent_alive": True, "model": MODEL_B, "port": 6102, "n_ctx": 4096},
        # Same model but wrong context -> orphan, reaped.
        {"pid": 33, "parent_alive": False, "model": MODEL_A, "port": 6103, "n_ctx": 8192},
    ]
    killed: list[int] = []
    monkeypatch.setattr(gguf_runner, "_find_running_servers", lambda: candidates)
    monkeypatch.setattr(gguf_runner, "_kill_pid", lambda pid: killed.append(pid))

    assert gguf_runner._scan_for_adoption(MODEL_A, 4096) is None
    assert sorted(killed) == [31, 33]


def test_scan_waits_for_live_owners_loading_server(monkeypatch):
    # Same model, parent ALIVE, not healthy yet -> wait for it, never kill.
    candidate = {"pid": 24, "parent_alive": True, "model": MODEL_A, "port": 6004, "n_ctx": 4096}
    killed: list[int] = []

    healthy_states = {"6004": False}

    def fake_health(port, timeout_s=2.0):
        if timeout_s == gguf_runner._SERVER_STARTUP_TIMEOUT_S:
            healthy_states["6004"] = True  # came up within the grace period
        return healthy_states.get(str(port), False)

    monkeypatch.setattr(gguf_runner, "_find_running_servers", lambda: [candidate])
    monkeypatch.setattr(gguf_runner, "_server_is_healthy", fake_health)
    monkeypatch.setattr(gguf_runner, "_kill_pid", lambda pid: killed.append(pid))

    adopted = gguf_runner._scan_for_adoption(MODEL_A, 4096)

    assert adopted == candidate  # waited, then adopted when it came up
    assert killed == []


def test_scan_never_kills_live_owner_stuck_server(monkeypatch):
    # Same model, parent ALIVE, never becomes healthy -> leave it (its owner
    # will clean it up) and spawn fresh ourselves.
    candidate = {"pid": 25, "parent_alive": True, "model": MODEL_A, "port": 6005, "n_ctx": 4096}
    killed: list[int] = []
    monkeypatch.setattr(gguf_runner, "_find_running_servers", lambda: [candidate])
    monkeypatch.setattr(gguf_runner, "_server_is_healthy", lambda port, timeout_s=2.0: False)
    monkeypatch.setattr(gguf_runner, "_kill_pid", lambda pid: killed.append(pid))

    assert gguf_runner._scan_for_adoption(MODEL_A, 4096) is None
    assert killed == []


class FakeProc:
    """Mimic a psutil.Process for stop() — graceful terminate rarely lands
    within the wait window, so kill() is what actually stops it."""

    def __init__(self, pid: int, alive: bool = True):
        self.pid = pid
        self.alive = alive
        self.killed = False

    def poll(self):
        return None if self.alive else 0

    def is_running(self) -> bool:
        return self.alive

    def terminate(self) -> None:
        pass

    def wait(self, timeout):
        return None  # still alive after the grace period -> force-kill

    def kill(self) -> None:
        self.killed = True
        self.alive = False


def _make_runner(pid: int, alive: bool = True) -> gguf_runner.GGUFServerProcess:
    runner = gguf_runner.GGUFServerProcess(MODEL_A, n_ctx=4096)
    runner._proc = FakeProc(pid, alive)
    return runner


def test_stop_last_owner_kills(monkeypatch):
    gguf_runner._OWNERS.clear()
    gguf_runner._register_owner(41)
    runner = _make_runner(41)

    runner.stop()

    assert runner._proc is None
    assert gguf_runner._OWNERS == {}


def test_stop_shared_sidecar_survives_first_owner(monkeypatch):
    gguf_runner._OWNERS.clear()
    gguf_runner._register_owner(42)
    gguf_runner._register_owner(42)
    first = _make_runner(42)
    second = _make_runner(42)
    second_proc = second._proc

    first.stop()

    assert first._proc is None
    assert gguf_runner._OWNERS == {42: 1}
    assert second_proc.killed is False

    second.stop()

    assert second_proc.killed is True
    assert gguf_runner._OWNERS == {}


def test_stop_dead_process_prunes_without_killing():
    gguf_runner._OWNERS.clear()
    gguf_runner._register_owner(43)
    runner = _make_runner(43, alive=False)

    runner.stop()

    assert runner._proc is None
    assert gguf_runner._OWNERS == {}
