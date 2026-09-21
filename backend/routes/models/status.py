"""Model status endpoint."""

import time
from pathlib import Path

from ... import models
from ...utils.platform_detect import get_backend_type
from ...utils.tasks import get_task_manager
from .common import logger, router

# Lightweight TTL cache to keep status fast on cold start / repeated polls.
# /models/status is hit by the Marketplace on every open and by background polls;
# scanning the HF cache (scan_cache_dir + size math) can take 200-600ms and blocks
# the event loop. Cache the scan result for 4s and the assembled response for 3s
# (bypassed while a download is active so progress is live).
_CACHE_TTL_SEC = 3.0
_SCAN_TTL_SEC = 4.0
_status_cache: dict | None = None
_status_cache_at: float = 0.0
_scan_cache: object | None = None
_scan_cache_at: float = 0.0


def _check_whisper_downloaded(config: dict) -> tuple[bool, float | None]:
    """Check if a whisper.cpp model is downloaded locally."""
    from ... import config as cfg_mod
    from ...backends.whisper_cpp_backend import WHISPER_CPP_FILES

    whisper_file = cfg_mod.get_models_dir() / WHISPER_CPP_FILES.get(
        config["model_size"], f"ggml-{config['model_size']}.bin"
    )
    if whisper_file.exists():
        return True, whisper_file.stat().st_size / (1024 * 1024)
    return False, None


def _check_steam_audio_downloaded() -> tuple[bool, float | None]:
    """Check if Steam Audio SDK is downloaded."""
    from ...services.steam_audio import _lib_path

    lib = _lib_path()
    if lib is not None:
        return True, lib.stat().st_size / (1024 * 1024)
    return False, None


def _check_hf_cache_repo(cache_info, repo_id: str, model_name: str) -> tuple[bool, float | None]:
    """Check if a model is cached in the HuggingFace cache via scan_cache_dir."""
    for repo in cache_info.repos:
        if repo.repo_id != repo_id:
            continue

        has_model_weights = False
        for rev in repo.revisions:
            for f in rev.files:
                # .gguf (planner LLM, Orpheus, NeuTTS) and .onnx
                # (torch-free TTS backends) are real weights too — without
                # them GGUF/ONNX models never reported as downloaded.
                if f.file_name.lower().endswith((".safetensors", ".bin", ".pt", ".pth", ".npz", ".gguf", ".onnx")):
                    has_model_weights = True
                    break
            if has_model_weights:
                break

        if not has_model_weights:
            return False, None

        # Check for incomplete downloads (blobs AND snapshots)
        try:
            from huggingface_hub import constants as hf_constants

            repo_dir = Path(hf_constants.HF_HUB_CACHE) / ("models--" + repo_id.replace("/", "--"))
            blobs_dir = repo_dir / "blobs"
            snapshots_dir = repo_dir / "snapshots"
            if blobs_dir.exists() and any(blobs_dir.glob("*.incomplete")):
                return False, None
            # Stale partial snapshots: if any file inside snapshots is 0 bytes
            # or has a .incomplete sibling, the download didn't finish.
            if snapshots_dir.exists():
                for snap in snapshots_dir.iterdir():
                    if snap.is_dir():
                        for f in snap.iterdir():
                            if f.suffix == ".incomplete" or (f.is_file() and f.stat().st_size == 0):
                                return False, None
        except Exception as e:
            logger.debug("Incomplete download check failed for %s: %s", model_name, e)

        # Calculate size
        try:
            total_size = sum(revision.size_on_disk for revision in repo.revisions)
            return True, total_size / (1024 * 1024)
        except Exception as e:
            logger.debug("Size calculation failed for %s: %s", model_name, e)
            return True, None

    return False, None


def _check_filesystem_cache(repo_id: str, model_name: str) -> tuple[bool, float | None]:
    """Fallback: check filesystem cache directly when scan_cache_dir is unavailable."""
    try:
        from huggingface_hub import constants as hf_constants

        cache_dir = hf_constants.HF_HUB_CACHE
        repo_cache = Path(cache_dir) / ("models--" + repo_id.replace("/", "--"))
        if not repo_cache.exists():
            return False, None

        blobs_dir = repo_cache / "blobs"
        if blobs_dir.exists() and any(blobs_dir.glob("*.incomplete")):
            return False, None

        snapshots_dir = repo_cache / "snapshots"
        if not snapshots_dir.exists():
            return False, None

        # Reject stale partial snapshots (0-byte files or .incomplete siblings)
        for snap in snapshots_dir.iterdir():
            if snap.is_dir():
                for f in snap.iterdir():
                    if f.suffix == ".incomplete" or (f.is_file() and f.stat().st_size == 0):
                        return False, None

        has_model_files = (
            any(snapshots_dir.rglob("*.bin"))
            or any(snapshots_dir.rglob("*.safetensors"))
            or any(snapshots_dir.rglob("*.pt"))
            or any(snapshots_dir.rglob("*.pth"))
            or any(snapshots_dir.rglob("*.npz"))
            or any(snapshots_dir.rglob("*.gguf"))
            or any(snapshots_dir.rglob("*.onnx"))
        )
        if not has_model_files:
            return False, None

        total_size = sum(
            f.stat().st_size for f in repo_cache.rglob("*") if f.is_file() and not f.name.endswith(".incomplete")
        )
        return True, total_size / (1024 * 1024)
    except Exception as e:
        logger.debug("Cache check failed for %s: %s", model_name, e)
        return False, None


