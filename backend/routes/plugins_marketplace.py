"""Marketplace plugin install + lifecycle + launch endpoints (safe, gated)."""

from __future__ import annotations

import contextlib
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..database.session import get_db
from ..services import plugin_install as svc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/marketplace/plugins", tags=["plugins-marketplace"])

MAX_UPLOAD_BYTES = svc.MAX_BUNDLE_BYTES


def _serialize(row) -> dict:
    manifest = {}
    with contextlib.suppress(json.JSONDecodeError):
        manifest = json.loads(row.manifest_json or "{}")
    entry = manifest.get("entry") or {}
    external_command = entry.get("command") if manifest.get("kind") == "external-app" else None
    try:
        approved = json.loads(row.approved_permissions or "[]")
    except json.JSONDecodeError:
        approved = []
    return {
        "plugin_id": row.plugin_id,
        "name": row.name,
        "version": row.version,
        "developer": row.developer,
        "kind": row.kind,
        "enabled": row.enabled,
        "verified": row.verified,
        "trust_external": row.trust_external,
        "external_command": external_command,
        "declared_permissions": manifest.get("permissions", []),
        "approved_permissions": approved,
        "install_path": row.install_path,
    }


@router.post("/install")
async def install_plugin(file: UploadFile, db: Session = Depends(get_db)):
    chunks: list[bytes] = []
    total_size = 0
    while chunk := await file.read(1024 * 1024):
        total_size += len(chunk)
        if total_size > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Bundle too large")
        chunks.append(chunk)
    data = b"".join(chunks)
    try:
        row = svc.install_bundle(db, data, file.filename or "plugin.21labs")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return _serialize(row)


@router.get("")
def list_plugins(db: Session = Depends(get_db)):
    return [_serialize(r) for r in svc.list_installed(db)]


@router.get("/{plugin_id}")
def get_plugin(plugin_id: str, db: Session = Depends(get_db)):
    row = svc.get_installed(db, plugin_id)
    if not row:
        raise HTTPException(status_code=404, detail="Plugin not found")
    return _serialize(row)


@router.post("/{plugin_id}/enable")
def enable_plugin(plugin_id: str, approved_permissions: list[str] | None = None, db: Session = Depends(get_db)):
    """Enable a plugin. If the plugin declares permissions, the caller must
    pass the list of permissions the user approved. Unapproved permissions
    will not be granted at runtime."""
    row = svc.get_installed(db, plugin_id)
    if not row:
        raise HTTPException(status_code=404, detail="Plugin not found")
    # Validate approved permissions against declared ones
    manifest = {}
    with contextlib.suppress(json.JSONDecodeError):
        manifest = json.loads(row.manifest_json or "{}")
    declared = set(manifest.get("permissions") or [])
    approved = set(approved_permissions or [])
    # Only allow permissions that are actually declared
    valid_approved = approved & declared
    import json as _json

    row.approved_permissions = _json.dumps(sorted(valid_approved))
    svc.set_enabled(db, plugin_id, True)
    return {
        "plugin_id": plugin_id,
        "enabled": True,
        "approved_permissions": sorted(valid_approved),
        "declared_permissions": sorted(declared),
    }


@router.post("/{plugin_id}/disable")
def disable_plugin(plugin_id: str, db: Session = Depends(get_db)):
    if not svc.set_enabled(db, plugin_id, False):
        raise HTTPException(status_code=404, detail="Plugin not found")
    return {"plugin_id": plugin_id, "enabled": False}


@router.post("/{plugin_id}/approve-external")
def approve_external_plugin(plugin_id: str, db: Session = Depends(get_db)):
    """Explicit user consent for an external-app plugin to launch a system binary.

    Approval is durable (survives enable/disable toggles). Approving also enables
    the plugin, since approval is the consent to run.
    """
    if not svc.set_trust_external(db, plugin_id, True):
        raise HTTPException(status_code=404, detail="Plugin not found")
    svc.set_enabled(db, plugin_id, True)
    return {"plugin_id": plugin_id, "trust_external": True, "enabled": True}


@router.delete("/{plugin_id}")
def uninstall_plugin(plugin_id: str, db: Session = Depends(get_db)):
    if not svc.uninstall(db, plugin_id):
        raise HTTPException(status_code=404, detail="Plugin not found")
    return {"plugin_id": plugin_id, "uninstalled": True}


@router.post("/{plugin_id}/launch")
def launch_plugin(plugin_id: str):
    try:
        return svc.launch_plugin(plugin_id)
    except (ValueError, PermissionError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/{plugin_id}/stop")
def stop_plugin(plugin_id: str):
    return {"plugin_id": plugin_id, "stopped": svc.stop_plugin(plugin_id)}


@router.post("/{plugin_id}/launch-external")
def launch_external_plugin(plugin_id: str):
    """Launch an external-app plugin (linking layer to a system binary)."""
    try:
        return svc.launch_external_plugin(plugin_id)
    except (ValueError, PermissionError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/{plugin_id}/status")
def plugin_status(plugin_id: str):
    return svc.plugin_status(plugin_id)
