"""
Configuration module for otoyin backend.

Handles data directory configuration for production bundling
and server URL resolution for internal API calls.
"""

import logging
import os
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

# --- Server URL configuration ---
# Centralized host/port resolution for internal API calls.
# All services that need to call the REST API should use
# config.get_server_base_url() rather than hardcoding URLs.
#
# Rebrand note: every setting reads ``OTOYIN_*`` first and falls back to
# the legacy ``TWENTYLABS_*`` name so existing .env files keep working.


def _env(new_name: str, old_name: str, default: str = "") -> str:
    """Read ``OTOYIN_*`` with fallback to the legacy ``TWENTYLABS_*`` name."""
    return os.environ.get(new_name) or os.environ.get(old_name, default)


_DEFAULT_HOST = "127.0.0.1"
_DEFAULT_PORT = 17493
DEFAULT_TTS_ENGINE = ""
DEFAULT_MUSIC_ENGINE = "stable_audio"
DEFAULT_STT_ENGINE = "whisper"
DEFAULT_LLM_ENGINE = "gguf_llm"

# Configurable limits (env-overridable)
PROFILE_SAMPLE_MAX_FILE_SIZE = (
    int(_env("OTOYIN_PROFILE_SAMPLE_MAX_MB", "TWENTYLABS_PROFILE_SAMPLE_MAX_MB", "50")) * 1024 * 1024
)
IMPORT_AUDIO_MAX_BYTES = int(_env("OTOYIN_IMPORT_MAX_MB", "TWENTYLABS_IMPORT_MAX_MB", "200")) * 1024 * 1024
PROFILE_MAX_FILE_SIZE = int(_env("OTOYIN_PROFILE_MAX_MB", "TWENTYLABS_PROFILE_MAX_MB", "100")) * 1024 * 1024
HISTORY_IMPORT_MAX_FILE_SIZE = (
    int(_env("OTOYIN_HISTORY_IMPORT_MAX_MB", "TWENTYLABS_HISTORY_IMPORT_MAX_MB", "50")) * 1024 * 1024
)
IMAGE_MAX_FILE_SIZE = int(_env("OTOYIN_IMAGE_MAX_MB", "TWENTYLABS_IMAGE_MAX_MB", "5")) * 1024 * 1024


@dataclass(frozen=True)
class AppConfig:
    """Typed, immutable configuration snapshot.

    Constructed once via ``AppConfig.from_env()`` and passed where needed.
    The existing module-level getter functions remain for backward compat.
    """

    host: str = field(default_factory=lambda: _env("OTOYIN_HOST", "TWENTYLABS_HOST", _DEFAULT_HOST))
    port: int = field(default_factory=lambda: int(_env("OTOYIN_PORT", "TWENTYLABS_PORT", str(_DEFAULT_PORT))))
    data_dir: Path = field(default_factory=lambda: Path("data").resolve())
    default_tts_engine: str = DEFAULT_TTS_ENGINE
    default_music_engine: str = DEFAULT_MUSIC_ENGINE
    default_stt_engine: str = DEFAULT_STT_ENGINE
    default_llm_engine: str = DEFAULT_LLM_ENGINE
    profile_sample_max_bytes: int = PROFILE_SAMPLE_MAX_FILE_SIZE
    import_audio_max_bytes: int = IMPORT_AUDIO_MAX_BYTES
    profile_max_bytes: int = PROFILE_MAX_FILE_SIZE
    history_import_max_bytes: int = HISTORY_IMPORT_MAX_FILE_SIZE
    image_max_bytes: int = IMAGE_MAX_FILE_SIZE

    @classmethod
    def from_env(cls) -> "AppConfig":
        """Build an AppConfig from environment variables and defaults."""
        return cls()

    @property
    def base_url(self) -> str:
        return f"http://{self.host}:{self.port}"


def get_server_host() -> str:
    """Return the server host (env override or default)."""
    return _env("OTOYIN_HOST", "TWENTYLABS_HOST", _DEFAULT_HOST)


def get_server_port() -> int:
    """Return the server port (env override or default)."""
    return int(_env("OTOYIN_PORT", "TWENTYLABS_PORT", str(_DEFAULT_PORT)))


def get_server_base_url() -> str:
    """Return ``http://<host>:<port>`` for internal REST API calls."""
    return f"http://{get_server_host()}:{get_server_port()}"


# --- Data directory configuration ---

# Allow users to override the HuggingFace model download directory.
# Set OTOYIN_MODELS_DIR (legacy: TWENTYLABS_MODELS_DIR) to an absolute path
# before starting the server.
# This sets HF_HUB_CACHE so all huggingface_hub downloads go to that path.
_custom_models_dir = _env("OTOYIN_MODELS_DIR", "TWENTYLABS_MODELS_DIR")
if _custom_models_dir:
    os.environ["HF_HUB_CACHE"] = _custom_models_dir
    logger.info("Model download path set to: %s", _custom_models_dir)

