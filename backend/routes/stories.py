"""Story endpoints."""

import asyncio
import io

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .. import config, database, models
from ..database import get_db
from ..errors import (
    ERR_EMPTY_STORY,
    ERR_EXPORT_FAILED,
    ERR_FILE_TOO_LARGE_MB,
    ERR_IMPORT_FAILED,
    ERR_INVALID_REQUEST,
    ERR_INVALID_TIMECODE,
    ERR_STORY_EXPORT_FAILED,
    ERR_STORY_ITEM_NOT_FOUND,
    ERR_STORY_NOT_FOUND,
)
from ..services import export_import, stories
from ..utils.http import safe_content_disposition

router = APIRouter()


@router.get("/stories", response_model=list[models.StoryResponse])
async def list_stories(db: Session = Depends(get_db)):
    """List all stories."""
    return await stories.list_stories(db)


@router.post("/stories", response_model=models.StoryResponse)
async def create_story(
    data: models.StoryCreate,
    db: Session = Depends(get_db),
):
    """Create a new story."""
    try:
        return await stories.create_story(data, db)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/stories/{story_id}", response_model=models.StoryDetailResponse)
async def get_story(
    story_id: str,
    db: Session = Depends(get_db),
):
    """Get a story with all its items."""
    story = await stories.get_story(story_id, db)
    if not story:
        raise HTTPException(status_code=404, detail=ERR_STORY_NOT_FOUND)
    return story


@router.put("/stories/{story_id}", response_model=models.StoryResponse)
async def update_story(
    story_id: str,
    data: models.StoryCreate,
    db: Session = Depends(get_db),
):
    """Update a story."""
    story = await stories.update_story(story_id, data, db)
    if not story:
        raise HTTPException(status_code=404, detail=ERR_STORY_NOT_FOUND)
    return story


@router.delete("/stories/{story_id}")
async def delete_story(
    story_id: str,
    db: Session = Depends(get_db),
):
    """Delete a story."""
    success = await stories.delete_story(story_id, db)
    if not success:
        raise HTTPException(status_code=404, detail=ERR_STORY_NOT_FOUND)
    return {"message": "Story deleted successfully"}


@router.post("/stories/{story_id}/items", response_model=models.StoryItemDetail)
async def add_story_item(
    story_id: str,
    data: models.StoryItemCreate,
    db: Session = Depends(get_db),
):
    """Add a generation to a story."""
    item = await stories.add_item_to_story(story_id, data, db)
    if not item:
        raise HTTPException(status_code=404, detail=ERR_STORY_NOT_FOUND)
    return item


@router.delete("/stories/{story_id}/items/{item_id}")
async def remove_story_item(
    story_id: str,
    item_id: str,
    db: Session = Depends(get_db),
):
    """Remove a story item from a story."""
    success = await stories.remove_item_from_story(story_id, item_id, db)
    if not success:
        raise HTTPException(status_code=404, detail=ERR_STORY_ITEM_NOT_FOUND)
    return {"message": "Item removed successfully"}


@router.put("/stories/{story_id}/items/times")
async def update_story_item_times(
    story_id: str,
    data: models.StoryItemBatchUpdate,
    db: Session = Depends(get_db),
):
    """Update story item timecodes."""
    success = await stories.update_story_item_times(story_id, data, db)
    if not success:
        raise HTTPException(status_code=400, detail=ERR_INVALID_TIMECODE)
    return {"message": "Item timecodes updated successfully"}


@router.put("/stories/{story_id}/items/reorder", response_model=list[models.StoryItemDetail])
async def reorder_story_items(
    story_id: str,
    data: models.StoryItemReorder,
    db: Session = Depends(get_db),
):
    """Reorder story items and recalculate timecodes."""
    items = await stories.reorder_story_items(story_id, data.generation_ids, db)
    if items is None:
        raise HTTPException(status_code=400, detail=ERR_INVALID_REQUEST)
    return items


@router.put("/stories/{story_id}/items/{item_id}/move", response_model=models.StoryItemDetail)
async def move_story_item(
    story_id: str,
    item_id: str,
    data: models.StoryItemMove,
    db: Session = Depends(get_db),
):
    """Move a story item (update position and/or track)."""
    item = await stories.move_story_item(story_id, item_id, data, db)
    if item is None:
        raise HTTPException(status_code=404, detail=ERR_STORY_ITEM_NOT_FOUND)
    return item


