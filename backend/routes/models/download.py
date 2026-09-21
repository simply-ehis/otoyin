"""Model download/cancel/delete endpoints."""

import asyncio
import logging
from pathlib import Path

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from ... import models
from ...database import get_db
from ...services.licensing import entitlement_for_product, has_entitlement
from ...services.marketplace_catalog import get_product
from ...services.task_queue import create_background_task
from ...utils.hf_progress import HFProgressTracker, create_hf_progress_callback
from ...utils.progress import get_progress_manager
from ...utils.rate_limiter import with_retry
from ...utils.tasks import get_task_manager
from .common import _cpu_executor, _download_executor, _download_steam_audio_sdk, router

logger = logging.getLogger(__name__)

# Engine -> pip packages that are intentionally NOT in requirements.txt or
# the frozen bundle. They are installed on-demand when the user downloads
# the corresponding model, so the base install stays lean.
# Fallback for engines not yet in ModelConfig.pip_packages.
_ENGINE_PIP_DEPS: dict[str, list[str]] = {
    "kokoro": ["kokoro>=0.9.4", "misaki[en,ja,zh]>=0.9.4"],
    "faster-whisper": ["faster-whisper>=1.0.0"],
}

# Import name -> pip package name mapping for importability checks.
_ENGINE_IMPORT_PROBES: dict[str, str] = {
    "kokoro": "kokoro",
    "faster-whisper": "faster_whisper",
    "pocket_tts": "pocket_tts",
    "parler_tts_gguf": "crispasr",
    "moss_tts_nano": "sentencepiece",
    "kitten_tts": "phonemizer",
    "neutts": "neutts",
    "neutts_2e": "neutts",
    "orpheus": "snac",
    "zonos_gguf": "crispasr",
    "voxcpm2": "crispasr",
    "moonshine": "moonshine",
    "whisper": "pywhispercpp",
    "rvc_onnx": "onnxruntime",
    "openvoice_onnx": "onnxruntime",
    "argos_translate": "argostranslate",
    "demucs_onnx": "demucs",
}


def _ensure_venv(venv_name: str) -> str:
    """Create or reuse a dedicated venv for engines with conflicting deps.

    Returns the path to the venv's python executable. Venvs are stored at
    ``data/venvs/{venv_name}/``.
    """
    import sys

    from ...config import get_data_dir

    venv_dir = get_data_dir() / "venvs" / venv_name
    if not venv_dir.exists():
        logger.info("Creating dedicated venv for %s: %s", venv_name, venv_dir)
        import subprocess

        subprocess.run([sys.executable, "-m", "venv", str(venv_dir)], check=True, timeout=60)

    if sys.platform == "win32":
        return str(venv_dir / "Scripts" / "python.exe")
    return str(venv_dir / "bin" / "python")


def _ensure_engine_pip_deps(engine: str) -> None:
    """Pip-install missing deps for *engine* if not already importable.

    Reads ``pip_packages`` and ``venv_name`` from ModelConfig when available,
    falls back to ``_ENGINE_PIP_DEPS`` for engines not yet in the config.

    No-op for frozen binaries (sys.frozen) or when deps already importable.
    Failures are logged, not raised — the model download still proceeds and
    the backend will return 501 until the user installs manually.
    """
    import sys

    if getattr(sys, "frozen", False):
        return

    # Resolve deps + venv from ModelConfig (preferred) or fallback dict.
    deps: list[str] = []
    venv_name: str | None = None
    try:
        from ...backends import get_all_model_configs

        for cfg in get_all_model_configs():
            if cfg.engine == engine and cfg.pip_packages:
                deps = cfg.pip_packages
                venv_name = cfg.venv_name
                break
    except Exception:
        pass
    if not deps:
        deps = _ENGINE_PIP_DEPS.get(engine, [])
    if not deps:
        return

    # Quick importability check.
    probe = _ENGINE_IMPORT_PROBES.get(engine, engine)
    try:
        __import__(probe)
        return  # already installed
    except ImportError:
        pass

    import subprocess

    # Determine python executable: dedicated venv or main env.
    if venv_name:
        python = _ensure_venv(venv_name)
    else:
        python = sys.executable

    logger.info("On-demand pip install for engine %s: %s (python=%s)", engine, deps, python)
    try:
        subprocess.run(
            [python, "-m", "pip", "install", *deps, "-q"],
            check=True,
            timeout=300,
        )
        logger.info("On-demand install for %s succeeded", engine)
    except Exception as e:
        logger.warning("On-demand pip install for %s failed: %s", engine, e)


