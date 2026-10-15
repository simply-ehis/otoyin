"""SHA-256 integrity + dedup helpers for downloaded models.

Every successful ``POST /models/download`` snapshots the on-disk weight
files (SHA-256 per file + total bytes) into ``data/model-hashes/<model>.json``.
``GET /models/verify`` and the load path re-hash and compare, so tampered or
partially-copied caches are caught instead of silently used.

Dedup: the ``model_downloads`` table already has a UNIQUE(model_name,
model_size) index — downloads are idempotent upserts, and the download
endpoint refuses to start a second worker for an in-flight model.
"""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_WEIGHT_SUFFIXES = (".safetensors", ".bin", ".pt", ".pth", ".npz", ".gguf", ".onnx")


def _hashes_dir() -> Path:
    from .. import config as cfg_mod

    d = cfg_mod.get_data_dir() / "model-hashes"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _iter_weight_files(model_name: str) -> list[Path]:
    """Locate on-disk weight files for *model_name* across all cache layouts."""
    from huggingface_hub import constants as hf_constants

    from .. import config as cfg_mod
    from ..backends import get_model_config

    cfg = get_model_config(model_name)
    found: list[Path] = []
    if cfg is None:
        return found

    # Whisper / faster-whisper use the models dir, not the HF cache.
    if cfg.engine == "whisper":
        from ..backends.whisper_cpp_backend import WHISPER_CPP_FILES

        filename = WHISPER_CPP_FILES.get(cfg.model_size, f"ggml-{cfg.model_size}.bin")
        p = cfg_mod.get_models_dir() / filename
        if p.is_file():
            found.append(p)
        return found
    if cfg.engine == "faster-whisper":
        d = cfg_mod.get_models_dir() / f"faster-whisper-{cfg.model_size}"
        if d.is_dir():
            found.extend([p for p in d.rglob("*") if p.is_file()])
        return found

    # App folder layout (source of truth): data/models/<repo-slug>/.
    # Fall back to the legacy HF cache for installs that predate the
    # app-folder switch, so their baseline still verifies.
    if cfg.hf_repo_id:
        from .model_files import app_snapshot_dir

        snap_dirs = [app_snapshot_dir(cfg.hf_repo_id)]
        legacy_snaps = Path(hf_constants.HF_HUB_CACHE) / ("models--" + cfg.hf_repo_id.replace("/", "--")) / "snapshots"
        if legacy_snaps.is_dir():
            snap_dirs.append(legacy_snaps)

        for snaps in snap_dirs:
            if not snaps.is_dir():
                continue
            for p in snaps.rglob("*"):
                if p.is_file() and p.suffix.lower() in (
                    ".safetensors",
                    ".bin",
                    ".pt",
                    ".pth",
                    ".npz",
                    ".gguf",
                    ".onnx",
                    ".json",
                    ".txt",
                    ".model",
                ):
                    # Only hash real weights + tokenizer configs; skip symlinks to nowhere.
                    try:
                        if p.stat().st_size > 0:
                            found.append(p)
                    except OSError:
                        continue
    return found


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def snapshot_model_hashes(model_name: str) -> dict:
    """Hash current weight files and persist the sidecar. Returns the snapshot."""
    files = _iter_weight_files(model_name)
    weights = [p for p in files if p.suffix.lower() in _WEIGHT_SUFFIXES]
    if not weights:
        raise RuntimeError(f"No weight files found for {model_name}")
    entries = []
    total = 0
    for p in sorted(weights):
        try:
            digest = _sha256_file(p)
            size = p.stat().st_size
        except OSError as e:
            logger.warning("Could not hash %s: %s", p, e)
            continue
        total += size
        entries.append({"path": p.name, "sha256": digest, "bytes": size})
    if not entries:
        raise RuntimeError(f"Could not hash any weights for {model_name}")
    snap = {"model_name": model_name, "total_bytes": total, "files": entries}
    sidecar = _hashes_dir() / f"{model_name}.json"
    sidecar.write_text(json.dumps(snap, indent=2), encoding="utf-8")
    logger.info("Integrity snapshot for %s: %d files, %d bytes", model_name, len(entries), total)
    return snap


def verify_model_hashes(model_name: str) -> dict:
    """Re-hash and compare against the stored sidecar.

    Returns ``{"ok": bool, "reason": str, ...}``. Missing sidecar means the
    model predates verification — treated as ok with reason ``no_baseline`` so
    old installs are not bricked; the next re-download creates the baseline.
    """
    sidecar = _hashes_dir() / f"{model_name}.json"
    if not sidecar.is_file():
        return {"ok": True, "reason": "no_baseline"}
    try:
        baseline = json.loads(sidecar.read_text(encoding="utf-8"))
    except Exception as e:
        logger.debug("suppressed exception in model_integrity.py:142", exc_info=True)
        return {"ok": False, "reason": f"unreadable_baseline: {e}"}
    expected = {e["path"]: e["sha256"] for e in baseline.get("files", [])}
    files = _iter_weight_files(model_name)
    actual: dict[str, str] = {}
    for p in files:
        if p.suffix.lower() not in _WEIGHT_SUFFIXES:
            continue
        try:
            actual[p.name] = _sha256_file(p)
        except OSError:
            continue
    if not actual:
        return {"ok": False, "reason": "weights_missing"}
    for name, digest in expected.items():
        if name not in actual:
            return {"ok": False, "reason": f"missing_file:{name}"}
        if actual[name] != digest:
            return {"ok": False, "reason": f"checksum_mismatch:{name}"}
    return {"ok": True, "reason": "match", "files": len(actual)}
