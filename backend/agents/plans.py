"""Per-project plan artifacts, vendored from galileo-core's plan concept.

galileo-core stores plans as files under each project's ``plans_dir``. We keep
that file-based design (cheap, diff-friendly, agent-writable) but scope it to a
21-labs ``AgentProject`` and reuse ``agents.projects.create_project_paths``.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy.orm import Session

try:
    from ..agents import projects as project_service
except ImportError:  # pragma: no cover - bundled layout
    from agents import projects as project_service

logger = logging.getLogger(__name__)

VALID_STATUSES = ("planned", "in_progress", "done", "archived")


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _plan_path(project_id: str, plan_id: str) -> Path:
    paths = project_service.create_project_paths(project_id)
    return paths.plans_dir / f"{plan_id}.json"


def _normalize_step(step: dict | str) -> dict:
    if isinstance(step, str):
        return {"id": str(uuid.uuid4()), "text": step, "done": False}
    text = str(step.get("text", ""))
    done = bool(step.get("done", False))
    sid = step.get("id") or str(uuid.uuid4())
    return {"id": sid, "text": text, "done": done}


def write_plan(
    db: Session,
    project_id: str,
    title: str,
    steps: list | None = None,
    status: str = "planned",
    plan_id: str | None = None,
) -> dict:
    """Create or overwrite a plan for a project. Returns the persisted plan dict."""
    project_service.get_project(db, project_id)  # 404 if missing
    if status not in VALID_STATUSES:
        raise ValueError(f"status must be one of {VALID_STATUSES}")

    plan_id = plan_id or str(uuid.uuid4())
    steps = [_normalize_step(s) for s in (steps or [])]
    now = _now()
    plan = {
        "id": plan_id,
        "project_id": project_id,
        "title": title,
        "status": status,
        "steps": steps,
        "created_at": now,
        "updated_at": now,
    }
    path = _plan_path(project_id, plan_id)
    path.write_text(json.dumps(plan, indent=2), encoding="utf-8")
    logger.info("Wrote plan %s for project %s", plan_id, project_id)
    return plan


def get_plan(project_id: str, plan_id: str) -> dict:
    path = _plan_path(project_id, plan_id)
    if not path.exists():
        raise KeyError(f"Plan {plan_id!r} not found")
    return json.loads(path.read_text(encoding="utf-8"))


def list_plans(project_id: str) -> list[dict]:
    paths = project_service.create_project_paths(project_id)
    plans: list[dict] = []
    for f in sorted(paths.plans_dir.glob("*.json")):
        try:
            plans.append(json.loads(f.read_text(encoding="utf-8")))
        except json.JSONDecodeError:
            logger.warning("Skipping unreadable plan file %s", f)
    plans.sort(key=lambda p: p.get("updated_at", ""), reverse=True)
    return plans


def update_plan_status(project_id: str, plan_id: str, status: str) -> dict:
    if status not in VALID_STATUSES:
        raise ValueError(f"status must be one of {VALID_STATUSES}")
    plan = get_plan(project_id, plan_id)
    plan["status"] = status
    plan["updated_at"] = _now()
    path = _plan_path(project_id, plan_id)
    path.write_text(json.dumps(plan, indent=2), encoding="utf-8")
    return plan


def delete_plan(project_id: str, plan_id: str) -> None:
    path = _plan_path(project_id, plan_id)
    if not path.exists():
        raise KeyError(f"Plan {plan_id!r} not found")
    path.unlink()
    logger.info("Deleted plan %s for project %s", plan_id, project_id)