@router.put("/stories/{story_id}/items/{item_id}/trim", response_model=models.StoryItemDetail)
async def trim_story_item(
    story_id: str,
    item_id: str,
    data: models.StoryItemTrim,
    db: Session = Depends(get_db),
):
    """Trim a story item."""
    item = await stories.trim_story_item(story_id, item_id, data, db)
    if item is None:
        raise HTTPException(status_code=404, detail=ERR_STORY_ITEM_NOT_FOUND)
    return item


@router.put("/stories/{story_id}/items/{item_id}/volume", response_model=models.StoryItemDetail)
async def update_story_item_volume(
    story_id: str,
    item_id: str,
    data: models.StoryItemVolumeUpdate,
    db: Session = Depends(get_db),
):
    """Set a story item's per-clip volume (linear gain, 0.0–2.0)."""
    item = await stories.update_story_item_volume(story_id, item_id, data, db)
    if item is None:
        raise HTTPException(status_code=404, detail=ERR_STORY_ITEM_NOT_FOUND)
    return item


@router.post("/stories/{story_id}/items/{item_id}/split", response_model=list[models.StoryItemDetail])
async def split_story_item(
    story_id: str,
    item_id: str,
    data: models.StoryItemSplit,
    db: Session = Depends(get_db),
):
    """Split a story item at a given time, creating two clips."""
    items = await stories.split_story_item(story_id, item_id, data, db)
    if items is None:
        raise HTTPException(status_code=404, detail=ERR_STORY_ITEM_NOT_FOUND)
    return items


@router.post("/stories/{story_id}/items/{item_id}/duplicate", response_model=models.StoryItemDetail)
async def duplicate_story_item(
    story_id: str,
    item_id: str,
    db: Session = Depends(get_db),
):
    """Duplicate a story item."""
    return await stories.duplicate_story_item(story_id, item_id, db)


@router.put("/stories/{story_id}/items/{item_id}/fade", response_model=models.StoryItemDetail)
async def set_story_item_fade(
    story_id: str,
    item_id: str,
    data: models.StoryItemFade,
    db: Session = Depends(get_db),
):
    """Set fade-in and fade-out durations for a story item (non-destructive)."""
    item = await stories.set_story_item_fade(story_id, item_id, data, db)
    if item is None:
        raise HTTPException(status_code=404, detail=ERR_STORY_ITEM_NOT_FOUND)
    return item


@router.put("/stories/{story_id}/items/{item_id}/gain", response_model=models.StoryItemDetail)
async def set_story_item_gain(
    story_id: str,
    item_id: str,
    data: models.StoryItemGain,
    db: Session = Depends(get_db),
):
    """Set gain in dB for a story item (non-destructive)."""
    item = await stories.set_story_item_gain(story_id, item_id, data, db)
    if item is None:
        raise HTTPException(status_code=404, detail=ERR_STORY_ITEM_NOT_FOUND)
    return item


@router.put("/stories/{story_id}/items/{item_id}/pan", response_model=models.StoryItemDetail)
async def set_story_item_pan(
    story_id: str,
    item_id: str,
    data: models.StoryItemPanUpdate,
    db: Session = Depends(get_db),
):
    """Set stereo pan position for a story item (non-destructive, -1.0 … 1.0)."""
    item = await stories.set_story_item_pan(story_id, item_id, data, db)
    if item is None:
        raise HTTPException(status_code=404, detail=ERR_STORY_ITEM_NOT_FOUND)
    return item


@router.post("/stories/{story_id}/items/{item_id}/normalize", response_model=models.StoryItemDetail)
async def normalize_story_item(
    story_id: str,
    item_id: str,
    data: models.StoryItemNormalize,
    db: Session = Depends(get_db),
):
    """Normalize a story item's audio to target LUFS (destructive, creates new version)."""
    item = await stories.normalize_story_item(story_id, item_id, data, db)
    if item is None:
        raise HTTPException(status_code=404, detail=ERR_STORY_ITEM_NOT_FOUND)
    return item


@router.post("/stories/{story_id}/items/{item_id}/reverse", response_model=models.StoryItemDetail)
async def reverse_story_item(
    story_id: str,
    item_id: str,
    db: Session = Depends(get_db),
):
    """Reverse a story item's audio (destructive, creates new version)."""
    item = await stories.reverse_story_item(story_id, item_id, db)
    if item is None:
        raise HTTPException(status_code=404, detail=ERR_STORY_ITEM_NOT_FOUND)
    return item


@router.post("/stories/{story_id}/items/{item_id}/silence-removal", response_model=models.StoryItemDetail)
async def remove_silence_from_story_item(
    story_id: str,
    item_id: str,
    db: Session = Depends(get_db),
):
    """Remove silence from a story item's audio (destructive, creates new version)."""
    item = await stories.remove_silence_from_story_item(story_id, item_id, db)
    if item is None:
        raise HTTPException(status_code=404, detail=ERR_STORY_ITEM_NOT_FOUND)
    return item