def _friendly_download_error(e: Exception) -> str:
    """Map raw download failures to actionable messages for the UI."""
    msg = str(e)
    low = msg.lower()
    if "401" in msg or "403" in msg or "gated" in low:
        return f"Repo is gated or private — sign in to HuggingFace first. ({msg})"
    if any(k in low for k in ("connection", "network", "timed out", "timeout", "resolve", "unreachable")):
        return f"Couldn't reach HuggingFace — check the network and retry. ({msg})"
    if any(k in low for k in ("no space left", "disk full", "errno 28", "not enough space")):
        return f"Disk ran out of room for this model. ({msg})"
    return msg


def _quantize_onnx_if_needed(config, model_dir: Path):
    """Quantize ONNX model to INT8 if not already quantized."""
    model_dir = Path(model_dir)

    # Look for ONNX model files
    onnx_files = list(model_dir.glob("*.onnx")) + list(model_dir.rglob("*.onnx"))
    if not onnx_files:
        return

    import onnx
    from onnxruntime.quantization import QuantType, quantize_dynamic

    for model_path in onnx_files:
        if model_path.suffix == ".int8.onnx" or model_path.suffix == ".int4.onnx":
            continue  # Already quantized

        output_path = model_path.with_suffix(".int8.onnx")
        if output_path.exists():
            continue

        try:
            model = onnx.load(str(model_path))
            onnx.checker.check_model(model)

            quantize_dynamic(
                model_input=str(model_path),
                model_output=str(output_path),
                weight_type=QuantType.QInt8,
                per_channel=True,
                reduce_range=False,
                optimize_model=True,
            )

            # Verify
            quantized = onnx.load(str(output_path))
            onnx.checker.check_model(quantized)
        except Exception as e:
            # Non-fatal - log and continue
            import logging

            logging.getLogger(__name__).warning("ONNX quantization failed for %s: %s", model_path, e)


