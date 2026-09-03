"""
Story management package.

Re-exports the public story service functions so that existing imports such as
``from ..services import stories`` and ``stories.list_stories`` keep working
after the module was split into submodules.
"""

from .crud import (
    add_item_to_story,
    create_story,
    delete_story,
    get_story,
    list_stories,
    move_story_item,
    remove_item_from_story,
    update_story,
)
from .editing import (
    duplicate_story_item,
    reorder_story_items,
    set_story_item_fade,
    set_story_item_gain,
    set_story_item_pan,
    set_story_item_version,
    split_story_item,
    trim_story_item,
    update_story_item_times,
    update_story_item_volume,
)
from .helpers import (
    _apply_fade,
    _build_item_detail,
    _create_version,
    _get_audio_path_for_item,
)
from .processing import (
    export_story_audio,
    normalize_story_item,
    remove_silence_from_story_item,
    reverse_story_item,
)

__all__ = [
    "add_item_to_story",
    "create_story",
    "delete_story",
    "duplicate_story_item",
    "export_story_audio",
    "get_story",
    "list_stories",
    "move_story_item",
    "normalize_story_item",
    "remove_item_from_story",
    "remove_silence_from_story_item",
    "reorder_story_items",
    "reverse_story_item",
    "set_story_item_fade",
    "set_story_item_gain",
    "set_story_item_pan",
    "set_story_item_version",
    "split_story_item",
    "trim_story_item",
    "update_story",
    "update_story_item_times",
    "update_story_item_volume",
]
