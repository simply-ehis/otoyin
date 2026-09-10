"""Standalone project management endpoints.

Projects are persisted as JSON documents in the ``standalone_projects`` table
so a Leone-free project survives reloads (previously in-memory only). Create
returns a stable ``project_id``; explicit Save upserts by that id; Load reads
it back.
"""

import io
import json

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from fastapi.responses import Response, StreamingResponse
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
from ..utils.http import safe_content_disposition

router = APIRouter()


class CreateProjectRequest(BaseModel):
    name: str = "Untitled Project"
    description: str = ""
    fps: float = 24.0
    sample_rate: int = 48000


class ImportScriptRequest(BaseModel):
    project_json: str
    text: str
    format: str = "plain"  # "plain", "fountain", or "markdown"


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
    """Import a script (plain text, Fountain, or Markdown) into a project, creating scenes."""
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


@router.post("/project/import-file")
async def import_script_file(
    file: UploadFile,
    project_json: str | None = None,
    script_format: str = "plain",
    db: Session = Depends(get_db),
):
    """Import a script from a text/markdown file into a project.

    Accepts .txt, .md, .markdown files. If project_json is provided,
    imports into that project; otherwise creates a new project.
    """
    from ..services.standalone_project import (
        create_standalone_project,
        import_script as _import_script,
        project_from_json,
        project_to_dict,
    )

    filename = (file.filename or "").lower()
    if not filename.endswith((".txt", ".md", ".markdown")):
        raise HTTPException(status_code=400, detail="File must be .txt, .md, or .markdown")

    # Auto-detect format from extension
    if script_format == "plain" and filename.endswith((".md", ".markdown")):
        script_format = "markdown"

    # Enforce 5 MB limit on script file uploads
    max_script_size = 5 * 1024 * 1024
    content = await file.read()
    if len(content) > max_script_size:
        raise HTTPException(status_code=413, detail="Script file too large (max 5 MB)")
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError as e:
        raise HTTPException(status_code=400, detail="File must be valid UTF-8 text") from e

    if project_json:
        try:
            project = project_from_json(project_json)
        except Exception as e:
            raise HTTPException(status_code=400, detail=ERR_INVALID_PROJECT_DATA) from e
    else:
        project = create_standalone_project("Imported Script")

    scene_count = _import_script(project, text, script_format)
    return {
        "scene_count": scene_count,
        "project": project_to_dict(project),
    }