async def _download_model_files(config, model_name: str, tracker: HFProgressTracker, progress_manager):
    """Fetch the model files for one config (single attempt)."""
    import os

    from huggingface_hub import hf_hub_download, snapshot_download

    # Prevent hf_hub_download from blocking indefinitely on slow networks.
    os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "120")

    loop = asyncio.get_running_loop()

    with tracker.patch_download():
        if config.engine == "whisper":
            from ...backends.whisper_cpp_backend import HF_REPO, WHISPER_CPP_FILES

            filename = WHISPER_CPP_FILES.get(config.model_size, f"ggml-{config.model_size}.bin")
            await loop.run_in_executor(
                _download_executor,
                lambda: hf_hub_download(
                    repo_id=HF_REPO,
                    filename=filename,
                ),
            )
        elif config.engine == "faster-whisper":
            from ...backends.faster_whisper_backend import HF_REPO_PREFIX, MODEL_FILE

            repo_id = f"{HF_REPO_PREFIX}{config.model_size}"
            await loop.run_in_executor(
                _download_executor,
                lambda: hf_hub_download(
                    repo_id=repo_id,
                    filename=MODEL_FILE,
                ),
            )
        elif config.engine == "rvc_onnx":
            from ... import config as cfg_mod
            from ...backends.rvc_onnx_backend import rvc_onnx_backend

            dest = cfg_mod.get_models_dir() / "rvc" / config.model_size
            desc = rvc_onnx_backend.pack_source(config.model_size)
            repo_id = desc["repo"]

            def _download_rvc():
                dest.mkdir(parents=True, exist_ok=True)
                if desc.get("zip"):
                    zip_path = hf_hub_download(
                        repo_id=repo_id,
                        filename=desc["zip"],
                    )
                    import zipfile

                    with zipfile.ZipFile(zip_path) as zf:
                        # Zip Slip protection — validate each member stays within dest
                        for member in zf.infolist():
                            member_path = (dest / member.filename).resolve()
                            if not member_path.is_relative_to(dest.resolve()):
                                raise ValueError(f"Zip entry outside dest: {member.filename}")
                            if member.filename.startswith("/") or ".." in Path(member.filename).parts:
                                raise ValueError(f"Rejected zip entry: {member.filename}")
                        zf.extractall(dest)
                else:
                    hf_hub_download(
                        repo_id=repo_id,
                        filename=desc["pth"],
                        local_dir=str(dest),
                    )
                    if desc.get("index"):
                        hf_hub_download(
                            repo_id=repo_id,
                            filename=desc["index"],
                            local_dir=str(dest),
                        )

            await loop.run_in_executor(_download_executor, _download_rvc)
        elif config.engine == "seed_vc":
            from ...backends import get_vc_backend

            await loop.run_in_executor(
                _download_executor,
                lambda: get_vc_backend("seed_vc")._load_model_sync(),
            )
        elif config.engine == "gguf_llm":
            # GGUF planner repos carry every quant plus mmproj/MTP/embedding
            # artifacts. The backend only ever loads the single quant file
            # named by the quant tag, so fetch just that file instead of
            # snapshot-downloading several GB the app will never use.
            from ...backends.gguf_server_backend import _resolve_gguf_filename

            filename = await loop.run_in_executor(
                _download_executor, lambda: _resolve_gguf_filename(config.hf_repo_id, config.quant)
            )

            await loop.run_in_executor(
                _download_executor,
                lambda: hf_hub_download(
                    repo_id=config.hf_repo_id,
                    filename=filename,
                ),
            )
        elif config.engine == "qwen3_tts":
            # Qwen3-TTS GGUF needs TWO files: the quantized backbone + the
            # mmproj audio decoder (llama-tts refuses to run without it).
            from ...backends.gguf_server_backend import _resolve_gguf_filename
            from ...backends.qwen3_tts_backend import MMPROJ_FILENAME

            backbone = await loop.run_in_executor(
                _download_executor, lambda: _resolve_gguf_filename(config.hf_repo_id, config.quant)
            )
            for filename in (backbone, MMPROJ_FILENAME):
                await loop.run_in_executor(
                    _download_executor,
                    lambda f=filename: hf_hub_download(repo_id=config.hf_repo_id, filename=f),
                )
        elif config.engine == "minimax_music3":
            # MiniMax Music 3 is accessed via the diffusers ModularPipeline; no
            # binary download is needed — the model files are obtained from HF
            # (accept the Community License first).  The generic
            # snapshot_download else-branch handles the HF retrieval.
            await loop.run_in_executor(
                _download_executor,
                lambda: snapshot_download(repo_id=config.hf_repo_id),
            )
        elif config.engine == "sa3_sfx":
            # Single Q8_0 GGUF packs the whole Stable Audio 3 Small SFX stack.
            await loop.run_in_executor(
                _download_executor,
                lambda: hf_hub_download(
                    repo_id=config.hf_repo_id,
                    filename="Stable-Audio-3-Small-SFX-GGUF/stable-audio-3-small-sfx-q8_0.gguf",
                ),
            )
        elif config.engine == "bark_small":
            # Bark GGUF (one file packs all sub-models + EnCodec decoder)
            # plus the curated speaker packs (.npy -> .npz conversion).
            from ...backends.bark_backend import bark_backend
            from ...backends.gguf_server_backend import _resolve_gguf_filename

            backbone = await loop.run_in_executor(
                _download_executor, lambda: _resolve_gguf_filename(config.hf_repo_id, config.quant)
            )
            await loop.run_in_executor(
                _download_executor,
                lambda: hf_hub_download(repo_id=config.hf_repo_id, filename=backbone),
            )
            for voice_id in config.preset_voices:
                await loop.run_in_executor(_download_executor, lambda vid=voice_id: bark_backend.pack_voice_npz(vid))
        elif config.engine == "heartmula":
            # Single Q8_0 GGUF packs the whole HeartMuLa stack (MuLa
            # generator + HeartCodec decoder) - no companion files.
            from ...backends.heartmula_backend import HEARTMULA_GGUF

            await loop.run_in_executor(
                _download_executor,
                lambda: hf_hub_download(repo_id=config.hf_repo_id, filename=HEARTMULA_GGUF),
            )
        elif config.engine == "demucs_onnx":
            # Demucs HTDemucs ONNX — single htdemucs.onnx graph powers
            # stem separation (vocals/drums/bass/other). Torch-free path;
            # `pip install demucs` is only needed for the fallback path.
            from ...services.stem_separation_onnx import ONNX_FILE, ONNX_REPO

            await loop.run_in_executor(
                _download_executor,
                lambda: hf_hub_download(
                    repo_id=ONNX_REPO,
                    filename=ONNX_FILE,
                ),
            )
        elif config.engine == "soundfont":
            # Marketplace SoundFont bank — fetch straight into the instruments
            # library and register the pack row (same table uploads use).
            from ...services import soundfont_packs as sf_packs

            if not config.download_url:
                raise RuntimeError(f"No download URL configured for {model_name}")

            def _download_soundfont(
                _cfg=config,
                _pm=progress_manager,
                _name=model_name,
            ):
                def _progress(done: int, total: int) -> None:
                    _pm.update_progress(_name, done, total, filename=f"{_name}.sf2")

                sf_packs.download_soundfont_pack(_name, _cfg.download_url, _cfg.display_name, _progress)

            await loop.run_in_executor(_download_executor, _download_soundfont)

            # Register on a fresh session — the request session is long dead
            # by the time this worker runs (same reason record_download does).
            def _register_soundfont(
                _cfg=config,
                _name=model_name,
            ):
                from ...database import session as _db_session

                fresh = _db_session.SessionLocal()
                try:
                    sf_packs.register_soundfont_pack(fresh, _name, _cfg.display_name, _cfg.download_url)
                finally:
                    fresh.close()

            await loop.run_in_executor(_download_executor, _register_soundfont)
        elif config.engine == "argos_translate":
            # Argos offline pack — download via argostranslate.package directly.
            def _download_argos():
                import argostranslate.package
                import argostranslate.translate

                if not argostranslate.package.get_available_packages():
                    argostranslate.package.update_package_index()
                avail = argostranslate.package.get_available_packages()
                # model_size is "en-es" etc.
                src, tgt = config.model_size.split("-", 1)
                pkg = next((p for p in avail if p.from_code == src and p.to_code == tgt), None)
                if not pkg:
                    raise RuntimeError(f"No Argos package for {src}→{tgt}")
                installed_langs = argostranslate.translate.get_installed_languages()
                has = any(lang.code == src for lang in installed_langs) and any(
                    lang.code == tgt for lang in installed_langs
                )
                if not has:
                    argostranslate.package.install_from_path(pkg.download())

            await loop.run_in_executor(_download_executor, _download_argos)
        elif config.engine == "steam_audio":
            await loop.run_in_executor(
                _download_executor,
                lambda: _download_steam_audio_sdk(progress_manager, model_name),
            )
        elif config.engine == "fish_speech_s2":
            from ...backends.fish_speech_s2_backend import S2_CPP_GGUF_DEFAULT, S2_CPP_TOKENIZER

            for filename in (S2_CPP_GGUF_DEFAULT, S2_CPP_TOKENIZER):
                await loop.run_in_executor(
                    _download_executor,
                    lambda f=filename: hf_hub_download(repo_id=config.hf_repo_id, filename=f),
                )
        elif config.engine == "voxcpm2":
            await loop.run_in_executor(
                _download_executor,
                lambda: hf_hub_download(repo_id=config.hf_repo_id, filename="voxcpm2-q8_0.gguf"),
            )
        elif config.engine == "moonshine":
            from ...backends.moonshine_backend import _MODELS

            info = _MODELS.get(config.model_size)
            if info:
                await loop.run_in_executor(
                    _download_executor,
                    lambda: hf_hub_download(repo_id=info["repo"], filename=info["file"]),
                )
        else:
            await loop.run_in_executor(
                _download_executor,
                lambda: snapshot_download(
                    repo_id=config.hf_repo_id,
                ),
            )


