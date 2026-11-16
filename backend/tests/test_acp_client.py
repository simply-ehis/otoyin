"""ACP client wire tests against an in-memory fake agent process."""

import json
import queue

from backend.services import acp_client as acp


class FakeStdout:
    """Blocking line source standing in for the child's stdout pipe."""

    def __init__(self):
        self.lines = queue.Queue()

    def put(self, payload: dict) -> None:
        self.lines.put(json.dumps(payload) + "\n")

    def __iter__(self):
        while True:
            line = self.lines.get()
            if line is None:
                return
            yield line

    def close(self) -> None:
        self.lines.put(None)


class FakeStdin:
    """Responds to requests the way a minimal ACP agent would."""

    def __init__(self, stdout: FakeStdout):
        self.stdout = stdout
        self.writes: list[dict] = []

    def write(self, text: str) -> None:
        message = json.loads(text)
        self.writes.append(message)
        method = message.get("method")
        if method == "initialize":
            self.stdout.put(
                {
                    "jsonrpc": "2.0",
                    "id": message["id"],
                    "result": {
                        "protocolVersion": 1,
                        "agentCapabilities": {"loadSession": True},
                        "agentInfo": {"name": "fake", "version": "1"},
                    },
                }
            )
        elif method == "session/new":
            self.stdout.put({"jsonrpc": "2.0", "id": message["id"], "result": {"sessionId": "sess_1"}})
        elif method == "session/prompt":
            self.stdout.put(
                {
                    "jsonrpc": "2.0",
                    "method": "session/update",
                    "params": {
                        "sessionId": "sess_1",
                        "update": {
                            "sessionUpdate": "agent_message_chunk",
                            "content": {"type": "text", "text": "hello back"},
                        },
                    },
                }
            )
            self.stdout.put({"jsonrpc": "2.0", "id": message["id"], "result": {"stopReason": "end_turn"}})

    def flush(self) -> None:
        pass

    def close(self) -> None:
        pass


class FakeProc:
    def __init__(self):
        self.stdout = FakeStdout()
        self.stdin = FakeStdin(self.stdout)
        self.pid = 4242

    def poll(self):
        return None


def _session(monkeypatch, **kwargs):
    proc = FakeProc()
    monkeypatch.setattr(acp, "popen_hidden", lambda *a, **k: proc)
    monkeypatch.setattr(acp, "run_hidden", lambda *a, **k: None)
    return acp.AcpSession(["fake", "acp"], "C:/tmp", **kwargs), proc


def test_initialize_new_session_and_prompt(monkeypatch):
    updates = []
    session, proc = _session(monkeypatch, on_update=updates.append)
    session.start()
    assert session.protocol_version == 1
    assert session.capabilities["loadSession"] is True
    assert session.new_session("C:/tmp") == "sess_1"
    assert session.prompt("sess_1", "hello") == "end_turn"

    methods = [message.get("method") for message in proc.stdin.writes]
    assert methods == ["initialize", "session/new", "session/prompt"]
    assert proc.stdin.writes[-1]["params"]["prompt"] == [{"type": "text", "text": "hello"}]
    assert updates[0]["update"]["content"]["text"] == "hello back"
    session.close()


def test_permission_auto_approve_picks_allow_option(monkeypatch):
    session, _ = _session(monkeypatch, auto_approve=True)
    result = session._permission_result(
        {
            "options": [
                {"optionId": "reject_once", "kind": "reject_once"},
                {"optionId": "allow_once", "kind": "allow_once"},
            ]
        }
    )
    assert result == {"outcome": {"outcome": "selected", "optionId": "allow_once"}}


def test_permission_auto_deny_when_disabled(monkeypatch):
    session, _ = _session(monkeypatch, auto_approve=False)
    assert session._permission_result({"options": []}) == {"outcome": "cancelled"}


def test_registry_roundtrip(monkeypatch):
    session, _ = _session(monkeypatch)
    acp.unregister("conv-1")
    acp.register("conv-1", session)
    assert acp.get("conv-1") is session
    assert acp.unregister("conv-1") is session
    assert acp.get("conv-1") is None
