"""REST routes for project workspaces (auto-discovered by register_routers)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

try:
    from ..agents import plans as plan_service, projects as project_service
    from ..database import get_db
except ImportError:  # pragma: no cover - bundled layout
    from agents import plans as plan_service, projects as project_service
    from database import get_db

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    source_url: str | None = None
    checkout_commit: str | None = None
    local_path: str | None = None


class SourceCreate(BaseModel):
    name: str
    source_type: str = "file"
    url: str | None = None
    local_path: str | None = None


class PlanCreate(BaseModel):
    title: str
    steps: list = []
    status: str = "planned"
    plan_id: str | None = None


class PlanStatusUpdate(BaseModel):
    status: str


def _handle_errors(fn):
    try:
        return fn()
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("")
def api_list_projects(db: Session = Depends(get_db)):
    return [p.to_dict() for p in project_service.list_projects(db)]


@router.post("", status_code=201)
def api_create_project(body: ProjectCreate, db: Session = Depends(get_db)):
    return _handle_errors(
        lambda: project_service.create_project(
            db,
            name=body.name,
            description=body.description,
            source_url=body.source_url,
            checkout_commit=body.checkout_commit,
            local_path=body.local_path,
        ).to_dict()
    )


@router.get("/{project_id}")
def api_get_project(project_id: str, db: Session = Depends(get_db)):
    return _handle_errors(lambda: project_service.get_project(db, project_id).to_dict())


@router.get("/{project_id}/paths")
def api_project_paths(project_id: str, db: Session = Depends(get_db)):
    def _run():
        project_service.get_project(db, project_id)  # 404 if missing
        return project_service.create_project_paths(project_id).to_dict()

    return _handle_errors(_run)


@router.get("/{project_id}/context")
def api_project_context(project_id: str, db: Session = Depends(get_db)):
    return _handle_errors(lambda: project_service.build_project_context(db, project_id).to_dict())


@router.delete("/{project_id}")
def api_delete_project(project_id: str, remove_dirs: bool = True, db: Session = Depends(get_db)):
    _handle_errors(lambda: project_service.delete_project(db, project_id, remove_dirs=remove_dirs))
    return {"ok": True}


@router.get("/{project_id}/sources")
def api_list_sources(project_id: str, db: Session = Depends(get_db)):
    return _handle_errors(
        lambda: [
            {
                "id": s.id,
                "project_id": s.project_id,
                "name": s.name,
                "url": s.url,
                "source_type": s.source_type,
                "local_path": s.local_path,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in project_service.list_sources(db, project_id)
        ]
    )


@router.post("/{project_id}/sources", status_code=201)
def api_add_source(project_id: str, body: SourceCreate, db: Session = Depends(get_db)):
    def _run():
        src = project_service.add_source(
            db,
            project_id=project_id,
            name=body.name,
            source_type=body.source_type,
            url=body.url,
            local_path=body.local_path,
        )
        return {
            "id": src.id,
            "project_id": src.project_id,
            "name": src.name,
            "url": src.url,
            "source_type": src.source_type,
            "local_path": src.local_path,
        }

    return _handle_errors(_run)


@router.delete("/{project_id}/sources/{source_id}")
def api_remove_source(project_id: str, source_id: str, db: Session = Depends(get_db)):
    _handle_errors(lambda: project_service.remove_source(db, project_id, source_id))
    return {"ok": True}


# --- Plans (per-project plan artifacts) -------------------------------------


@router.get("/{project_id}/plans")
def api_list_plans(project_id: str, db: Session = Depends(get_db)):
    _handle_errors(lambda: project_service.get_project(db, project_id))  # 404 if missing
    return plan_service.list_plans(project_id)


@router.post("/{project_id}/plans", status_code=201)
def api_create_plan(project_id: str, body: PlanCreate, db: Session = Depends(get_db)):
    def _run():
        project_service.get_project(db, project_id)  # 404 if missing
        return plan_service.write_plan(
            db,
            project_id=project_id,
            title=body.title,
            steps=body.steps,
            status=body.status,
            plan_id=body.plan_id,
        )

    return _handle_errors(_run)


@router.get("/{project_id}/plans/{plan_id}")
def api_get_plan(project_id: str, plan_id: str):
    return _handle_errors(lambda: plan_service.get_plan(project_id, plan_id))


@router.patch("/{project_id}/plans/{plan_id}/status")
def api_update_plan_status(project_id: str, plan_id: str, body: PlanStatusUpdate):
    return _handle_errors(lambda: plan_service.update_plan_status(project_id, plan_id, body.status))


@router.delete("/{project_id}/plans/{plan_id}")
def api_delete_plan(project_id: str, plan_id: str):
    _handle_errors(lambda: plan_service.delete_plan(project_id, plan_id))
    return {"ok": True}
