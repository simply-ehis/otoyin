"""Phase 2 combined endpoints — plugin chain processing.

Historically this module also hosted shortcuts, scripting, community-preset,
Lottie and telemetry routes; those graduated into their own dedicated modules
(``shortcuts.py``, ``scripting.py``, ``community_presets.py``,
``lottie_export.py``, ``telemetry.py``) and the duplicates were removed so
every path has exactly one handler. The plugins chain endpoints remain here
because no dedicated module owns them.
"""

import io
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter()


@router.get("/plugins/status")
async def plugin_status():
    from ..services.plugins import get_plugin_status

    return get_plugin_status()


@router.get("/plugins/list")
async def list_plugins():
    from ..services.plugins import list_plugins as _list

    return _list()


@router.post("/plugins/scan")
async def scan_plugins():
    from ..services.plugins import registry

    registry.scan()
    return {"status": "ok", "plugin_count": len(registry.list_all())}


class PluginProcessRequest(BaseModel):
    chain: list[dict]


@router.post("/plugins/process")
async def process_plugin_chain(
    audio_path: str = "",
    chain: list[dict] | None = None,
    data: PluginProcessRequest = None,
):
    """Apply a plugin chain to an audio file. Accepts chain via query params or body."""
    if chain is None:
        chain = []
    from .. import config
    from ..services.plugins import process_plugin_chain as svc_process

    if data is not None:
        chain = data.chain
    if not audio_path:
        raise HTTPException(status_code=400, detail="audio_path is required")
    if not chain:
        raise HTTPException(status_code=400, detail="chain is required")

    output_filename = f"plugin_processed_{uuid.uuid4().hex[:12]}.wav"
    output_path = config.get_exports_dir() / output_filename

    try:
        svc_process(audio_path, chain, str(output_path))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    return {
        "output_path": config.to_storage_path(output_path),
        "filename": output_filename,
    }


@router.post("/plugins/preview")
async def preview_plugin_chain(
    audio_path: str = "",
    chain: list[dict] | None = None,
    data: PluginProcessRequest = None,
):
    """Preview a plugin chain — returns WAV audio bytes without saving."""
    if chain is None:
        chain = []
    from ..services.plugins import preview_plugin_chain as svc_preview

    if data is not None:
        chain = data.chain
    if not audio_path:
        raise HTTPException(status_code=400, detail="audio_path is required")

    try:
        wav_bytes = svc_preview(audio_path, chain)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e

    return StreamingResponse(
        io.BytesIO(wav_bytes),
        media_type="audio/wav",
        headers={"Content-Disposition": "inline; filename=plugin_preview.wav"},
    )