def _build_model_status(
    config: dict,
    downloaded: bool,
    is_downloading: bool,
    size_mb: float | None,
    loaded: bool,
    entitled: bool,
) -> models.ModelStatus:
    """Build a ModelStatus response object from config and computed state."""
    return models.ModelStatus(
        model_name=config["model_name"],
        display_name=config["display_name"],
        engine=config["engine"],
        hf_repo_id=config["hf_repo_id"],
        quant=config.get("quant"),
        model_size=config.get("model_size"),
        downloaded=downloaded,
        downloading=is_downloading,
        size_mb=size_mb,
        loaded=loaded,
        entitled=entitled,
        gpu_only=config["gpu_only"],
        clone_voice=config["clone_voice"],
        emotion_control=config["emotion_control"],
        supports_instruct=config["supports_instruct"],
        paralinguistic_tags=config["paralinguistic_tags"],
        voice_design=config["voice_design"],
        supports_editing=config["supports_editing"],
        supported_tags=config["supported_tags"],
        preset_voices=[
            models.PresetVoice(id=v.id, name=v.name, gender=v.gender, language=v.language)
            for v in config["structured_preset_voices"]
        ],
        supports_voice_mixing=config["supports_voice_mixing"],
        category=config["category"],
    )


@router.get("/models/status", response_model=models.ModelStatusListResponse)
async def get_model_status():
    """Get status of all available models."""
    global _status_cache, _status_cache_at, _scan_cache, _scan_cache_at
    get_backend_type()
    task_manager = get_task_manager()

    from ...services.model_registry import is_downloaded

    active_downloads = task_manager.get_active_downloads()
    active_download_names = {t.model_name for t in active_downloads if t.status == "downloading"}
    has_active = len(active_download_names) > 0

    # Serve cached response if still fresh and no active download (so progress stays live)
    now = time.monotonic()
    if not has_active and _status_cache is not None and (now - _status_cache_at) < _CACHE_TTL_SEC:
        return models.ModelStatusListResponse(**_status_cache)

    try:
        from huggingface_hub import scan_cache_dir

        use_scan_cache = True
    except ImportError:
        use_scan_cache = False

    from ...backends import check_model_loaded, get_all_model_configs

    registry_configs = get_all_model_configs()
    model_configs = [
        {
            "model_name": cfg.model_name,
            "display_name": cfg.display_name,
            "engine": cfg.engine,
            "hf_repo_id": cfg.hf_repo_id,
            "model_size": cfg.model_size,
            "quant": getattr(cfg, "quant", None),
            "gpu_only": cfg.gpu_only,
            "clone_voice": cfg.clone_voice,
            "emotion_control": cfg.emotion_control,
            "supports_instruct": cfg.supports_instruct,
            "paralinguistic_tags": cfg.paralinguistic_tags,
            "voice_design": cfg.voice_design,
            "supports_editing": cfg.supports_editing,
            "supported_tags": cfg.supported_tags,
            "structured_preset_voices": cfg.structured_preset_voices,
            "supports_voice_mixing": cfg.supports_voice_mixing,
            "category": cfg.category,
            "check_loaded": lambda c=cfg: check_model_loaded(c),
        }
        for cfg in registry_configs
    ]

    model_to_repo = {cfg["model_name"]: cfg["hf_repo_id"] for cfg in model_configs}
    active_download_repos = {model_to_repo.get(name) for name in active_download_names if name in model_to_repo}

    cache_info = None
    if use_scan_cache:
        # Reuse scan result for a few seconds — this is the most expensive part
        if _scan_cache is not None and (now - _scan_cache_at) < _SCAN_TTL_SEC and not has_active:
            cache_info = _scan_cache  # type: ignore[assignment]
        else:
            try:
                cache_info = scan_cache_dir()
                _scan_cache = cache_info
                _scan_cache_at = now
            except Exception as e:
                logger.warning("Failed to scan HF cache: %s", e)

    statuses = []

    for config in model_configs:
        try:
            downloaded = False
            size_mb = None

            # Check download status based on engine type
            if config["engine"] == "whisper":
                downloaded, size_mb = _check_whisper_downloaded(config)
            elif config["engine"] == "steam_audio":
                downloaded, size_mb = _check_steam_audio_downloaded()
            elif cache_info:
                downloaded, size_mb = _check_hf_cache_repo(cache_info, config["hf_repo_id"], config["model_name"])

            # Fallback to filesystem check
            if not downloaded:
                downloaded, size_mb = _check_filesystem_cache(config["hf_repo_id"], config["model_name"])

            # Check if model is loaded in memory
            try:
                loaded = config["check_loaded"]()
            except Exception as e:
                logger.debug("Load check failed for %s: %s", config["model_name"], e)
                loaded = False

            is_downloading = config["hf_repo_id"] in active_download_repos
            if is_downloading:
                downloaded = False
                size_mb = None

            try:
                entitled = is_downloaded(config["model_name"], config["model_size"])
            except Exception as e:
                logger.debug("Entitlement check failed for %s: %s", config["model_name"], e)
                entitled = False

            statuses.append(
                _build_model_status(
                    config,
                    downloaded,
                    is_downloading,
                    size_mb,
                    loaded,
                    entitled,
                )
            )
        except Exception as e:
            logger.warning("Unexpected error checking model %s: %s", config["model_name"], e)
            try:
                loaded = config["check_loaded"]()
            except Exception:
                logger.debug("Fallback load check also failed for %s", config["model_name"], exc_info=True)
                loaded = False

            is_downloading = config["hf_repo_id"] in active_download_repos
            statuses.append(_build_model_status(config, False, is_downloading, None, loaded, False))

    resp = models.ModelStatusListResponse(models=statuses)
    # Cache only when idle — downloads must be reflected immediately
    if not has_active:
        _status_cache = resp.model_dump()
        _status_cache_at = now
    return resp
