import re
from pathlib import Path

from backend.routes.assistant_tools.mappings import ENDPOINT_MAP, TOOL_METHODS
from backend.routes.assistant_tools.schemas import TOOLS
from backend.tool_registry import TR
from backend.tool_registry_populate import populate


def _decorated_names() -> set[str]:
    tools_dir = Path(__file__).parent.parent / "mcp_server" / "tools"
    names = set()
    for tool_file in tools_dir.iterdir():
        if tool_file.suffix != ".py" or tool_file.name.startswith("_") or tool_file.name == "tr_dispatch.py":
            continue
        names.update(
            re.findall(r'name="(21labs\.[a-z_0-9]+)"', tool_file.read_text(encoding="utf-8", errors="replace"))
        )
    return names


def test_remaining_high_value_tools_are_dual_surface():
    expected = {
        "21labs.capture_words",
        "21labs.capture_chapters",
        "21labs.analyze_loudness",
        "21labs.list_export_presets",
        "21labs.apply_export_preset",
        "21labs.list_reference_voices",
        "21labs.get_reference_voice",
        "21labs.reference_voice_audio",
        "21labs.use_reference_voice",
    }
    decorated = _decorated_names()
    assert expected <= decorated

    assistant_names = {t["function"]["name"] for t in TOOLS}
    for bare in (
        "capture_words",
        "capture_chapters",
        "analyze_loudness",
        "list_export_presets",
        "apply_export_preset",
        "list_reference_voices",
        "get_reference_voice",
        "reference_voice_audio",
        "use_reference_voice",
    ):
        assert bare in assistant_names
        assert bare in ENDPOINT_MAP

    populate()
    tr_names = {t.name for t in TR.for_surface("mcp")}
    assert expected <= tr_names
    assert TOOL_METHODS["capture_words"] == "GET"
    assert TOOL_METHODS["capture_chapters"] == "GET"
