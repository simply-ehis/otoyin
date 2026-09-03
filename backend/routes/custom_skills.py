"""CRUD API for user-created agent skills."""

from __future__ import annotations

import re
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database.models import CustomSkill
from ..database.session import get_db

router = APIRouter(prefix="/skills", tags=["skills"])


def _sanitize_skill_id(raw: str) -> str:
    """Normalize a user-provided skill_id to kebab-case."""
    s = raw.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    if not s:
        raise HTTPException(400, "skill_id must contain at least one alphanumeric character")
    return s


class SkillCreate(BaseModel):
    skill_id: str = Field(..., min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=128)
    description: str = ""
    triggers: list[str] = []
    steps: list[str] = []
    tools: dict[str, list[str]] = {}
    pitfalls: list[str] = []


class SkillUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    triggers: list[str] | None = None
    steps: list[str] | None = None
    tools: dict[str, list[str]] | None = None
    pitfalls: list[str] | None = None
    enabled: bool | None = None


def _skill_to_dict(skill: CustomSkill) -> dict[str, Any]:
    return {
        "id": skill.id,
        "skill_id": skill.skill_id,
        "name": skill.name,
        "description": skill.description,
        "triggers": skill.triggers or [],
        "steps": skill.steps or [],
        "tools": skill.tools or {},
        "pitfalls": skill.pitfalls or [],
        "enabled": skill.enabled,
        "created_at": skill.created_at.isoformat() if skill.created_at else None,
        "updated_at": skill.updated_at.isoformat() if skill.updated_at else None,
    }


@router.get("")
def list_custom_skills(
    query: str | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """List all custom skills, optionally filtered by query."""
    skills = db.query(CustomSkill).filter(CustomSkill.enabled).all()
    if query and query.strip():
        terms = [t.strip(".,!?;:") for t in query.lower().split() if len(t.strip(".,!?;:")) >= 3]

        def score(s: CustomSkill) -> int:
            haystack = " ".join([s.skill_id, s.name, s.description, *(s.triggers or [])]).lower()
            return sum(haystack.count(t) for t in terms)

        skills = sorted(skills, key=lambda s: (-score(s), s.name))
        if terms:
            skills = [s for s in skills if score(s) > 0] or skills
    return {"skills": [_skill_to_dict(s) for s in skills]}


@router.get("/{skill_id}")
def get_custom_skill(skill_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Get a single custom skill by skill_id."""
    skill = db.query(CustomSkill).filter(CustomSkill.skill_id == skill_id).first()
    if not skill:
        raise HTTPException(404, f"Skill '{skill_id}' not found")
    return _skill_to_dict(skill)


@router.post("", status_code=201)
def create_custom_skill(body: SkillCreate, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Create a new custom skill."""
    skill_id = _sanitize_skill_id(body.skill_id)
    existing = db.query(CustomSkill).filter(CustomSkill.skill_id == skill_id).first()
    if existing:
        raise HTTPException(409, f"Skill '{skill_id}' already exists")
    skill = CustomSkill(
        id=str(uuid.uuid4()),
        skill_id=skill_id,
        name=body.name.strip(),
        description=body.description,
        triggers=body.triggers,
        steps=body.steps,
        tools=body.tools,
        pitfalls=body.pitfalls,
    )
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return _skill_to_dict(skill)


@router.put("/{skill_id}")
def update_custom_skill(skill_id: str, body: SkillUpdate, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Update an existing custom skill."""
    skill = db.query(CustomSkill).filter(CustomSkill.skill_id == skill_id).first()
    if not skill:
        raise HTTPException(404, f"Skill '{skill_id}' not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(skill, field, value)
    db.commit()
    db.refresh(skill)
    return _skill_to_dict(skill)


@router.delete("/{skill_id}", status_code=204)
def delete_custom_skill(skill_id: str, db: Session = Depends(get_db)) -> None:
    """Delete a custom skill."""
    skill = db.query(CustomSkill).filter(CustomSkill.skill_id == skill_id).first()
    if not skill:
        raise HTTPException(404, f"Skill '{skill_id}' not found")
    db.delete(skill)
    db.commit()
