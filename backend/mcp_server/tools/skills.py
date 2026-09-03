"""Workflow skill discovery for external MCP agents."""

from __future__ import annotations

from typing import Any

from fastmcp import FastMCP


def register_skill_tools(mcp: FastMCP) -> None:
    """Register the shared, executable workflow skill catalog."""

    @mcp.tool(
        name="21labs.list_skills",
        description="List executable otoyin workflow skills and the MCP tools each playbook uses. Pass a task description to rank relevant skills.",
    )
    async def twentylabs_list_skills(query: str | None = None) -> dict[str, Any]:
        """Return workflow playbooks and their tool sequences for MCP agents."""
        from ...agents.manifest import get_skill_catalog, validate_skill_catalog

        return {
            "surface": "mcp",
            "skills": get_skill_catalog(surface="mcp", query=query),
            "validation_errors": validate_skill_catalog(),
        }

    @mcp.tool(
        name="21labs.list_custom_skills",
        description="List user-created custom agent skills. These are workflow playbooks the user defined themselves.",
    )
    async def twentylabs_list_custom_skills(query: str | None = None) -> dict[str, Any]:
        """Return user-created custom skills."""
        from ...database.models import CustomSkill
        from ...database.session import SessionLocal

        if not SessionLocal:
            return {"skills": []}
        db = SessionLocal()
        try:
            rows = db.query(CustomSkill).filter(CustomSkill.enabled).all()
            if query and query.strip():
                terms = [t.strip(".,!?;:") for t in query.lower().split() if len(t.strip(".,!?;:")) >= 3]

                def score(r: CustomSkill) -> int:
                    haystack = " ".join([r.skill_id, r.name, r.description, *(r.triggers or [])]).lower()
                    return sum(haystack.count(t) for t in terms)

                rows = sorted(rows, key=lambda r: (-score(r), r.name))
                if terms:
                    rows = [r for r in rows if score(r) > 0] or rows
            return {
                "skills": [
                    {
                        "id": r.skill_id,
                        "name": r.name,
                        "description": r.description,
                        "triggers": r.triggers or [],
                        "steps": r.steps or [],
                        "tools": r.tools or {},
                        "pitfalls": r.pitfalls or [],
                    }
                    for r in rows
                ]
            }
        finally:
            db.close()
