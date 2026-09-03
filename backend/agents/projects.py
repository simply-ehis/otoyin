"""Project workspace management, vendored from galileo-core's design.

galileo-core models a *project* as the unit that scopes the agent's memory,
plans, checkpoints, and asset sources. We re-implement that concept natively
for 21-labs using our own SQLAlchemy models and ``config`` data dirs instead
of importing galileo-core (it is a reference, not a dependency).
"""

from __future__ import annotations

import logging
import shutil
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from sqlalchemy import delete as sa_delete
from sqlalchemy.orm import Session

try:
    from ..config import get_projects_dir
    from ..database.models import AgentProject, AgentProjectSource
except ImportError:  # pragma: no cover - allows running under bundled layout
    from config import get_projects_dir
    from database.models import AgentProject, AgentProjectSource

logger = logging.getLogger(__name__)

SOURCE_TYPES = ("file", "url", "freesound", "polyhaven")


@dataclass
class ProjectPaths:
    """Filesystem layout for a single project (mirrors galileo-core ``ProjectPaths``)."""

    project_dir: Path
    memory_dir: Path
    plans_dir: Path
    checkpoints_dir: Path
    sources_dir: Path

    def to_dict(self) -> dict:
        return {
            "project_dir": str(self.project_dir),
            "memory_dir": str(self.memory_dir),
            "plans_dir": str(self.plans_dir),
            "checkpoints_dir": str(self.checkpoints_dir),
            "sources_dir": str(self.sources_dir),
        }


@dataclass
class ProjectRepo:
    """Plain-data mirror of a ``Project`` row (galileo-core ``ProjectRepo`` shape)."""

    id: str
    name: str
    description: str | None
    source_url: str | None
    checkout_commit: str | None
    local_path: str | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_orm(cls, row: AgentProject) -> ProjectRepo:
        return cls(
            id=row.id,
            name=row.name,
            description=row.description,
            source_url=row.source_url,
            checkout_commit=row.checkout_commit,
            local_path=row.local_path,
            created_at=row.created_at,
            updated_at=row.updated_at,
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "source_url": self.source_url,
            "checkout_commit": self.checkout_commit,
            "local_path": self.local_path,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


@dataclass
class ProjectContext:
    """Resolved context the agent uses when operating inside a project."""

    project_id: str
    project_name: str
    roots: list[str]
    include_globs: list[str] = field(default_factory=list)
    exclude_globs: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "project_id": self.project_id,
            "project_name": self.project_name,
            "roots": self.roots,
            "include_globs": self.include_globs,
            "exclude_globs": self.exclude_globs,
        }


def get_projects_root() -> Path:
    return get_projects_dir()


def create_project_paths(project_id: str) -> ProjectPaths:
    """Create (if needed) and return the per-project directory layout."""
    root = get_projects_root() / project_id
    memory = root / "memory"
    plans = root / "plans"
    checkpoints = root / "checkpoints"
    sources = root / "sources"
    for d in (root, memory, plans, checkpoints, sources):
        d.mkdir(parents=True, exist_ok=True)
    return ProjectPaths(
        project_dir=root,
        memory_dir=memory,
        plans_dir=plans,
        checkpoints_dir=checkpoints,
        sources_dir=sources,
    )


def _require_project(db: Session, project_id: str) -> AgentProject:
    project = db.query(AgentProject).filter(AgentProject.id == project_id).first()
    if project is None:
        raise KeyError(f"Project {project_id!r} not found")
    return project


def list_projects(db: Session) -> list[ProjectRepo]:
    return [ProjectRepo.from_orm(p) for p in db.query(AgentProject).order_by(AgentProject.updated_at.desc()).all()]


def create_project(
    db: Session,
    name: str,
    description: str | None = None,
    source_url: str | None = None,
    checkout_commit: str | None = None,
    local_path: str | None = None,
) -> ProjectRepo:
    name = (name or "").strip()
    if not name:
        raise ValueError("Project name is required")
    existing = db.query(AgentProject).filter(AgentProject.name == name).first()
    if existing is not None:
        raise ValueError(f"A project named {name!r} already exists")

    project = AgentProject(
        name=name,
        description=description,
        source_url=source_url,
        checkout_commit=checkout_commit,
        local_path=local_path,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    create_project_paths(project.id)
    logger.info("Created project %s (%s)", project.id, name)
    return ProjectRepo.from_orm(project)


def get_project(db: Session, project_id: str) -> ProjectRepo:
    return ProjectRepo.from_orm(_require_project(db, project_id))


def delete_project(db: Session, project_id: str, remove_dirs: bool = True) -> None:
    _require_project(db, project_id)
    db.execute(sa_delete(AgentProjectSource).where(AgentProjectSource.project_id == project_id))
    db.execute(sa_delete(AgentProject).where(AgentProject.id == project_id))
    db.commit()
    if remove_dirs:
        root = get_projects_root() / project_id
        if root.exists():
            shutil.rmtree(root, ignore_errors=True)
    logger.info("Deleted project %s (remove_dirs=%s)", project_id, remove_dirs)


def add_source(
    db: Session,
    project_id: str,
    name: str,
    source_type: str = "file",
    url: str | None = None,
    local_path: str | None = None,
) -> AgentProjectSource:
    _require_project(db, project_id)
    if source_type not in SOURCE_TYPES:
        raise ValueError(f"source_type must be one of {SOURCE_TYPES}")
    name = (name or "").strip()
    if not name:
        raise ValueError("Source name is required")
    source = AgentProjectSource(
        project_id=project_id,
        name=name,
        url=url,
        source_type=source_type,
        local_path=local_path,
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    return source


def list_sources(db: Session, project_id: str) -> list[AgentProjectSource]:
    _require_project(db, project_id)
    return db.query(AgentProjectSource).filter(AgentProjectSource.project_id == project_id).all()


def remove_source(db: Session, project_id: str, source_id: str) -> None:
    _require_project(db, project_id)
    db.execute(
        sa_delete(AgentProjectSource).where(
            AgentProjectSource.project_id == project_id, AgentProjectSource.id == source_id
        )
    )
    db.commit()


def build_project_context(db: Session, project_id: str) -> ProjectContext:
    """Resolve the agent context for a project (mirrors galileo-core ``build_project_context``)."""
    project = _require_project(db, project_id)
    paths = create_project_paths(project_id)
    sources = list_sources(db, project_id)

    roots = [str(paths.project_dir)]
    for src in sources:
        if src.local_path:
            roots.append(str(src.local_path))
        elif src.url:
            roots.append(src.url)

    include_globs: list[str] = []
    exclude_globs = [
        "**/__pycache__/**",
        "**/.git/**",
        "**/node_modules/**",
    ]
    return ProjectContext(
        project_id=project.id,
        project_name=project.name,
        roots=roots,
        include_globs=include_globs,
        exclude_globs=exclude_globs,
    )
