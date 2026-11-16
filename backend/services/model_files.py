"""Shared ONNX model-file resolver.

The app's own ``data/models/`` folder is the source of truth. Downloads land
there directly (``snapshot_download`` / ``hf_hub_download`` with ``local_dir=``),
so the global HuggingFace cache at ``~/.cache/huggingface`` is never populated
— there is no copy step and no leftover cache to prune.

Note: ``local_dir=`` mode still writes a tiny ``.cache/huggingface/`` metadata
subtree inside the destination (``trees/``, ``download/``). That is the
hub's resumable-download bookkeeping and is required for interrupted downloads
to resume correctly — removing it is not an integrity issue, just the hub
starting over from scratch. Leave it alone.
"""

import logging
import shutil
from pathlib import Path

logger = logging.getLogger(__name__)


def _app_model_path(repo_id: str, filename: str) -> Path:
    """Path inside the app's own models folder for a repo file."""
    from .. import config as cfg_mod

    slug = repo_id.replace("/", "--")
    return cfg_mod.get_models_dir() / slug / filename


def delete_model_files(repo_id: str) -> list[Path]:
    """Remove every app-folder copy of a repo.

    Returns the paths that were removed. The app folder is the source of
    truth, so a sub-directory that cannot be removed (Windows file lock
    right after unload) must be reported rather than silently skipped —
    a "deleted" model that still occupies disk is the exact bug this
    guards against.
    """
    removed: list[Path] = []
    targets = [app_snapshot_dir(repo_id)]
    for target in targets:
        if target.is_dir():
            shutil.rmtree(target, ignore_errors=False)
            removed.append(target)
    return removed


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
    """Snapshot-download a repo into the app folder.

    ``allow_patterns`` pins the repo to just the files we need (main GGUF +
    e.g. packaging sidecars) — the upstream repo may be large and we don't
    carry unwanted shards. The HF cache is never populated; everything lands
    straight in ``data/models/<slug>/``.
    """
    from huggingface_hub import snapshot_download

    dest = app_snapshot_dir(repo_id)
    if is_snapshot_installed(repo_id):
        return dest
    dest.mkdir(parents=True, exist_ok=True)
    snapshot_download(
        repo_id=repo_id,
        allow_patterns=allow_patterns,
        local_dir=dest,
    )
    logger.info("Installed snapshot %s into app folder", repo_id)
    return dest


def is_model_installed(repo_id: str, filename: str) -> bool:
    """True when the file lives in the app's own models folder."""
    return _app_model_path(repo_id, filename).is_file()


def install_model_file(repo_id: str, filename: str, **hf_kwargs) -> Path:
    """Download a single file straight into the app folder.

    ``hf_hub_download`` with ``local_dir=`` streams bytes directly to the app
    folder — no HF cache copy, no post-install cleanup. An existing partial
    file (``filename + '.incomplete'``) resumes where it left off.
    """
    from huggingface_hub import hf_hub_download

    local = _app_model_path(repo_id, filename)
    if local.is_file():
        return local
    local.parent.mkdir(parents=True, exist_ok=True)
    hf_hub_download(repo_id=repo_id, filename=filename, local_dir=local.parent, **hf_kwargs)
    logger.info("Installed %s/%s into app folder", repo_id, filename)
    return local


def install_model_file_to(repo_id: str, filename: str, dest: Path) -> Path:
    """Download from HF straight to an explicit app-folder destination.

    For engines whose backend reads a bespoke layout (whisper,
    faster-whisper, moonshine) instead of the ``<slug>/<file>`` convention.
    """
    from huggingface_hub import hf_hub_download

    dest = Path(dest)
    if dest.is_file():
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    hf_hub_download(repo_id=repo_id, filename=filename, local_dir=dest.parent)
    logger.info("Installed %s/%s to %s", repo_id, filename, dest)
    return dest


def resolve_model_file(repo_id: str, filename: str) -> Path:
    """Resolve a model file from the app folder, installing if needed."""
    local = _app_model_path(repo_id, filename)
    if local.is_file():
        return local
    return install_model_file(repo_id, filename)
