"""Model cache migration endpoints and helpers."""

import asyncio
import contextlib
import shutil
from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import StreamingResponse

from ... import models
from ...services.task_queue import create_background_task
from ...utils.progress import get_progress_manager
from .common import _copy_with_progress, _get_dir_size, router


@router.post("/models/migrate")
async def migrate_models(request: models.ModelMigrateRequest):
    """Move all downloaded models to a new directory with byte-level progress via SSE."""
    from huggingface_hub import constants as hf_constants

    from ...config import get_data_dir

    source = Path(hf_constants.HF_HUB_CACHE)
    destination = Path(request.destination)

    if not source.exists():
        raise HTTPException(status_code=404, detail="Current model cache directory not found")

    if source.resolve() == destination.resolve():
        raise HTTPException(status_code=400, detail="Source and destination are the same directory")

    if destination.resolve().is_relative_to(source.resolve()):
        raise HTTPException(status_code=400, detail="Destination cannot be inside the current cache directory")

    # Reject destinations outside the data directory (path traversal guard)
    data_dir = get_data_dir().resolve()
    if not destination.resolve().is_relative_to(data_dir):
        raise HTTPException(status_code=400, detail="Destination must be inside the data directory")

    progress_manager = get_progress_manager()
    model_dirs = [d for d in source.iterdir() if d.name.startswith("models--") and d.is_dir()]
    if not model_dirs:
        progress_manager.update_progress("migration", 1, 1, status="complete")
        progress_manager.mark_complete("migration")
        return {"moved": 0, "errors": [], "source": str(source), "destination": str(destination)}

    destination.mkdir(parents=True, exist_ok=True)

    same_fs = False
    with contextlib.suppress(OSError):
        same_fs = source.stat().st_dev == destination.stat().st_dev

    async def migrate_background():
        moved = 0
        errors = []
        try:
            if same_fs:
                # Report progress in bytes for consistent units with the cross-FS path.
                total_bytes = sum(_get_dir_size(d) for d in model_dirs)
                progress_manager.update_progress(
                    "migration", 0, total_bytes, filename="Calculating...", status="downloading"
                )
                copied = 0
                for item in model_dirs:
                    dest_item = destination / item.name
                    try:
                        if dest_item.exists():
                            shutil.rmtree(dest_item)
                        item_size = _get_dir_size(item)
                        shutil.move(str(item), str(dest_item))
                        copied += item_size
                        moved += 1
                        progress_manager.update_progress(
                            "migration",
                            copied,
                            total_bytes,
                            filename=item.name,
                            status="downloading",
                        )
                    except Exception as e:
                        errors.append(f"{item.name}: {e!s}")
            else:
                total_bytes = sum(_get_dir_size(d) for d in model_dirs)
                progress_manager.update_progress(
                    "migration", 0, total_bytes, filename="Calculating...", status="downloading"
                )

                copied = 0
                for item in model_dirs:
                    dest_item = destination / item.name
                    try:
                        if dest_item.exists():
                            shutil.rmtree(dest_item)
                        copied = await asyncio.to_thread(
                            _copy_with_progress, item, dest_item, progress_manager, copied, total_bytes
                        )
                        await asyncio.to_thread(shutil.rmtree, str(item))
                        moved += 1
                    except Exception as e:
                        errors.append(f"{item.name}: {e!s}")

            progress_manager.update_progress("migration", 1, 1, status="complete")
            progress_manager.mark_complete("migration")
        except Exception as e:
            progress_manager.update_progress("migration", 0, 0, status="error")
            progress_manager.mark_error("migration", str(e))

    create_background_task(migrate_background())

    return {"source": str(source), "destination": str(destination), "moved": len(model_dirs)}


@router.get("/models/migrate/progress")
async def get_migration_progress():
    """Get model migration progress via Server-Sent Events."""
    progress_manager = get_progress_manager()

    async def event_generator():
        async for event in progress_manager.subscribe("migration"):
            yield event

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
