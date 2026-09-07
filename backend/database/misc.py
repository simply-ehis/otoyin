"""Miscellaneous models: clipboard, capture, downloads, telemetry, agent projects, skills, songs, instruments."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text

from .base import Base


class Capture(Base):
    """A single voice input capture (dictation, recording, or uploaded file).

    Stores the original audio alongside the raw transcript and, optionally, a
    refined version produced by the LLM. Refinement flags are serialized as
    JSON so we can reproduce the prompt that generated the refined text.
    """

    __tablename__ = "captures"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    audio_path = Column(String, nullable=False)
    source = Column(String, nullable=False, default="file")  # dictation | recording | file
    language = Column(String, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    transcript_raw = Column(Text, nullable=False, default="")
    transcript_refined = Column(Text, nullable=True)
    stt_model = Column(String, nullable=True)
    llm_model = Column(String, nullable=True)
    refinement_flags = Column(Text, nullable=True)  # JSON blob
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))


class ClipboardItem(Base):
    """Single-slot cross-tab clipboard.

    Holds a serializable reference (by entity id + audio url) to any audio
    output so a clip copied in one tab/window can be pasted into another.
    Only one row exists at a time; copying replaces it (upsert by a fixed
    slot id). Created lazily on first copy.
    """

    __tablename__ = "clipboard"

    SLOT_ID = "current"

    id = Column(String, primary_key=True, default=SLOT_ID)
    kind = Column(String, nullable=False)
    entity_id = Column(String, nullable=False)
    name = Column(String, nullable=False, default="")
    duration_ms = Column(Integer, nullable=True)
    audio_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))


class ClipboardHistory(Base):
    """Append-only log of every copy, backing the clips library.

    Each PUT to the clipboard slot also inserts a row here; rows past the
    newest HISTORY_LIMIT are pruned. Restoring a row re-PUTs it to the slot.
    """

    __tablename__ = "clipboard_history"
    __table_args__ = (Index("ix_clipboard_history_created_at", "created_at"),)

    HISTORY_LIMIT = 20

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    kind = Column(String, nullable=False)
    entity_id = Column(String, nullable=False)
    name = Column(String, nullable=False, default="")
    duration_ms = Column(Integer, nullable=True)
    audio_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))


class ModelDownload(Base):
    """Download manifest: the single source of truth for 'which models has this
    install downloaded'. A model may only be *loaded* if a row exists here; the
    file may still be missing locally (user deleted it), in which case the UI
    offers a re-download rather than a silent auto-fetch.

    Tamper-evident by construction: a DB table (not user-editable JSON), keyed by
    the global catalog (model_name, model_size), so a duplicate download is
    idempotent and the gate can't be flipped from the app UI.
    """

    __tablename__ = "model_downloads"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    model_name = Column(String, nullable=False)
    model_size = Column(String, nullable=True)
    engine = Column(String, nullable=False)
    hf_repo_id = Column(String, nullable=True)
    local_path = Column(String, nullable=True)
    file_size_bytes = Column(Integer, nullable=True)
    downloaded_at = Column(DateTime, default=lambda: datetime.now(UTC), nullable=False)

    __table_args__ = (Index("ix_model_downloads_name_size", "model_name", "model_size", unique=True),)


class TelemetryEvent(Base):
    """Anonymous telemetry event for usage analytics."""

    __tablename__ = "telemetry_events"
    __table_args__ = (
        Index("ix_telemetry_events_type", "event_type"),
        Index("ix_telemetry_events_timestamp", "timestamp"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    event_type = Column(String, nullable=False)
    properties = Column(JSON, nullable=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(UTC), nullable=False)


class AppSetting(Base):
    """Generic app preference persisted in SQLite as a (key, json) row.

    Backs user-toggled engine preferences the app must remember across restarts
    — currently the per-engine 'always-on' keepalive flag. Living in SQL (not
    user-editable JSON) keeps it next to the download manifest that the
    no-auto-download gate is built on.
    """

    __tablename__ = "app_settings"

    key = Column(String, primary_key=True)
    value_json = Column(JSON, nullable=True)


class AgentProject(Base):
    """A scoped workspace that bounds the agent's memory, plans, and sources.

    Vendored from galileo-core's ``ProjectRepo`` concept: a project groups
    conversations, memory, plan artifacts, and asset sources so the agent
    operates within a well-defined context rather than global state. Uses a
    dedicated table so it never collides with 21-labs' studio ``Project``.
    """

    __tablename__ = "agent_projects"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False, unique=True)
    description = Column(Text, nullable=True)
    source_url = Column(String, nullable=True)
    checkout_commit = Column(String, nullable=True)
    local_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class AgentProjectSource(Base):
    """An asset source attached to an agent project (file, URL, or acquired library)."""

    __tablename__ = "agent_project_sources"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("agent_projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    url = Column(String, nullable=True)
    source_type = Column(String, nullable=False, default="file")  # file | url | freesound | polyhaven
    local_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))


class CustomSkill(Base):
    """User-created agent skill — a reusable workflow playbook."""

    __tablename__ = "custom_skills"
    __table_args__ = (Index("ix_custom_skills_skill_id", "skill_id", unique=True),)

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    skill_id = Column(String, nullable=False, unique=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=False, default="")
    triggers = Column(JSON, nullable=False, default=list)  # list[str]
    steps = Column(JSON, nullable=False, default=list)  # list[str]
    tools = Column(JSON, nullable=False, default=dict)  # dict[str, list[str]]
    pitfalls = Column(JSON, nullable=False, default=list)  # list[str]
    enabled = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class SongDraft(Base):
    """A songwriter-studio draft (song DNA + lyrics), ported from Resonant.

    The draft body mirrors Resonant's SongwritingDraft (language, title,
    idea, hook, pointOfView, tense, mood, genre, audience, imagery,
    stylePrompt, lyrics) so briefs and analyses stay compatible.
    """

    __tablename__ = "song_drafts"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String, nullable=False, default="")
    language = Column(String, nullable=False, default="en")
    draft_json = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))


class InstrumentPack(Base):
    """Installed instrument pack (SF2, SFZ, WebAudioFont presets, samples).

    The binary payload lives on disk under ``data/instruments/<id>/``; this
    row stores metadata and a JSON manifest of contained instruments.
    """

    __tablename__ = "instrument_packs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    version = Column(String, nullable=False, default="1.0.0")
    format = Column(String, nullable=False, default="soundfont")
    bytes = Column(Integer, nullable=False, default=0)
    source = Column(String, nullable=True)
    instruments_json = Column(JSON, nullable=False, default=list)
    installed_at = Column(DateTime, default=lambda: datetime.now(UTC))
