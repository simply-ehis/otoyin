"""Tests for the single BYOK credential store (OS credential store)."""

from backend.utils import device_credentials


def test_reads_key_via_windows_target_name(monkeypatch):
    calls = []

    def fake_get(target, username):
        calls.append((target, username))
        return "sk-probe"

    monkeypatch.setattr(device_credentials.keyring, "get_password", fake_get)
    assert device_credentials.read_byok_key("llm") == "sk-probe"
    # Pins the Rust keyring-4 Windows TargetName construction:
    # TargetName = "<username>.<service>"
    assert calls == [("llm.otoyin", "llm")]


def test_missing_entry_returns_none(monkeypatch):
    monkeypatch.setattr(device_credentials.keyring, "get_password", lambda *_: None)
    assert device_credentials.read_byok_key("tts") is None


def test_vault_failure_returns_none(monkeypatch):
    def boom(*_):
        raise RuntimeError("vault is locked")

    monkeypatch.setattr(device_credentials.keyring, "get_password", boom)
    assert device_credentials.read_byok_key("stt") is None