# Default data directory (used in development)
_data_dir = Path("data").resolve()


def _path_relative_to_any_data_dir(path: Path) -> Path | None:
    """Extract the path within a data dir from an absolute or relative path."""
    parts = path.parts
    for idx, part in enumerate(parts):
        if part != "data":
            continue

        tail = parts[idx + 1 :]
        if tail:
            return Path(*tail)
        return Path()

    return None


def set_data_dir(path: str | Path):
    """
    Set the data directory path.

    Args:
        path: Path to the data directory
    """
    global _data_dir
    _data_dir = Path(path).resolve()
    _data_dir.mkdir(parents=True, exist_ok=True)
    logger.info("Data directory set to: %s", _data_dir)


def get_data_dir() -> Path:
    """
    Get the data directory path.

    Returns:
        Path to the data directory
    """
    return _data_dir


def to_storage_path(path: str | Path) -> str:
    """Convert a filesystem path to a DB-safe path relative to the data dir."""
    resolved_path = Path(path).resolve()

    relative_to_any_data_dir = _path_relative_to_any_data_dir(resolved_path)
    if relative_to_any_data_dir is not None:
        return str(relative_to_any_data_dir)

    try:
        return str(resolved_path.relative_to(_data_dir))
    except ValueError:
        return str(resolved_path)


def _reject_traversal(path: str) -> None:
    """Raise ValueError if path contains traversal components."""
    normalized = Path(path)
    parts = normalized.parts
    if ".." in parts:
        raise ValueError(f"Path traversal not allowed: {path}")


def resolve_storage_path(path: str | Path | None) -> Path | None:
    """Resolve a DB-stored path against the configured data dir.

    Rejects path traversal (``..``) components and ensures the resolved
    path stays within the data directory or system temp directory.
    """
    if path is None:
        return None

    _reject_traversal(str(path))

    stored_path = Path(path)
    if stored_path.is_absolute():
        rebased_path = _path_relative_to_any_data_dir(stored_path)
        if rebased_path is not None:
            candidate = (_data_dir / rebased_path).resolve()
            # Containment check — reject symlink escape
            if not candidate.is_relative_to(_data_dir.resolve()):
                return None
            if candidate.exists() or not stored_path.exists():
                return candidate

        # Only allow absolute paths under the data dir or system temp directory.
        resolved = stored_path.resolve()
        temp_dir = Path(tempfile.gettempdir()).resolve()
        if (resolved.is_relative_to(_data_dir.resolve()) or resolved.is_relative_to(temp_dir)) and resolved.exists():
            return resolved
        return None

    # 0.3.0 records sometimes stored relative paths with the data-dir name
    # baked in (e.g. "data/profiles/..."). Joining those directly with
    # _data_dir produces a spurious "<data_dir>/data/profiles/..." nest.
    if stored_path.parts and stored_path.parts[0] == "data":
        stored_path = Path(*stored_path.parts[1:]) if len(stored_path.parts) > 1 else Path()

    candidate = (_data_dir / stored_path).resolve()
    # Containment check — symlink inside data_dir that points outside must be rejected
    if not candidate.is_relative_to(_data_dir.resolve()):
        return None
    return candidate


def get_db_path() -> Path:
    """Get database file path."""
    return _data_dir / "otoyin.db"


def get_profiles_dir() -> Path:
    """Get profiles directory path."""
    path = _data_dir / "profiles"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_generations_dir() -> Path:
    """Get generations directory path."""
    path = _data_dir / "generations"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_captures_dir() -> Path:
    """Get captures directory path."""
    path = _data_dir / "captures"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_exports_dir() -> Path:
    """Get exports directory path."""
    path = _data_dir / "exports"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_plugins_dir() -> Path:
    """Get the marketplace plugin install root."""
    path = _data_dir / "plugins"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_adr_dir() -> Path:
    """Get ADR audio files directory path."""
    path = _data_dir / "adr"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_cache_dir() -> Path:
    """Get cache directory path."""
    path = _data_dir / "cache"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_models_dir() -> Path:
    """Get models directory path."""
    path = _data_dir / "models"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_downloads_dir() -> Path:
    """Get downloads directory for YouTube/URL imports."""
    path = _data_dir / "downloads"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_projects_dir() -> Path:
    """Get the root directory holding per-project workspaces."""
    path = _data_dir / "projects"
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_assets_dir() -> Path:
    """Get directory for acquired library assets (Freesound / Poly Haven)."""
    path = _data_dir / "assets"
    path.mkdir(parents=True, exist_ok=True)
    return path
