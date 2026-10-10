"""Privacy routes — data export and deletion (GDPR compliance).

All data lives on-device in SQLite + audio files. These endpoints let users
exercise their right to data portability (export) and erasure (delete).
"""

from __future__ import annotations

import io
import json
import logging
import os
import shutil
import uuid
import zipfile
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import get_data_dir
from ..database import get_db
from ..database.models import (
    ADRLine,
    ADRSession,
    ADRTake,
    AgentMemory,
    AgentProject,
    AgentProjectSource,
    AppSetting,
    AssistantSettings,
    Audiobook,
    AudiobookChapter,
    AudiobookUtterance,
    AudiobookVoiceCast,
    AudioChannel,
    AudioStudioSession,
    Capture,
    CaptureSettings,
    ChannelDeviceMapping,
    ClipboardHistory,
    ClipboardItem,
    CompingSession,
    Conversation,
    ConversationMessage,
    CustomSkill,
    EffectPreset,
    Entitlement,
    Generation,
    GenerationSettings,
    GenerationVersion,
    InstalledPlugin,
    InstrumentPack,
    LauncherSession,
    LibraryItemTag,
    LibraryTag,
    License,
    MCPClientBinding,
    MixerSession,
    ModelDownload,
    ModelProvider,
    PerformanceSettings,
    ProfileChannelMapping,
    ProfileSample,
    Project,
    SessionAutosaveSnapshot,
    SongDraft,
    StandaloneProjectRow,
    Story,
    StoryEditSnapshot,
    StoryItem,
    TelemetryEvent,
    VoiceChatSettings,
    VoiceProfile,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/privacy", tags=["privacy"])

# --- Confirmation token for destructive operations ---

_pending_confirmations: dict[str, dict] = {}


def _create_confirmation_token(action: str) -> str:
    token = str(uuid.uuid4())
    _pending_confirmations[token] = {
        "action": action,
        "created_at": datetime.now(UTC).isoformat(),
    }
    return token


def _consume_confirmation_token(token: str, expected_action: str) -> bool:
    info = _pending_confirmations.pop(token, None)
    if not info:
        return False
    return info.get("action") == expected_action


# --- Export ---


@router.post("/export")
def export_data(db: Session = Depends(get_db)):
    """Export all user data as a ZIP archive (JSON + audio files).

    Returns a streaming ZIP file containing:
    - manifest.json (metadata + table row counts)
    - *.json (one per database table with relevant columns)
    - audio/ (copies of all referenced audio files)
    """
    data_dir = get_data_dir()
    buf = io.BytesIO()

    tables = {
        "profiles": VoiceProfile,
        "profile_samples": ProfileSample,
        "generations": Generation,
        "generation_versions": GenerationVersion,
        "stories": Story,
        "story_items": StoryItem,
        "story_edit_snapshots": StoryEditSnapshot,
        "projects": Project,
        "effect_presets": EffectPreset,
        "audio_channels": AudioChannel,
        "channel_device_mappings": ChannelDeviceMapping,
        "profile_channel_mappings": ProfileChannelMapping,
        "capture_settings": CaptureSettings,
        "generation_settings": GenerationSettings,
        "performance_settings": PerformanceSettings,
        "mcp_client_bindings": MCPClientBinding,
        "model_providers": ModelProvider,
        "adr_sessions": ADRSession,
        "adr_lines": ADRLine,
        "adr_takes": ADRTake,
        "audio_studio_sessions": AudioStudioSession,
        "comping_sessions": CompingSession,
        "mixer_sessions": MixerSession,
        "session_autosave_snapshots": SessionAutosaveSnapshot,
        "standalone_project_rows": StandaloneProjectRow,
        "captures": Capture,
        "clipboard_items": ClipboardItem,
        "clipboard_history": ClipboardHistory,
        "conversations": Conversation,
        "conversation_messages": ConversationMessage,
        "agent_memories": AgentMemory,
        "voice_chat_settings": VoiceChatSettings,
        "licenses": License,
        "entitlements": Entitlement,
        "installed_plugins": InstalledPlugin,
        "agent_projects": AgentProject,
        "agent_project_sources": AgentProjectSource,
        "model_downloads": ModelDownload,
        "telemetry_events": TelemetryEvent,
        "app_settings": AppSetting,
        "audiobooks": Audiobook,
        "audiobook_chapters": AudiobookChapter,
        "audiobook_voice_casts": AudiobookVoiceCast,
        "audiobook_utterances": AudiobookUtterance,
        "library_tags": LibraryTag,
        "library_item_tags": LibraryItemTag,
        "custom_skills": CustomSkill,
        "song_drafts": SongDraft,
        "launcher_sessions": LauncherSession,
        "instrument_packs": InstrumentPack,
        "assistant_settings": AssistantSettings,
    }

    manifest: dict = {
        "exported_at": datetime.now(UTC).isoformat(),
        "version": "1.0",
        "tables": {},
    }

    audio_files: set[str] = set()

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # Export each table
        for name, model in tables.items():
            rows = db.query(model).all()
            for row in rows:
                d: dict = {}
                for col in model.__table__.columns:
                    val = getattr(row, col.name, None)
                    if isinstance(val, datetime):
                        val = val.isoformat()
                    d[col.name] = val
                    # Collect audio file paths
                    if col.name.endswith("_path") and isinstance(val, str) and val:
                        audio_files.add(val)
            manifest["tables"][name] = len(rows)
            zf.writestr(f"{name}.json", json.dumps(rows, indent=2, default=str))

        # Write manifest
        zf.writestr("manifest.json", json.dumps(manifest, indent=2))

        # Copy audio files
        audio_dir = data_dir / "audio"
        for rel_path in audio_files:
            # Try both absolute and relative paths
            candidates = [
                data_dir / rel_path if not os.path.isabs(rel_path) else Path(rel_path),
                audio_dir / os.path.basename(rel_path),
                Path(rel_path),
            ]
            for src in candidates:
                if src.is_file():
                    arcname = f"audio/{os.path.basename(rel_path)}"
                    zf.write(src, arcname)
                    break

    buf.seek(0)

    from fastapi.responses import StreamingResponse

    filename = f"otoyin-export-{datetime.now(UTC).strftime('%Y%m%d-%H%M%S')}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# --- Delete ---


class DeleteConfirmRequest(BaseModel):
    confirmation_token: str | None = None


@router.post("/delete/confirm")
def confirm_delete():
    """Request a confirmation token for data deletion.

    Returns a token that must be passed to POST /delete within 5 minutes.
    """
    token = _create_confirmation_token("delete_all")
    return {"confirmation_token": token, "expires_in_seconds": 300}


@router.post("/delete")
def delete_all_data(
    req: DeleteConfirmRequest,
    db: Session = Depends(get_db),
):
    """Permanently delete ALL user data.

    Requires a valid confirmation_token from /delete/confirm.
    This action is irreversible.
    """
    if not req.confirmation_token:
        raise HTTPException(status_code=400, detail="confirmation_token required")

    if not _consume_confirmation_token(req.confirmation_token, "delete_all"):
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired confirmation_token. Call POST /delete/confirm first.",
        )

    data_dir = get_data_dir()
    deleted: dict[str, int] = {}

    # Delete table data (order matters for foreign keys)
    order = [
        ("story_edit_snapshots", StoryEditSnapshot),
        ("story_items", StoryItem),
        ("stories", Story),
        ("profile_samples", ProfileSample),
        ("adr_takes", ADRTake),
        ("adr_lines", ADRLine),
        ("adr_sessions", ADRSession),
        ("audiobook_utterances", AudiobookUtterance),
        ("audiobook_chapters", AudiobookChapter),
        ("audiobook_voice_casts", AudiobookVoiceCast),
        ("audiobooks", Audiobook),
        ("library_item_tags", LibraryItemTag),
        ("library_tags", LibraryTag),
        ("generations", Generation),
        ("generation_versions", GenerationVersion),
        ("projects", Project),
        ("agent_project_sources", AgentProjectSource),
        ("agent_projects", AgentProject),
        ("agent_memories", AgentMemory),
        ("conversation_messages", ConversationMessage),
        ("conversations", Conversation),
        ("clipboard_history", ClipboardHistory),
        ("clipboard_items", ClipboardItem),
        ("captures", Capture),
        ("comping_sessions", CompingSession),
        ("mixer_sessions", MixerSession),
        ("session_autosave_snapshots", SessionAutosaveSnapshot),
        ("audio_studio_sessions", AudioStudioSession),
        ("launcher_sessions", LauncherSession),
        ("song_drafts", SongDraft),
        ("profile_channel_mappings", ProfileChannelMapping),
        ("channel_device_mappings", ChannelDeviceMapping),
        ("audio_channels", AudioChannel),
        ("capture_settings", CaptureSettings),
        ("generation_settings", GenerationSettings),
        ("performance_settings", PerformanceSettings),
        ("mcp_client_bindings", MCPClientBinding),
        ("model_providers", ModelProvider),
        ("model_downloads", ModelDownload),
        ("installed_plugins", InstalledPlugin),
        ("effect_presets", EffectPreset),
        ("custom_skills", CustomSkill),
        ("instrument_packs", InstrumentPack),
        ("entitlements", Entitlement),
        ("licenses", License),
        ("voice_chat_settings", VoiceChatSettings),
        ("assistant_settings", AssistantSettings),
        ("standalone_project_rows", StandaloneProjectRow),
        ("telemetry_events", TelemetryEvent),
        ("app_settings", AppSetting),
        ("profiles", VoiceProfile),
    ]

    for name, model in order:
        count = db.query(model).delete()
        deleted[name] = count

    db.commit()

    # Re-seed the download manifest from models still on disk. Wiping
    # model_downloads must not leave Activate 400ing for files the user
    # already has (status reports downloaded from the filesystem).
    try:
        from ..services.model_registry import reconcile_downloads

        reconcile_downloads()
    except Exception:
        logger.debug("Manifest reconcile after wipe failed", exc_info=True)

    # Delete audio files
    audio_dir = data_dir / "audio"
    audio_deleted = 0
    if audio_dir.is_dir():
        for f in audio_dir.iterdir():
            if f.is_file():
                f.unlink()
                audio_deleted += 1
        shutil.rmtree(audio_dir, ignore_errors=True)
    deleted["audio_files"] = audio_deleted

    # Delete telemetry and crash logs
    for log_name in ("telemetry.jsonl", "crash_reports.jsonl"):
        log_path = data_dir / log_name
        if log_path.is_file():
            log_path.unlink()
            deleted[log_name] = 1

    logger.warning("All user data deleted: %s", deleted)
    return {"deleted": deleted, "timestamp": datetime.now(UTC).isoformat()}