@router.put("/stories/{story_id}/items/{item_id}/version", response_model=models.StoryItemDetail)
async def set_story_item_version(
    story_id: str,
    item_id: str,
    data: models.StoryItemVersionUpdate,
    db: Session = Depends(get_db),
):
    """Pin a story item to a specific generation version."""
    item = await stories.set_story_item_version(story_id, item_id, data, db)
    if item is None:
        raise HTTPException(status_code=404, detail=ERR_STORY_ITEM_NOT_FOUND)
    return item


@router.post("/stories/{story_id}/items/merge", response_model=models.StoryItemDetail)
async def merge_story_items(
    story_id: str,
    data: models.StoryItemMerge,
    db: Session = Depends(get_db),
):
    """Render two items into one (first keeps position; second is removed)."""
    item = await stories.merge_story_items(story_id, data, db)
    if item is None:
        raise HTTPException(status_code=404, detail=ERR_STORY_ITEM_NOT_FOUND)
    return item


@router.put("/stories/{story_id}/items/{item_id}/speed", response_model=models.StoryItemDetail)
async def set_story_item_speed(
    story_id: str,
    item_id: str,
    data: models.StoryItemSpeed,
    db: Session = Depends(get_db),
):
    """Set non-destructive playback speed (0.25–4.0, constant pitch at mix)."""
    item = await stories.set_story_item_speed(story_id, item_id, data, db)
    if item is None:
        raise HTTPException(status_code=404, detail=ERR_STORY_ITEM_NOT_FOUND)
    return item


@router.post("/stories/{story_id}/match-loudness", response_model=list[models.StoryItemDetail])
async def match_story_loudness(
    story_id: str,
    data: models.StoryMatchLoudness,
    db: Session = Depends(get_db),
):
    """Pin every item's gain so all clips hit one loudness target."""
    items = await stories.match_story_loudness(story_id, data, db)
    if items is None:
        raise HTTPException(status_code=404, detail=ERR_STORY_NOT_FOUND)
    return items


@router.post("/stories/{story_id}/items/{item_id}/crossfade", response_model=list[models.StoryItemDetail])
async def crossfade_story_items(
    story_id: str,
    item_id: str,
    data: models.StoryItemCrossfade,
    db: Session = Depends(get_db),
):
    """Overlap the next item with complementary fades (blend, don't abut)."""
    items = await stories.crossfade_story_items(story_id, item_id, data, db)
    if items is None:
        raise HTTPException(status_code=404, detail=ERR_STORY_ITEM_NOT_FOUND)
    return items


@router.post("/stories/{story_id}/items/{item_id}/move-to-story", response_model=models.StoryItemDetail)
async def move_item_to_story(
    story_id: str,
    item_id: str,
    data: models.StoryItemMoveToStory,
    db: Session = Depends(get_db),
):
    """Move (or copy) an item into another story, appended at the end."""
    item = await stories.move_item_to_story(story_id, item_id, data, db)
    if item is None:
        raise HTTPException(status_code=404, detail=ERR_STORY_ITEM_NOT_FOUND)
    return item


@router.get("/stories/{story_id}/history-depth")
async def story_history_depth(
    story_id: str,
    db: Session = Depends(get_db),
):
    """Undo/redo stack sizes (drives button disabled states)."""
    return stories.history_depth(db, story_id)


@router.post("/stories/{story_id}/undo")
async def undo_story_edit(
    story_id: str,
    db: Session = Depends(get_db),
):
    """Rewind one edit step."""
    if not stories.undo(db, story_id):
        raise HTTPException(status_code=400, detail=ERR_INVALID_REQUEST)
    return {"message": "Undone"}


@router.post("/stories/{story_id}/redo")
async def redo_story_edit(
    story_id: str,
    db: Session = Depends(get_db),
):
    """Re-apply one undone edit step."""
    if not stories.redo(db, story_id):
        raise HTTPException(status_code=400, detail=ERR_INVALID_REQUEST)
    return {"message": "Redone"}


