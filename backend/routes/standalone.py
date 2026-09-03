"""Standalone project management endpoints.

Projects are persisted as JSON documents in the ``standalone_projects`` table
so a Leone-free project survives reloads (previously in-memory only). Create
returns a stable ``project_id``; explicit Save upserts by that id; Load reads
it back.
"""

import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..database.models import StandaloneProjectRow
from ..errors import ERR_INVALID_PROJECT_DATA, ERR_PROJECT_NOT_FOUND
from ..services.standalone_project import (
    create_standalone_project,
    project_from_json,
    project_to_dict,
)

router = APIRouter()


class CreateProjectRequest(BaseModel):
    name: str = "Untitled Project"
    description: str = ""
    fps: float = 24.0
    sample_rate: int = 48000


class ImportScriptRequest(BaseModel):
    project_json: str
    text: str
    format: str = "plain"


class ProjectSaveRequest(BaseModel):
    project_id: str
    project_json: str


class ProjectLoadRequest(BaseModel):
    project_id: str


@router.post("/project/create")
async def create_project(data: CreateProjectRequest, db: Session = Depends(get_db)):
    """Create a new standalone project and persist it."""
    project = create_standalone_project(data.name, data.description, data.fps, data.sample_rate)
    doc = StandaloneProjectRow(
        id=project.id,
        name=project.name,
        project_json=json.dumps(project_to_dict(project)),
    )
    db.add(doc)
    db.commit()
    return {"project": project_to_dict(project), "project_id": project.id}


@router.post("/project/save")
async def save_project(data: ProjectSaveRequest, db: Session = Depends(get_db)):
    """Upsert a standalone project by id."""
    try:
        project = project_from_json(data.project_json)
    except Exception as e:
        raise HTTPException(status_code=400, detail=ERR_INVALID_PROJECT_DATA) from e

    doc = db.query(StandaloneProjectRow).filter_by(id=data.project_id).first()
    if doc is None:
        doc = StandaloneProjectRow(id=data.project_id, name=project.name)
        db.add(doc)
    doc.name = project.name
    doc.project_json = json.dumps(project_to_dict(project))
    db.commit()
    return {"status": "saved", "project": project_to_dict(project)}


@router.post("/project/load")
async def load_project(data: ProjectLoadRequest, db: Session = Depends(get_db)):
    """Load a persisted standalone project by id."""
    doc = db.query(StandaloneProjectRow).filter_by(id=data.project_id).first()
    if doc is None:
        raise HTTPException(status_code=404, detail=ERR_PROJECT_NOT_FOUND)
    return {"project": json.loads(doc.project_json)}


@router.post("/project/import-script")
async def import_script(data: ImportScriptRequest, db: Session = Depends(get_db)):
    """Import a script (plain text or Fountain) into a project, creating scenes."""
    from ..services.standalone_project import import_script as _import_script

    try:
        project = project_from_json(data.project_json)
    except Exception as e:
        raise HTTPException(status_code=400, detail=ERR_INVALID_PROJECT_DATA) from e
    scene_count = _import_script(project, data.text, data.format)
    return {
        "scene_count": scene_count,
        "project": project_to_dict(project),
    }


@router.get("/project/templates")
async def list_templates():
    """List available project templates."""
    from ..services.standalone_project import list_builtin_templates

    return list_builtin_templates()
