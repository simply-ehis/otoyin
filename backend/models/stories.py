"""
Story and songwriter models — story CRUD, item operations, and song drafts.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .generation import GenerationVersionResponse


class StoryCreate(BaseModel):
    """Request model for creating a story."""

    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)


class StoryResponse(BaseModel):
    """Response model for story (list view)."""

    id: str
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    item_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class StoryItemDetail(BaseModel):
    """Detail model for story item with generation info."""

    id: str
    story_id: str
    generation_id: str
    version_id: str | None = None
    start_time_ms: int
    track: int = 0
    trim_start_ms: int = 0
    trim_end_ms: int = 0
    created_at: datetime
    # Generation details
    profile_id: str
    profile_name: str
    text: str
    language: str
    audio_path: str
    duration: float
    seed: int | None
    instruct: str | None
    engine: str | None = None
    volume: float = 1.0
    fade_in_ms: int = 0
    fade_out_ms: int = 0
    gain_db: float = 0.0
    pan: float = 0.0
    speed: float = 1.0
    generation_created_at: datetime
    # Versions available for this generation
    versions: list[GenerationVersionResponse] | None = None
    active_version_id: str | None = None

    model_config = ConfigDict(from_attributes=True)


class StoryDetailResponse(BaseModel):
    """Response model for story with items."""

    id: str
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    items: list[StoryItemDetail] = []

    model_config = ConfigDict(from_attributes=True)


class StoryItemCreate(BaseModel):
    """Request model for adding a generation to a story."""

    generation_id: str
    start_time_ms: int | None = None  # If not provided, will be calculated automatically
    track: int | None = 0  # Track number (0 = main track)
    pan: float = 0.0  # Stereo position: -1.0 (full left) … 0.0 (center) … 1.0 (full right)


class StoryItemPanUpdate(BaseModel):
    """Request model for setting a story item's stereo pan position."""

    pan: float = Field(..., ge=-1.0, le=1.0)


class StoryItemUpdateTime(BaseModel):
    """Request model for updating a story item's timecode."""

    generation_id: str
    start_time_ms: int = Field(..., ge=0)


class StoryItemBatchUpdate(BaseModel):
    """Request model for batch updating story item timecodes."""

    updates: list[StoryItemUpdateTime]


class StoryItemReorder(BaseModel):
    """Request model for reordering story items."""

    generation_ids: list[str] = Field(..., min_length=1)


class StoryItemMove(BaseModel):
    """Request model for moving a story item (position and/or track)."""

    start_time_ms: int = Field(..., ge=0)
    track: int = 0


class StoryItemTrim(BaseModel):
    """Request model for trimming a story item."""

    trim_start_ms: int = Field(..., ge=0)
    trim_end_ms: int = Field(..., ge=0)


class StoryItemSplit(BaseModel):
    """Request model for splitting a story item."""

    split_time_ms: int = Field(..., ge=0)  # Time within the clip to split at (relative to clip start)


class StoryItemVersionUpdate(BaseModel):
    """Request model for setting a story item's pinned version."""

    version_id: str | None = None  # null = use generation default


class StoryItemVolumeUpdate(BaseModel):
    """Request model for adjusting a story item's playback volume.

    Linear gain. ``1.0`` is the original level, ``0.0`` is silent. Capped
    above 1.0 so a too-aggressive boost can't blow out the mix or clip
    the export.
    """

    volume: float = Field(..., ge=0.0, le=2.0)


class StoryItemFade(BaseModel):
    """Request model for setting fade-in and fade-out durations."""

    fade_in_ms: int = Field(..., ge=0)
    fade_out_ms: int = Field(..., ge=0)


class StoryItemGain(BaseModel):
    """Request model for applying gain in dB to a story item."""

    gain_db: float = Field(..., ge=-24.0, le=24.0)


class StoryItemNormalize(BaseModel):
    """Request model for normalizing a story item to a target LUFS level."""

    target_lufs: float = Field(default=-14.0, ge=-30.0, le=0.0)


class StoryItemMerge(BaseModel):
    """Request model for merging two adjacent story items into one."""

    first_item_id: str
    second_item_id: str


class StoryItemSpeed(BaseModel):
    """Request model for non-destructive per-item playback speed.

    ``1.0`` is original speed; ``> 1`` plays faster (shorter), ``< 1``
    slower (longer), applied at mix time with constant pitch.
    """

    speed: float = Field(..., ge=0.25, le=4.0)


class StoryMatchLoudness(BaseModel):
    """Request model for matching every item in a story to one loudness."""

    target_lufs: float = Field(default=-16.0, ge=-30.0, le=0.0)


class StoryItemCrossfade(BaseModel):
    """Request model for an overlap crossfade into the next item.

    Sets this item's fade-out, the next item's fade-in, and overlaps the
    next item's start by ``duration_ms`` so they blend instead of abutting.
    """

    next_item_id: str
    duration_ms: int = Field(..., ge=50, le=10000)


class StoryItemMoveToStory(BaseModel):
    """Request model for moving (or copying) an item into another story."""

    target_story_id: str
    as_copy: bool = False


class SongDraftPayload(BaseModel):
    """Songwriter draft body (mirrors Resonant's SongwritingDraft)."""

    model_config = ConfigDict(populate_by_name=True)

    language: str = "en"
    title: str = ""
    idea: str = ""
    hook: str = ""
    point_of_view: str = Field(default="first-person", alias="pointOfView")
    tense: str = "present"
    mood: str = ""
    genre: str = ""
    audience: str = ""
    imagery: str = ""
    style_prompt: str = Field(default="", alias="stylePrompt")
    lyrics: str = ""


class SongDraftCreate(BaseModel):
    """Request model for creating/updating a songwriter draft."""

    title: str = Field(default="", max_length=200)
    language: str = Field(default="en", max_length=16)
    draft: SongDraftPayload = Field(default_factory=SongDraftPayload)


class SongDraftResponse(BaseModel):
    """Response model for a songwriter draft."""

    id: str
    title: str
    language: str
    draft: SongDraftPayload
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
