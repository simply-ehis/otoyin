"""Platform defaults for capture hotkey chords (Windows)."""

from __future__ import annotations

PUSH_TO_TALK = ["ControlRight", "ShiftRight"]
TOGGLE_TO_TALK = ["ControlRight", "ShiftRight", "Space"]


def default_push_to_talk_chord() -> list[str]:
    return PUSH_TO_TALK.copy()


def default_toggle_to_talk_chord() -> list[str]:
    return TOGGLE_TO_TALK.copy()
