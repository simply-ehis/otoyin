"""Keyboard shortcuts system with customizable keymaps."""

from dataclasses import dataclass, field


@dataclass
class Shortcut:
    id: str
    action: str
    category: str
    keys: str
    description: str
    enabled: bool = True


@dataclass
class Keymap:
    name: str
    description: str
    shortcuts: list[Shortcut] = field(default_factory=list)


def get_premiere_pro_keymap() -> Keymap:
    return Keymap(
        name="Premiere Pro",
        description="Adobe Premiere Pro shortcuts",
        shortcuts=[
            Shortcut("pp-split", "split", "Timeline", "C", "Razor tool"),
            Shortcut("pp-select", "select", "Timeline", "V", "Selection tool"),
            Shortcut("pp-trim", "trim", "Timeline", "B", "Rolling Edit"),
            Shortcut("pp-ripple-delete", "ripple_delete", "Timeline", "Shift+Delete", "Ripple delete"),
            Shortcut("pp-nudge-left", "nudge_left", "Timeline", ",", "Nudge left 1 frame"),
            Shortcut("pp-nudge-right", "nudge_right", "Timeline", ".", "Nudge right 1 frame"),
            Shortcut("pp-play", "play_pause", "Transport", "Space", "Play/Pause"),
            Shortcut("pp-jog", "jog", "Transport", "J/K/L", "Rewind/Stop/Forward"),
            Shortcut("pp-mark-in", "mark_in", "Transport", "I", "Set in point"),
            Shortcut("pp-mark-out", "mark_out", "Transport", "O", "Set out point"),
            Shortcut("pp-undo", "undo", "Edit", "Cmd+Z", "Undo"),
            Shortcut("pp-redo", "redo", "Edit", "Cmd+Shift+Z", "Redo"),
            Shortcut("pp-save", "save", "File", "Cmd+S", "Save project"),
            Shortcut("pp-export", "export", "File", "Cmd+Shift+E", "Export"),
        ],
    )


def get_davinci_keymap() -> Keymap:
    return Keymap(
        name="DaVinci Resolve",
        description="Blackmagic DaVinci Resolve shortcuts",
        shortcuts=[
            Shortcut("dr-split", "split", "Timeline", "Ctrl+\\", "Blade"),
            Shortcut("dr-select", "select", "Timeline", "A", "Selection mode"),
            Shortcut("dr-trim", "trim", "Timeline", "T", "Trim mode"),
            Shortcut("dr-delete", "delete", "Timeline", "Backspace", "Delete"),
            Shortcut("dr-nudge-left", "nudge_left", "Timeline", "Alt+←", "Nudge left"),
            Shortcut("dr-nudge-right", "nudge_right", "Timeline", "Alt+→", "Nudge right"),
            Shortcut("dr-play", "play_pause", "Transport", "Space", "Play/Stop"),
            Shortcut("dr-jog", "jog", "Transport", "J/K/L", "Shuttle"),
            Shortcut("dr-undo", "undo", "Edit", "Cmd+Z", "Undo"),
            Shortcut("dr-redo", "redo", "Edit", "Cmd+Shift+Z", "Redo"),
            Shortcut("dr-save", "save", "File", "Cmd+S", "Save"),
        ],
    )


def get_protools_keymap() -> Keymap:
    return Keymap(
        name="Pro Tools",
        description="Avid Pro Tools shortcuts",
        shortcuts=[
            Shortcut("pt-split", "split", "Timeline", "B", "Separate clip"),
            Shortcut("pt-select", "select", "Timeline", "A", "Selector tool"),
            Shortcut("pt-trim", "trim", "Timeline", "T", "Trimmer tool"),
            Shortcut("pt-grab", "grab", "Timeline", "Grabber", "Grabber tool"),
            Shortcut("pt-play", "play_pause", "Transport", "Space", "Play/Stop"),
            Shortcut("pt-record", "record", "Transport", "Ctrl+Space", "Record enable"),
            Shortcut("pt-undo", "undo", "Edit", "Cmd+Z", "Undo"),
            Shortcut("pt-save", "save", "File", "Cmd+S", "Save session"),
        ],
    )


def get_twentylabs_keymap() -> Keymap:
    return Keymap(
        name="otoyin",
        description="Default otoyin shortcuts",
        shortcuts=[
            Shortcut("ds-play", "play_pause", "Transport", "Space", "Play/Pause"),
            Shortcut("ds-stop", "stop", "Transport", "Escape", "Stop"),
            Shortcut("ds-split", "split", "Timeline", "S", "Split at playhead"),
            Shortcut("ds-duplicate", "duplicate", "Timeline", "Cmd/Ctrl+D", "Duplicate clip"),
            Shortcut("ds-delete", "delete", "Timeline", "Delete", "Delete clip"),
            Shortcut("ds-nudge-left", "nudge_left", "Timeline", "Alt+←", "Nudge clip left"),
            Shortcut("ds-nudge-right", "nudge_right", "Timeline", "Alt+→", "Nudge clip right"),
            Shortcut("ds-zoom-in", "zoom_in", "View", "Cmd/Ctrl+=", "Zoom in"),
            Shortcut("ds-zoom-out", "zoom_out", "View", "Cmd/Ctrl+-", "Zoom out"),
            Shortcut("ds-undo", "undo", "Edit", "Cmd/Ctrl+Z", "Undo"),
            Shortcut("ds-redo", "redo", "Edit", "Cmd/Ctrl+Shift+Z", "Redo"),
            Shortcut("ds-save", "save", "File", "Cmd/Ctrl+S", "Save session"),
            Shortcut("ds-export", "export", "File", "Cmd/Ctrl+Shift+E", "Export"),
            Shortcut("ds-new-project", "new_project", "File", "Cmd/Ctrl+N", "New project"),
            Shortcut("ds-open-project", "open_project", "File", "Cmd/Ctrl+O", "Open project"),
        ],
    )


ALL_KEYMAPS = {
    "21labs": get_twentylabs_keymap,
    "premiere-pro": get_premiere_pro_keymap,
    "davinci-resolve": get_davinci_keymap,
    "pro-tools": get_protools_keymap,
}


def get_keymap(name: str) -> Keymap | None:
    factory = ALL_KEYMAPS.get(name)
    return factory() if factory else None


def list_keymaps() -> list[dict]:
    return [{"id": k, "name": v().name, "description": v().description} for k, v in ALL_KEYMAPS.items()]