@router.get("/stories/{story_id}/export-audio")
async def export_story_audio(
    story_id: str,
    db: Session = Depends(get_db),
):
    """Export story as single mixed audio file."""
    try:
        story = db.query(database.Story).filter_by(id=story_id).first()
        if not story:
            raise HTTPException(status_code=404, detail=ERR_STORY_NOT_FOUND)

        audio_bytes = await stories.export_story_audio(story_id, db)
        if not audio_bytes:
            raise HTTPException(status_code=400, detail=ERR_EMPTY_STORY)

        safe_name = "".join(c for c in story.name if c.isalnum() or c in (" ", "-", "_")).strip()
        if not safe_name:
            safe_name = "story"
        filename = f"{safe_name}.wav"

        return StreamingResponse(
            io.BytesIO(audio_bytes),
            media_type="audio/wav",
            headers={"Content-Disposition": safe_content_disposition("attachment", filename)},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=ERR_STORY_EXPORT_FAILED) from e


@router.get("/stories/{story_id}/export")
async def export_story_archive(
    story_id: str,
    db: Session = Depends(get_db),
):
    """Export a story as a portable .dstf.zip archive.

    Self-contained: story record + items + generations + versions + audio
    + embedded voice profiles. Reimport with POST /stories/import.
    """
    story = db.query(database.Story).filter_by(id=story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail=ERR_STORY_NOT_FOUND)

    try:
        # DEFLATE-compressing every WAV takes seconds — off the event
        # loop or SSE keepalives, health checks and the generation queue
        # all stall behind it.
        zip_bytes = await asyncio.to_thread(export_import.export_story_to_zip, story_id, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=ERR_EXPORT_FAILED) from e

    safe_name = "".join(c for c in story.name if c.isalnum() or c in (" ", "-", "_")).strip()
    if not safe_name:
        safe_name = "story"
    filename = f"story-{safe_name}.dstf.zip"

    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={"Content-Disposition": safe_content_disposition("attachment", filename)},
    )


@router.post("/stories/import")
async def import_story_archive(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Import a story from a .dstf.zip archive.

    Every record gets a new local ID (no collisions); voice profiles match
    by name first and only then import the embedded copy.
    """
    content = await file.read()

    if len(content) > config.HISTORY_IMPORT_MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=ERR_FILE_TOO_LARGE_MB)

    try:
        return await export_import.import_story_from_zip(content, db)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=ERR_IMPORT_FAILED) from e


@router.get("/stories/{story_id}/export-epub")
async def export_story_epub(
    story_id: str,
    db: Session = Depends(get_db),
):
    """Export a story as EPUB for e-readers."""
    from ..services.story_export import export_story_to_epub

    story = db.query(database.Story).filter_by(id=story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail=ERR_STORY_NOT_FOUND)

    # Build story data with items
    items = db.query(database.StoryItem).filter_by(story_id=story_id).order_by(database.StoryItem.order).all()
    story_data = {
        "title": story.name,
        "author": getattr(story, "author", None),
        "items": [
            {
                "title": item.name or f"Chapter {idx + 1}",
                "text": item.text or "",
            }
            for idx, item in enumerate(items)
        ],
    }

    try:
        epub_bytes = export_story_to_epub(story_id, story_data, db)
    except RuntimeError as e:
        raise HTTPException(status_code=501, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"EPUB export failed: {e}") from e

    safe_name = "".join(c for c in story.name if c.isalnum() or c in (" ", "-", "_")).strip()
    if not safe_name:
        safe_name = "story"
    filename = f"story-{safe_name}.epub"

    return StreamingResponse(
        io.BytesIO(epub_bytes),
        media_type="application/epub+zip",
        headers={"Content-Disposition": safe_content_disposition("attachment", filename)},
    )


@router.get("/stories/{story_id}/export-pdf")
async def export_story_pdf(
    story_id: str,
    db: Session = Depends(get_db),
):
    """Export a story as PDF for printing/sharing."""
    from ..services.story_export import export_story_to_pdf

    story = db.query(database.Story).filter_by(id=story_id).first()
    if not story:
        raise HTTPException(status_code=404, detail=ERR_STORY_NOT_FOUND)

    items = db.query(database.StoryItem).filter_by(story_id=story_id).order_by(database.StoryItem.order).all()
    story_data = {
        "title": story.name,
        "author": getattr(story, "author", None),
        "items": [
            {
                "title": item.name or f"Chapter {idx + 1}",
                "text": item.text or "",
            }
            for idx, item in enumerate(items)
        ],
    }

    try:
        pdf_bytes = export_story_to_pdf(story_id, story_data, db)
    except RuntimeError as e:
        raise HTTPException(status_code=501, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF export failed: {e}") from e

    safe_name = "".join(c for c in story.name if c.isalnum() or c in (" ", "-", "_")).strip()
    if not safe_name:
        safe_name = "story"
    filename = f"story-{safe_name}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": safe_content_disposition("attachment", filename)},
    )