@router.post("/models/download")
async def trigger_model_download(request: models.ModelDownloadRequest, db: Session = Depends(get_db)):
    """Trigger download of a specific model to the HuggingFace cache.

    Downloads the model files via ``snapshot_download`` without loading
    the model into memory.  Progress is reported via the task and progress
    managers so the frontend can track it.  Paid models require a valid
    installed license (docs/MARKETPLACE_PLAN.md §3).
    """
    from ...backends import get_model_config

    task_manager = get_task_manager()
    progress_manager = get_progress_manager()

    config = get_model_config(request.model_name)
    if not config:
        raise HTTPException(
            status_code=400,
            detail={"code": "unknown_model", "detail": f"Unknown model: {request.model_name}"},
        )

    product = get_product(request.model_name)
    if (
        product is not None
        and product.get("paid", False)
        and not has_entitlement(db, entitlement_for_product(request.model_name))
    ):
        raise HTTPException(
            status_code=402,
            detail={
                "code": "license_required",
                "detail": f"Model '{request.model_name}' requires a license. Purchase it in the marketplace, then install the license file.",
                "product_id": request.model_name,
            },
        )

    # Dedup: never start a second worker for a model that is already
    # downloading — the frontend polls /tasks/active and would show two
    # spinners for one file. Return the in-flight state instead of 500.
    if task_manager.is_download_active(request.model_name):
        existing = next(
            (t for t in task_manager.get_active_downloads() if t.model_name == request.model_name),
            None,
        )
        if existing is not None and existing.status == "downloading":
            return {"message": f"Model {request.model_name} download already in progress"}
        # Stale error row — clear it so a retry starts clean.
        task_manager.cancel_download(request.model_name)

    # Snapshot the config fields the background worker needs. The request
    # object and its DB session die with the HTTP request — the worker must
    # not touch either (closed-session bug made downloads never record).
    _model_name = request.model_name
    _engine = config.engine
    _model_size = config.model_size
    _hf_repo_id = config.hf_repo_id
    _config = config

    async def download_in_background(task):
        try:
            # On-demand pip deps for bloat engines (kokoro / faster-whisper).
            # Never bundled — installed only when the user actually downloads
            # that engine's model. No-op if already installed or frozen.
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(_cpu_executor, lambda: _ensure_engine_pip_deps(_engine))

            progress_callback = create_hf_progress_callback(_model_name, progress_manager)
            tracker = HFProgressTracker(progress_callback)

            # Transient HuggingFace failures (rate limits, dropped
            # connections) are common; retry with backoff before failing.
            await with_retry(
                lambda: _download_model_files(_config, _model_name, tracker, progress_manager),
                attempts=3,
                label=f"download {_model_name}",
            )

            # Quantize ONNX models if needed (INT8 quantization for ONNX TTS/STT)
            if _engine in {
                "kokoro",
                "styletts2",
                "f5_tts",
                "pocket_tts",
                "moss_tts_nano",
                "parler_tts_gguf",
                "kitten_tts",
                "chattts",
                "demucs_onnx",
                "faster-whisper",
            }:
                progress_manager.update_progress(
                    model_name=_model_name,
                    current=0,
                    total=0,
                    filename="Quantizing model (INT8)...",
                    status="downloading",
                )
                try:
                    from ... import config as cfg_mod

                    # Find the downloaded model file
                    model_dir = cfg_mod.get_models_dir()
                    # For ONNX models, the model is typically in a subdirectory
                    # or directly as model.onnx / model.int8.onnx
                    loop = asyncio.get_running_loop()
                    await loop.run_in_executor(
                        _cpu_executor,
                        lambda: _quantize_onnx_if_needed(_config, model_dir),
                    )
                except Exception as e:
                    logger.warning("ONNX quantization failed for %s: %s", _model_name, e)
                    # Non-fatal - model will still work with FP32

            # Post-download integrity gate: refuse to record a manifest row
            # when no weight file is actually on disk (partial/failed fetch
            # that HF did not raise for). Without this the UI shows
            # "Installed" for a broken cache and Activate then does nothing.
            try:
                from ...utils.model_status import is_model_downloaded

                if not await loop.run_in_executor(_download_executor, lambda: is_model_downloaded(_model_name)):
                    raise RuntimeError(
                        "Download finished but no model weights were found on disk — check disk space and retry."
                    )
            except RuntimeError:
                raise
            except Exception as e:
                logger.warning("Post-download verification skipped for %s: %s", _model_name, e)

            # Guard the cancel/complete race: if the user cancelled (or
            # restarted) this download, a stale worker must not overwrite
            # the newer task state.
            if task_manager.is_active_download(_model_name, task):
                task_manager.complete_download(_model_name)
                progress_manager.mark_complete(_model_name)

                from ...services.telemetry import track_event

                track_event(
                    "model_downloaded",
                    {"model_name": _model_name, "engine": _engine},
                )

                # Record the entitlement in the download manifest so the gate
                # allows loading this model (and the UI can show it). Idempotent:
                # re-downloads just refresh the row. Uses a FRESH session —
                # the request DB session is closed by now.
                from ...database import session as _db_session
                from ...services.model_registry import record_download

                _session_local = _db_session.SessionLocal
                if _session_local is None:
                    logger.error("Database not initialized — cannot record download for %s", _model_name)
                    raise RuntimeError("Database not initialized")
                fresh_db = _session_local()
                try:
                    # SHA-256 sidecar: hash the on-disk weight files so a
                    # later /models/verify (or load) can detect tampering
                    # without re-downloading. Best-effort — never blocks.
                    file_size: int | None = None
                    try:
                        from ...services.model_integrity import snapshot_model_hashes

                        snap = await loop.run_in_executor(_cpu_executor, lambda: snapshot_model_hashes(_model_name))
                        file_size = snap.get("total_bytes")
                    except Exception as e:
                        logger.debug("Integrity snapshot skipped for %s: %s", _model_name, e, exc_info=True)
                    record_download(
                        fresh_db,
                        model_name=_model_name,
                        model_size=_model_size,
                        engine=_engine,
                        hf_repo_id=_hf_repo_id,
                        local_path=None,
                        file_size_bytes=file_size,
                    )
                finally:
                    fresh_db.close()
            else:
                logger.info("Download of %s finished after cancel; state left alone", _model_name)
        except Exception as e:
            logger.debug("Model download failed: %s", _model_name, exc_info=True)
            if task_manager.is_active_download(_model_name, task):
                friendly = _friendly_download_error(e)
                task_manager.error_download(_model_name, friendly)
                progress_manager.mark_error(_model_name, friendly)

    task = task_manager.start_download(request.model_name)

    progress_manager.update_progress(
        model_name=request.model_name,
        current=0,
        total=0,
        filename="Preparing download…",
        status="downloading",
    )

    create_background_task(download_in_background(task))

    return {"message": f"Model {request.model_name} download started"}


