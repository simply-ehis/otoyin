"""Shared ONNX model-file resolver.

The app's own ``data/models/`` folder is the source of truth — the
HuggingFace cache is never read as a fallback. When a model is
installed from HF it is copied into the app folder and the cache entry
is cleared, so the cache is a transient download buffer only.
"""

import contextlib
import logging
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)


def _app_model_path(repo_id: str, filename: str) -> Path:
    """Path inside the app's own models folder for a repo file."""
    from .. import config as cfg_mod

    slug = repo_id.replace("/", "--")
    return cfg_mod.get_models_dir() / slug / filename


def _clear_cache_entry(cached_file: Path) -> None:
    """Remove a downloaded file AND its blob from the HF cache (best effort).

    ``hf_hub_download`` returns a snapshot symlink; unlinking only it
    leaves the content-addressed blob behind, so resolve and delete the
    target too. Empty parent dirs are pruned up to (not including) the
    cache root itself.
    """
    try:
        from huggingface_hub import constants as hf_constants

        cache_root = Path(hf_constants.HF_HUB_CACHE)
        target = cached_file.resolve() if cached_file.is_symlink() else None
        cached_file.unlink(missing_ok=True)
        if target is not None and target != cached_file and cache_root in target.parents:
            with contextlib.suppress(OSError):
                target.unlink(missing_ok=True)
        for parent in cached_file.parents:
            if parent == cache_root:
                break
            try:
                parent.rmdir()  # only succeeds when empty
            except OSError:
                break
    except Exception:
        logger.debug("Cache cleanup skipped for %s", cached_file, exc_info=True)


def clear_hf_repo_cache(repo_id: str) -> None:
    """Delete a whole repo from the HF cache (best effort).

    Called after a model is installed into the app folder so the cache
    holds no copy. The app never reads the HF cache as a fallback.
    """
    try:
        from huggingface_hub import constants as hf_constants

        repo_cache = Path(hf_constants.HF_HUB_CACHE) / ("models--" + repo_id.replace("/", "--"))
        if repo_cache.is_dir():
            shutil.rmtree(repo_cache, ignore_errors=True)
            logger.info("Cleared HF cache for %s", repo_id)
    except Exception:
        logger.debug("Repo cache cleanup skipped for %s", repo_id, exc_info=True)


def app_snapshot_dir(repo_id: str) -> Path:
    """App-folder home of a whole-repo install (data/models/<slug>/)."""
    from .. import config as cfg_mod

    return cfg_mod.get_models_dir() / repo_id.replace("/", "--")


_WEIGHT_PATTERNS = ("*.bin", "*.safetensors", "*.pt", "*.pth", "*.gguf", "*.onnx")


def is_snapshot_installed(repo_id: str) -> bool:
    """True when the app folder holds weight files for the repo."""
    dest = app_snapshot_dir(repo_id)
    if not dest.is_dir():
        return False
    return any(dest.rglob(pattern) for pattern in _WEIGHT_PATTERNS)


def install_snapshot(repo_id: str, allow_patterns: list[str] | None = None) -> Path:
    """Snapshot-download a repo into the app folder, then clear the cache.

    The HF cache is the transient download buffer only: files are copied
    (symlinks dereferenced) into data/models/<slug>/ and the cache entry
    is deleted. Runtime resolution reads the app folder, never the cache.
    """
    from huggingface_hub import snapshot_download

    dest = app_snapshot_dir(repo_id)
    if is_snapshot_installed(repo_id):
        return dest
    snap = Path(
        snapshot_download(repo_id=repo_id, allow_patterns=allow_patterns)
        if allow_patterns
        else snapshot_download(repo_id=repo_id)
    )
    dest.mkdir(parents=True, exist_ok=True)
    for src in snap.rglob("*"):
        if src.is_dir() or ".no_exist" in src.parts:
            continue
        rel = src.relative_to(snap)
        target = dest / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, target)
    clear_hf_repo_cache(repo_id)
    logger.info("Installed snapshot %s into app folder", repo_id)
    return dest


def is_model_installed(repo_id: str, filename: str) -> bool:
    """True when the file lives in the app's own models folder."""
    return _app_model_path(repo_id, filename).is_file()


def install_model_file(repo_id: str, filename: str, **hf_kwargs) -> Path:
    """Download from HF into the app folder, then clear the cache entry.

    This is the single install moment: afterwards the app folder is the
    source of truth and the HF cache holds no copy. Extra kwargs (e.g.
    progress callbacks) pass through to hf_hub_download.
    """
    from huggingface_hub import hf_hub_download

    local = _app_model_path(repo_id, filename)
    if local.is_file():
        return local
    cached = Path(hf_hub_download(repo_id=repo_id, filename=filename, **hf_kwargs))
    local.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(cached, local)
    _clear_cache_entry(cached)
    logger.info("Installed %s/%s into app folder", repo_id, filename)
    return local


def install_model_file_to(repo_id: str, filename: str, dest: Path) -> Path:
    """Download from HF straight to an explicit app-folder destination.

    For engines whose backend reads a bespoke layout (whisper,
    faster-whisper, moonshine) instead of the ``<slug>/<file>`` convention.
    The HF cache entry is cleared afterwards, as always.
    """
    from huggingface_hub import hf_hub_download

    dest = Path(dest)
    if dest.is_file():
        return dest
    cached = Path(hf_hub_download(repo_id=repo_id, filename=filename))
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(cached, dest)
    _clear_cache_entry(cached)
    logger.info("Installed %s/%s to %s", repo_id, filename, dest)
    return dest


def resolve_model_file(repo_id: str, filename: str) -> Path:
    """Resolve a model file from the app folder, installing if needed.

    Order: app folder (data/models/<repo>/<filename>) → install from HF
    into the app folder + clear the cache entry. The HF cache is never
    used as a read fallback.
    """
    local = _app_model_path(repo_id, filename)
    if local.is_file():
        return local
    return install_model_file(repo_id, filename)
