"""Export an Audio Studio session to a Reaper project (.RPP) for DAW interchange.

Produces a minimal, valid Reaper project file that Reaper (and most DAWs that
import RPP) can open. Each Audio Studio track becomes a Reaper track with its
audio clip placed at the timeline origin. Non-destructive: only references the
existing audio files; never mutates the session.
"""

from .. import config


def _resolve_source(audio_url: str | None) -> str | None:
    if not audio_url:
        return None
    if audio_url.startswith(("blob:", "data:")):
        return None
    resolved = config.resolve_storage_path(audio_url)
    if resolved is not None and resolved.exists():
        return str(resolved)
    if audio_url.startswith(("http://", "https://")):
        return audio_url
    return audio_url


def build_reaper_project(session_data: dict, name: str = "TWENTYLABSSession") -> str:
    """Build Reaper .RPP text from a serialized Audio Studio session dict."""
    tracks = session_data.get("tracks", []) if isinstance(session_data, dict) else []
    master_volume = float(session_data.get("masterVolume", 1.0)) if isinstance(session_data, dict) else 1.0

    lines: list[str] = []
    lines.append('<REAPER_PROJECT 0.1 "6.0"')
    lines.append(f'  NAME "{name}"')
    lines.append("  <MASTERFXLIST")
    lines.append("  >")
    lines.append(f"  MASTVOL {master_volume:.6f}")

    for idx, track in enumerate(tracks, start=1):
        tname = track.get("name") or f"Track {idx}"
        volume = float(track.get("volume", 1.0))
        pan = float(track.get("pan", 0.0))
        muted = bool(track.get("muted", False))
        lines.append("  <TRACK")
        lines.append(f'    NAME "{tname}"')
        lines.append(f"    VOLPAN {volume:.6f} {pan:.6f} 0 0 0")
        if muted:
            lines.append("    MUTESOLO 1 0 0")
        source = _resolve_source(track.get("audioUrl"))
        if source:
            duration = float(track.get("duration", 0.0)) or 0.0
            length = max(duration, 0.001)
            lines.append("    <ITEM")
            lines.append("      POSITION 0.0")
            lines.append(f"      LENGTH {length:.6f}")
            lines.append("      <SOURCE WAVE")
            lines.append(f'        FILE "{source}"')
            lines.append("      >")
            lines.append("    >")
        lines.append("  >")

    lines.append(">")
    return "\n".join(lines) + "\n"
