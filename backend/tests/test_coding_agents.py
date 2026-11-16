"""Tests for registry-driven coding-agent discovery."""

import pytest

from backend.routes.coding_agents import _resolve_argv, _text_chunk
from backend.services import coding_agents as ca


def _entry(agent_id: str) -> dict:
    return next(a for a in ca.load_registry()["agents"] if a["id"] == agent_id)


def _paths(monkeypatch, mapping):
    monkeypatch.setattr(ca, "find_executable", lambda name: mapping.get(name))


def test_registry_snapshot_is_broad(monkeypatch):
    agents = ca.load_registry()["agents"]
    assert len(agents) >= 40
    ids = {a["id"] for a in agents}
    assert {"cline", "kilo", "kiro", "github-copilot-cli", "antigravity-acp", "opencode"} <= ids


def test_binary_agent_uses_registry_cmd_and_args(monkeypatch):
    _paths(monkeypatch, {"opencode": "C:/npm/opencode.cmd"})
    described = ca.describe(_entry("opencode"))
    assert described["installed"] is True
    assert described["acp_available"] is True
    assert described["acp_command"] == ["C:/npm/opencode.cmd", "acp"]
    assert described["acp_kind"] == "native"


def test_cli_alias_uses_registry_npx_adapter(monkeypatch):
    _paths(monkeypatch, {"codex": "C:/npm/codex.cmd", "npx": "C:/node/npx.cmd"})
    described = ca.describe(_entry("codex-acp"))
    assert described["installed"] is True
    assert any(part.startswith("@agentclientprotocol/codex-acp") for part in described["acp_command"])
    assert described["acp_kind"] == "adapter"


def test_npm_package_counts_as_installed(monkeypatch):
    _paths(monkeypatch, {"npx": "C:/node/npx.cmd"})
    monkeypatch.setattr(ca, "_npm_installed", lambda package: True)
    described = ca.describe(_entry("cline"))
    assert described["installed"] is True
    assert described["acp_command"][1] == "-y"
    assert any(part.startswith("cline@") for part in described["acp_command"])


def test_uninstalled_agent_is_still_listed(monkeypatch):
    _paths(monkeypatch, {})
    monkeypatch.setattr(ca, "_npm_installed", lambda package: False)
    described = ca.describe(_entry("cline"))
    assert described["installed"] is False
    assert described["acp_available"] is False
    assert described["acp_command"] is None
    assert "npm install" in described["install_hint"]


def test_detect_sorts_installed_first(monkeypatch):
    _paths(monkeypatch, {"kilo": "C:/kilo.exe"})
    monkeypatch.setattr(ca, "_npm_installed", lambda package: False)
    detected = ca.detect_available()
    assert detected[0]["installed"] is True
    assert len(detected) >= len(ca.load_registry()["agents"])


def test_custom_agent_roundtrip(monkeypatch, tmp_path):
    monkeypatch.setattr(ca, "_CUSTOM_FILE", tmp_path / "custom.json")
    monkeypatch.setattr(ca, "find_executable", lambda name: "C:/tools/acp-cli.exe" if name == "acp-cli" else None)
    created = ca.add_custom_agent("My Agent", ["acp-cli", "acp"])
    assert created["id"] == "custom-my-agent"
    assert created["acp_command"] == ["C:/tools/acp-cli.exe", "acp"]
    assert [a["id"] for a in ca.list_custom_agents()] == ["custom-my-agent"]
    assert ca.acp_command_for("custom-my-agent") == ["C:/tools/acp-cli.exe", "acp"]
    assert ca.remove_custom_agent("custom-my-agent") is True
    assert ca.list_custom_agents() == []


def test_custom_agent_rejects_unknown_executable(monkeypatch, tmp_path):
    monkeypatch.setattr(ca, "_CUSTOM_FILE", tmp_path / "custom.json")
    monkeypatch.setattr(ca, "find_executable", lambda name: None)
    with pytest.raises(ValueError, match="Executable not found"):
        ca.add_custom_agent("Bad", ["missing-agent"])


def test_resolve_argv_uses_executable_path(monkeypatch):
    monkeypatch.setattr(ca, "find_executable", lambda name: "C:/npm/opencode.cmd" if name == "opencode" else None)
    assert _resolve_argv(["opencode", "acp"]) == ["C:/npm/opencode.cmd", "acp"]
    assert _resolve_argv(["/abs/agent", "acp"]) == ["/abs/agent", "acp"]


def test_text_chunk_reads_nested_acp_update():
    params = {
        "sessionId": "ses_1",
        "update": {
            "sessionUpdate": "agent_message_chunk",
            "content": {"type": "text", "text": "ACP OK"},
        },
    }
    assert _text_chunk(params) == "ACP OK"
    assert _text_chunk({"update": {"sessionUpdate": "agent_thought_chunk"}}) is None
    assert _text_chunk({}) is None