@router.post("/models/download/cancel")
async def cancel_model_download(request: models.ModelDownloadRequest):
    """Cancel or dismiss an errored/stale download task."""
    task_manager = get_task_manager()
    progress_manager = get_progress_manager()

    removed = task_manager.cancel_download(request.model_name)

    progress_removed = False
    with progress_manager._lock:
        if request.model_name in progress_manager._progress:
            del progress_manager._progress[request.model_name]
            progress_removed = True

    if removed or progress_removed:
        return {"message": f"Download task for {request.model_name} cancelled"}
    return {"message": f"No active task found for {request.model_name}"}


@router.delete("/models/{model_name}")
async def delete_model(model_name: str):
    """Delete a downloaded model from the HuggingFace cache.

    Always cleans the manifest + progress state, even when the on-disk
    cache is already gone or locked (Windows file locks). Never 500s on
    a missing file — that is the exact "delete does nothing" report.
    """
    from huggingface_hub import constants as hf_constants

    from ...backends import get_model_config, unload_model_by_config
    from ...services.model_registry import forget_download
    from ...utils.progress import get_progress_manager

    config = get_model_config(model_name)
    if not config:
        raise HTTPException(status_code=400, detail=f"Unknown model: {model_name}")

    # A model that is still downloading cannot be deleted — cancel first.
    from ...utils.tasks import get_task_manager

    task_manager = get_task_manager()
    active = next(
        (t for t in task_manager.get_active_downloads() if t.model_name == model_name),
        None,
    )
    if active is not None and active.status == "downloading":
        raise HTTPException(
            status_code=409,
            detail=f"Model {model_name} is still downloading — cancel it first, then delete.",
        )
    # Dismiss any stale error row so status polls go clean immediately.
    task_manager.cancel_download(model_name)
    try:
        progress_manager = get_progress_manager()
        with progress_manager._lock:
            progress_manager._progress.pop(model_name, None)
    except Exception:
        logger.debug("Progress cleanup skipped for %s", model_name, exc_info=True)

    # Best-effort unload — don't let a failed unload block deletion.
    try:
        unload_model_by_config(config)
    except Exception:
        logger.debug("Unload before delete failed (non-fatal)", exc_info=True)

    def _forget() -> None:
        try:
            forget_download(model_name, config.model_size)
        except Exception:
            logger.debug("Manifest cleanup failed for %s", model_name, exc_info=True)
        # Drop the integrity baseline so a re-download starts fresh.
        try:
            from ...services.model_integrity import _hashes_dir

            (_hashes_dir() / f"{model_name}.json").unlink(missing_ok=True)
        except Exception:
            logger.debug("Hash sidecar cleanup skipped for %s", model_name, exc_info=True)

    if config.engine == "argos_translate":
        _forget()
        return {"message": f"Translation pack {model_name} removed"}
    if config.engine == "soundfont":
        from ...database import session as _db_session
        from ...services.soundfont_packs import delete_soundfont_pack

        if _db_session.SessionLocal is None:
            logger.warning("Database not initialized — pack row for %s kept, files removed", model_name)
            from ...services import soundfont_packs as _sf

            _sf.delete_soundfont_pack_files_only(model_name)
        else:
            fresh_db = _db_session.SessionLocal()
            try:
                delete_soundfont_pack(fresh_db, model_name)
            finally:
                fresh_db.close()
        _forget()
        return {"message": f"Soundfont pack {model_name} removed"}
    if config.engine == "whisper":
        from ... import config as cfg_mod
        from ...backends.whisper_cpp_backend import WHISPER_CPP_FILES

        filename = WHISPER_CPP_FILES.get(config.model_size, f"ggml-{config.model_size}.bin")
        model_file = cfg_mod.get_models_dir() / filename
        try:
            if model_file.exists():
                model_file.unlink()
        except OSError as e:
            logger.warning("Could not delete whisper file for %s: %s", model_name, e)
        _forget()
        return {"message": f"Model {model_name} deleted successfully"}
    if config.engine == "faster-whisper":
        from ... import config as cfg_mod

        model_dir = cfg_mod.get_models_dir() / f"faster-whisper-{config.model_size}"
        if model_dir.exists():
            import shutil

            try:
                await asyncio.to_thread(shutil.rmtree, model_dir, True)
            except OSError as e:
                logger.warning("Could not delete faster-whisper dir for %s: %s", model_name, e)
        _forget()
        return {"message": f"Model {model_name} deleted successfully"}

    hf_repo_id = config.hf_repo_id
    cache_dir = hf_constants.HF_HUB_CACHE
    repo_cache_dir = Path(cache_dir) / ("models--" + hf_repo_id.replace("/", "--"))

    if not repo_cache_dir.exists():
        _forget()
        return {"message": f"Model {model_name} cache already gone; manifest cleaned"}

    import shutil

    # Windows holds file locks briefly after unload — retry a few times
    # before giving up, but ALWAYS clean the manifest afterwards.
    deleted = False
    last_err: Exception | None = None
    for attempt in range(3):
        try:
            await asyncio.to_thread(shutil.rmtree, repo_cache_dir, True)
            deleted = not repo_cache_dir.exists()
            if deleted:
                break
        except OSError as e:
            last_err = e
            logger.warning("Delete attempt %d for %s failed: %s", attempt + 1, model_name, e)
            await asyncio.sleep(0.5 * (attempt + 1))
    if not deleted and repo_cache_dir.exists():
        # Last resort on Windows: schedule remaining files for removal is
        # overkill — report honestly but still free the manifest slot so the
        # user can re-download cleanly.
        logger.warning("Failed to fully delete model cache for %s: %s", model_name, last_err)

    _forget()
    # Verify the manifest row is actually gone — the frontend keys its
    # Installed badge off is_downloaded, so a lingering row looks like
    # "delete did nothing".
    try:
        from ...services.model_registry import is_downloaded

        if is_downloaded(model_name, config.model_size):
            raise HTTPException(
                status_code=500,
                detail=f"Delete removed files but the manifest row for {model_name} persists — restart the backend and retry.",
            )
    except HTTPException:
        raise
    except Exception:
        logger.debug("Post-delete manifest check skipped", exc_info=True)
    return {"message": f"Model {model_name} deleted successfully"}


@router.get("/models/verify/{model_name}")
async def verify_model(model_name: str):
    """Re-hash on-disk weights against the download-time SHA-256 baseline."""
    from ...backends import get_model_config

    config = get_model_config(model_name)
    if not config:
        raise HTTPException(status_code=400, detail=f"Unknown model: {model_name}")
    try:
        from ...services.model_integrity import verify_model_hashes

        result = await asyncio.to_thread(verify_model_hashes, model_name)
        return {"model_name": model_name, **result}
    except Exception as e:
        logger.debug("Verify failed for %s", model_name, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Verify failed: {e}") from e
