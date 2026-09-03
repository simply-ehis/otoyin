"""URL building and path validation for tool execution.

Extracted from execution.py to isolate URL templating logic from HTTP dispatch.
"""

from __future__ import annotations

import os
import re
from typing import Any

_PARAM_RE = re.compile(r"\{([^}]+)\}")

# Argument keys whose values are filesystem paths. These are sanitized before
# dispatch to block path traversal / absolute-path / URL-scheme injection.
PATH_ARG_KEYS = {
    "audio_path",
    "audio_path_a",
    "audio_path_b",
    "path",
    "file_path",
    "input_path",
    "output_path",
    "music_path",
    "session_path",
    "guide_path",
    "script_path",
    "target_path",
    "clip_path",
    "sample_path",
}


def build_url(endpoint: str, args: dict) -> str:
    """Substitute {param} placeholders from args; remove them from the body.

    Percent-encodes values so a crafted id containing '/' or '..' cannot
    retarget the request to a different endpoint.
    """
    from urllib.parse import quote

    def _replace(match: re.Match) -> str:
        key = match.group(1)
        value = args.pop(key, None)
        if value is None:
            return match.group(0)
        return quote(str(value), safe="")

    return _PARAM_RE.sub(_replace, endpoint)


def validate_paths(args: dict) -> str | None:
    """Validate path-like arguments in args. Returns error string or None.

    Checks for:
    - URL schemes (file://, http://, etc.)
    - UNC/network paths (//server/share)
    - Absolute paths (/path or C:\\path)
    - Path traversal (../)
    """
    for key in PATH_ARG_KEYS:
        value = args.get(key)
        if not isinstance(value, str) or not value:
            continue
        result = _sanitize_path_value(key, value)
        if result is None:
            continue
        if result.startswith("Invalid "):
            return result
        args[key] = result

    nested_err = _scan_paths(args)
    if nested_err:
        return nested_err

    return None


def _sanitize_path_value(key: str, value: str) -> str | None:
    """Sanitize a single path value. Returns sanitized value, error, or None."""
    if not isinstance(value, str) or not value:
        return None
    if re.search(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", value):
        return f"Invalid {key}: URL schemes are not allowed"
    if value.startswith(("\\\\", "//")):
        return f"Invalid {key}: UNC/network paths are not allowed"
    if value.startswith("/") or re.match(r"^[a-zA-Z]:[\\/]", value):
        return f"Invalid {key}: absolute paths are not allowed"
    if re.search(r"(^|[\\/])\.\.([\\/]|$)", value):
        return f"Invalid {key}: path traversal ('..') is not allowed"
    safe = os.path.normpath(value).lstrip(".\\" + os.sep)
    if safe.startswith("/") or ".." in safe.split("/") or ".." in safe.split("\\"):
        return f"Invalid {key}: path traversal detected"
    return safe


def _scan_paths(obj: Any, path_ctx: str = "") -> str | None:
    """Recursively scan nested dicts/lists for path values that need sanitization."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            full_key = f"{path_ctx}.{k}" if path_ctx else k
            if isinstance(v, (dict, list)):
                err = _scan_paths(v, full_key)
                if err:
                    return err
            elif k in PATH_ARG_KEYS and isinstance(v, str):
                result = _sanitize_path_value(full_key, v)
                if isinstance(result, str) and result.startswith("Invalid "):
                    return result
                if isinstance(result, str):
                    obj[k] = result
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            err = _scan_paths(item, f"{path_ctx}[{i}]")
            if err:
                return err
    return None


def check_unresolved_params(endpoint: str, args: dict) -> str | None:
    """Check that no unresolved {placeholders} remain after URL building."""
    unresolved = _PARAM_RE.findall(endpoint)
    missing = [p for p in unresolved if p not in args]
    if missing:
        return f"Missing required argument: {', '.join(missing)}"
    return None