@router.post("/project/import-and-generate")
async def import_and_generate(
    file: UploadFile,
    voice_profile_id: str = Form(...),
    engine: str = Form(...),
    script_format: str = Form("plain"),
    db: Session = Depends(get_db),
):
    """Import a script file and generate speech for all scenes in one call.

    Creates a project, imports the script, assigns the voice profile to all characters,
    and queues generation for each dialogue line. Returns the project with generation IDs.
    """
    from ..database.models import VoiceProfile as DBVoiceProfile
    from ..services.batch import add_job_from_scripting
    from ..services.standalone_project import (
        create_standalone_project,
        import_script as _import_script,
        project_to_dict,
    )

    filename = (file.filename or "").lower()
    if not filename.endswith((".txt", ".md", ".markdown")):
        raise HTTPException(status_code=400, detail="File must be .txt, .md, or .markdown")

    # Auto-detect format from extension
    if script_format == "plain" and filename.endswith((".md", ".markdown")):
        script_format = "markdown"

    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError as e:
        raise HTTPException(status_code=400, detail="File must be valid UTF-8 text") from e

    # Verify voice profile exists
    profile = db.query(DBVoiceProfile).filter_by(id=voice_profile_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Voice profile not found")

    # Create project
    project = create_standalone_project("Generated Project")
    scene_count = _import_script(project, text, script_format)

    # Assign voice profile to all characters
    for char in project.characters:
        char.voice_profile_id = voice_profile_id

    # Queue generation for each dialogue line in each scene
    generation_ids = []
    for scene in project.scenes:
        for dialogue in scene.dialogue:
            text_content = dialogue.get("text", "").strip()
            if text_content:
                job = await add_job_from_scripting(
                    text=text_content,
                    voice_profile_id=voice_profile_id,
                    engine=engine,
                    db=db,
                )
                generation_ids.append(job.id)

    # Save project with updated characters
    doc = StandaloneProjectRow(
        id=project.id,
        name=project.name,
        project_json=json.dumps(project_to_dict(project)),
    )
    db.add(doc)
    db.commit()

    return {
        "project": project_to_dict(project),
        "generation_ids": generation_ids,
        "scene_count": scene_count,
        "status": "queued",
        "message": f"Created {len(generation_ids)} generation jobs. Use /batch/jobs/{{id}} to poll status.",
    }


# ── Export / Import ─────────────────────────────────────────────────


@router.get("/project/export/{project_id}")
async def export_project(project_id: str, db: Session = Depends(get_db)):
    """Export a standalone project as a self-contained ZIP archive.

    The archive includes the project JSON, all referenced voice profiles
    (with samples and avatars), and any project audio files.
    """
    from ..services.export_import import export_standalone_project_to_zip

    try:
        zip_bytes = export_standalone_project_to_zip(project_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    project = json.loads(db.query(StandaloneProjectRow).filter_by(id=project_id).first().project_json)
    filename = f"{project.get('name', 'project')}.zip"
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": safe_content_disposition("attachment", filename)},
    )


@router.post("/project/import")
async def import_project(file: UploadFile, db: Session = Depends(get_db)):
    """Import a standalone project from a ZIP archive.

    Voice profiles are matched by name (reuse) before importing embedded copies.
    All project and profile IDs are regenerated to avoid collisions.
    """
    from ..services.export_import import import_standalone_project_from_zip

    if not file.filename or not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="File must be a .zip archive")

    # Enforce 50 MB limit on ZIP imports
    max_zip_size = 50 * 1024 * 1024
    try:
        file_bytes = await file.read()
        if len(file_bytes) > max_zip_size:
            raise HTTPException(status_code=413, detail="ZIP file too large (max 50 MB)")
        if len(file_bytes) < 100:
            raise HTTPException(status_code=400, detail="Invalid ZIP file (too small)")
        result = await import_standalone_project_from_zip(file_bytes, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Import failed: {e}") from e

    return result


@router.get("/project/export-epub/{project_id}")
async def export_project_epub(
    project_id: str,
    db: Session = Depends(get_db),
):
    """Export a standalone project as EPUB for e-readers."""
    from ..services.story_export import export_project_to_epub

    doc = db.query(StandaloneProjectRow).filter_by(id=project_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail=ERR_PROJECT_NOT_FOUND)

    project_data = json.loads(doc.project_json)

    try:
        epub_bytes = export_project_to_epub(project_id, project_data, db)
    except RuntimeError as e:
        raise HTTPException(status_code=501, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"EPUB export failed: {e}") from e

    filename = f"{project_data.get('name', 'project')}.epub"
    return StreamingResponse(
        io.BytesIO(epub_bytes),
        media_type="application/epub+zip",
        headers={"Content-Disposition": safe_content_disposition("attachment", filename)},
    )


@router.get("/project/export-pdf/{project_id}")
async def export_project_pdf(
    project_id: str,
    db: Session = Depends(get_db),
):
    """Export a standalone project as PDF for printing/sharing."""
    from ..services.story_export import export_project_to_pdf

    doc = db.query(StandaloneProjectRow).filter_by(id=project_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail=ERR_PROJECT_NOT_FOUND)

    project_data = json.loads(doc.project_json)

    try:
        pdf_bytes = export_project_to_pdf(project_id, project_data, db)
    except RuntimeError as e:
        raise HTTPException(status_code=501, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF export failed: {e}") from e

    filename = f"{project_data.get('name', 'project')}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": safe_content_disposition("attachment", filename)},
    )
