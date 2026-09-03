"""Script parser: split chapter text into utterances by ^Name: lines."""

from __future__ import annotations

import re

# Matches "Alice: hello" or "NARRATOR: ..." at start of line
_NAME_RE = re.compile(r"^\s*([A-Za-z][\w \-\']{1,40})\s*:\s*(.+)\s*$")


def parse_script(text: str) -> list[dict]:
    """Parse script text into [{character, text}] by ^Name:.

    - Lines matching `Name: utterance` become that character's line.
    - Consecutive non-matching lines are appended to previous utterance's text.
    - If no Name: lines at all, returns single Narrator utterance with full text.
    - Preserves order; strips surrounding whitespace; ignores empty lines.
    """
    if not text or not text.strip():
        return []

    lines = text.splitlines()
    utterances: list[dict] = []
    has_any_name = any(_NAME_RE.match(line) for line in lines)

    if not has_any_name:
        # Treat whole chapter as Narrator prose (still chunked later by TTS)
        cleaned = text.strip()
        return [{"character": "Narrator", "text": cleaned}] if cleaned else []

    current_char: str | None = None
    current_text_parts: list[str] = []

    def flush():
        nonlocal current_char, current_text_parts
        if current_char and current_text_parts:
            full = " ".join(current_text_parts).strip()
            if full:
                utterances.append({"character": current_char.strip(), "text": full})
        current_text_parts = []
        current_char = None

    for raw in lines:
        if not raw.strip():
            continue
        m = _NAME_RE.match(raw)
        if m:
            # new speaker — flush previous
            if current_char:
                flush()
            current_char = m.group(1)
            current_text_parts = [m.group(2).strip()]
        else:
            # continuation line: append to current utterance if exists, else Narrator
            if current_char:
                current_text_parts.append(raw.strip())
            else:
                # leading prose before any Name: — assign to Narrator
                current_char = "Narrator"
                current_text_parts = [raw.strip()]

    if current_char and current_text_parts:
        flush()

    # Fallback if parsing produced nothing
    if not utterances and text.strip():
        return [{"character": "Narrator", "text": text.strip()}]
    return utterances


def is_script_formatted(text: str) -> bool:
    """Return True if text looks like a multi-voice script (has Name: lines)."""
    lines = text.splitlines()
    hits = sum(1 for line in lines if _NAME_RE.match(line))
    return hits >= 2 or (hits == 1 and len(lines) > 2)
