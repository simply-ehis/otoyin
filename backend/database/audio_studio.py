"""Audio studio session, comping, mixer, launcher, and project models."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, Column, DateTime, Float, Integer, String, Text

from .base import Base


class Project(Base):
    """Audio studio project (JSON blob)."""

    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    data = Column(Text)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class AudioStudioSession(Base):
    """Persisted Audio Studio session (track list, mixer state, etc.)."""

    __tablename__ = "audio_studio_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False, default="Untitled Session")
    data = Column(Text, nullable=False, default="{}")
    is_autosave = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class CompingSession(Base):
    """Persisted multi-take comping session (take lanes + selected regions)."""

    __tablename__ = "comping_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False, default="Untitled Comp")
    data = Column(JSON, nullable=False, default=dict)
    is_autosave = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class MixerSession(Base):
    """Persisted mixer session (channel strips + master volume)."""

    __tablename__ = "mixer_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False, default="Untitled Mix")
    data = Column(JSON, nullable=False, default=dict)
    is_autosave = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class SessionAutosaveSnapshot(Base):
    """Versioned autosave snapshot for rolling undo (5-slot window per session).

    Each mutation creates a new snapshot instead of overwriting.  The 5 newest
    snapshots form an undo stack; older ones are pruned on INSERT.  An explicit
    Save (promote) deletes all snapshots for that session.
    """

    __tablename__ = "session_autosave_snapshots"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, nullable=False, index=True)
    data = Column(Text, nullable=False, default="{}")
    kind = Column(String, nullable=False, default="studio")  # studio / comp / mixer
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))


class StandaloneProjectRow(Base):
    """Persisted standalone (Leone-free) project, stored as a JSON document."""

    __tablename__ = "standalone_projects"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False, default="Untitled Project")
    project_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class LauncherSession(Base):
    """Clip-launcher session (tracks, clips, scene slots), ported from Resonant.

    Stores the full session grid state as JSON blobs so multiple Tauri
    windows can share the same project via the backend.
    """

    __tablename__ = "launcher_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False, default="Untitled session")
    bpm = Column(Float, nullable=False, default=120.0)
    master_volume = Column(Float, nullable=False, default=0.84)
    tracks_json = Column(JSON, nullable=False, default=list)
    clips_json = Column(JSON, nullable=False, default=dict)
    num_scenes = Column(Integer, nullable=False, default=4)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))
