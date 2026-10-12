"""Coverage for the shared assistant/MCP workflow skill catalog."""

from backend.agents.manifest import get_agent_system_prompt, get_skill_catalog, validate_skill_catalog


def test_skill_catalog_uses_real_tools_on_both_surfaces():
    assert validate_skill_catalog() == []
    assert len(get_skill_catalog(surface="assistant")) >= 5
    assert len(get_skill_catalog(surface="mcp")) >= 5


def test_skill_query_ranks_relevant_playbook():
    skills = get_skill_catalog(surface="mcp", query="make a podcast episode")
    assert skills[0]["id"] == "podcast"
    assert "speak" in skills[0]["tools"]["mcp"]


def test_agent_prompt_contains_skill_router():
    prompt = get_agent_system_prompt(with_tools=True, query="clean and master this clip")
    assert "Workflow skills" in prompt
    assert "clean-master" in prompt


def test_agent_prompt_has_crafted_instructions():
    from backend.agents.manifest import AGENT_INSTRUCTIONS

    assert "Otoyin" in AGENT_INSTRUCTIONS
    assert "Plan before acting" in AGENT_INSTRUCTIONS
    assert "non-destructive" in AGENT_INSTRUCTIONS
    prompt = get_agent_system_prompt(with_tools=False, query=None)
    assert prompt.startswith(AGENT_INSTRUCTIONS)


def test_assistant_has_skill_discovery_tool():
    from backend.routes.assistant_tools import TOOLS

    names = {tool["function"]["name"] for tool in TOOLS}
    assert "list_skills" in names


async def test_mcp_registers_skill_discovery_tool():
    from fastmcp import FastMCP

    from backend.mcp_server.tools.skills import register_skill_tools

    server = FastMCP("skill-test")
    register_skill_tools(server)
    tools = await server.list_tools()
    assert any(tool.name == "21labs.list_skills" for tool in tools)
