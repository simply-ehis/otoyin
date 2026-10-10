from backend.mcp_server.tools import audio_domains


class _FakeMcp:
    def __init__(self):
        self.tools = {}

    def tool(self, **kwargs):
        def _decorator(fn):
            self.tools[kwargs["name"]] = fn
            return fn

        return _decorator


async def test_conversation_wrappers_send_bare_line_arrays(monkeypatch):
    calls = []

    async def _fake_rest(method, path, **kwargs):
        calls.append((method, path, kwargs.get("json")))
        return {"ok": True}

    monkeypatch.setattr(audio_domains, "_rest", _fake_rest)
    fake_mcp = _FakeMcp()
    audio_domains.register_conversation_tools(fake_mcp)
    lines = [{"id": "l1", "text": "Hello", "speaker": "A"}]

    await fake_mcp.tools["21labs.conversation_auto_duck"](lines)
    await fake_mcp.tools["21labs.conversation_auto_level"](lines)

    assert calls == [
        ("POST", "/conversation/auto-duck", lines),
        ("POST", "/conversation/auto-level", lines),
    ]
