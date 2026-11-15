"""
Shared utilities for TTS/STT backend implementations.

Eliminates duplication of cache checking, device detection,
voice prompt combination, and model loading progress tracking.
"""

from __future__ import annotations

import logging
import platform
from contextlib import contextmanager
from pathlib import Path

import numpy as np

from ..utils.audio import load_audio, normalize_audio
from ..utils.hf_progress import HFProgressTracker, create_hf_progress_callback
from ..utils.progress import get_progress_manager
from ..utils.tasks import get_task_manager

logger = logging.getLogger(__name__)

# Short-TTL cache for is_model_cached: the snapshots rglob walk is O(files)
# and runs on load/generate hot paths. Cache positive AND negative results
# for a few seconds; downloads invalidate by completing outside this window.
_cache_check_cache: dict[tuple, tuple[float, bool]] = {}
_CACHE_CHECK_TTL_SEC = 5.0


def is_model_cached(
    hf_repo: str,
    *,
    weight_extensions: tuple[str, ...] = (".safetensors", ".bin"),
    required_files: list[str] | None = None,
) -> bool:
    """
    Check if a HuggingFace model is fully cached locally.

    Args:
        hf_repo: HuggingFace repo ID (e.g. "neuphonic/neutts-air-q4-gguf")
        weight_extensions: File extensions that count as model weights.
        required_files: If set, check that these specific filenames exist
                        in snapshots instead of checking by extension.

    Returns:
        True if model is fully cached, False if missing or incomplete.
    """
    import time as _time

    key = (hf_repo, weight_extensions, tuple(required_files or ()))
    now = _time.monotonic()
    hit = _cache_check_cache.get(key)
    if hit is not None and (now - hit[0]) < _CACHE_CHECK_TTL_SEC:
        return hit[1]
    result = _is_model_cached_uncached(hf_repo, weight_extensions=weight_extensions, required_files=required_files)
    _cache_check_cache[key] = (now, result)
    # Bound growth: drop oldest entries beyond 256 repos.
    if len(_cache_check_cache) > 256:
        oldest = min(_cache_check_cache, key=lambda k: _cache_check_cache[k][0])
        _cache_check_cache.pop(oldest, None)
    return result


def _is_model_cached_uncached(
    hf_repo: str,
    *,
    weight_extensions: tuple[str, ...] = (".safetensors", ".bin"),
    required_files: list[str] | None = None,
) -> bool:
    """Uncached body of is_model_cached (see TTL wrapper above)."""
    try:
        from huggingface_hub import constants as hf_constants

        repo_cache = Path(hf_constants.HF_HUB_CACHE) / ("models--" + hf_repo.replace("/", "--"))

        if not repo_cache.exists():
            return False

        # Incomplete blobs mean a download is still in progress
        blobs_dir = repo_cache / "blobs"
        if blobs_dir.exists() and any(blobs_dir.glob("*.incomplete")):
            logger.debug(f"Found .incomplete files for {hf_repo}")
            return False

        snapshots_dir = repo_cache / "snapshots"
        if not snapshots_dir.exists():
            return False

        if required_files:
            # Check that every required filename exists somewhere in snapshots
            return all(any(snapshots_dir.rglob(fname)) for fname in required_files)

        # Check that at least one weight file exists
        for ext in weight_extensions:
            if any(snapshots_dir.rglob(f"*{ext}")):
                return True

        logger.debug(f"No model weights found for {hf_repo}")
        return False

    except (OSError, ImportError) as e:
        logger.warning(f"Error checking cache for {hf_repo}: {e}")
        return False


def cleanup_gpu_memory(*, log: bool = False) -> None:
    """Run the Python GC after unloading a model.

    The app never imports a CUDA runtime — every audio engine runs on a C++
    sidecar that owns its own memory — so there is nothing to free on the
    Python side except dead objects. Kept as a named hook because callers at
    unload boundaries expect it.
    """
    import gc

    gc.collect()


async def combine_voice_prompts(
    audio_paths: list[str],
    reference_texts: list[str],
    *,
    sample_rate: int | None = None,
) -> tuple[np.ndarray, str]:
    """
    Combine multiple reference audio samples into one.

    Loads each audio file, normalizes, concatenates, and joins texts.

    Args:
        audio_paths: Paths to reference audio files.
        reference_texts: Corresponding transcripts.
        sample_rate: If set, resample audio to this rate during loading.
    """
    import numpy as np

    combined_audio = []

    for path in audio_paths:
        kwargs = {"sample_rate": sample_rate} if sample_rate else {}
        audio, _sr = load_audio(path, **kwargs)
        audio = normalize_audio(audio)
        combined_audio.append(audio)

    mixed = np.concatenate(combined_audio)
    mixed = normalize_audio(mixed)
    combined_text = " ".join(reference_texts)

    return mixed, combined_text


class BackendBase:
    """Minimal base class providing a consistent unload pattern for all backends.

    Subclasses declare a single class attribute:

        _model_attr = "model"          # attribute holding the loaded model

    The base ``unload_model()`` will:
    1. Check if the attribute is non-None.
    2. Call ``_on_unload()`` (optional hook for pre-deletion work).
    3. ``del`` the attribute and set it to ``None``.
    4. Call ``cleanup_gpu_memory()`` to reclaim VRAM.
    5. Log the unload.
    6. Call ``_after_unload()`` (optional hook for post-cleanup).

    Subclasses override ``_on_unload()`` / ``_after_unload()`` when they
    need custom teardown (clearing extra caches, stopping servers, etc.).

    Usage::

        class MyTTSBackend(BackendBase):
            _model_attr = "model"

            def __init__(self):
                self.model = None

            async def load_model(self, model_size):
                self.model = load_heavy_thing()

            # unload_model() is inherited — no override needed.
    """

    _model_attr: str = "model"  # override in subclass

    def _on_unload(self) -> None:
        """Pre-deletion hook. Override to clear extra caches, stop servers, etc."""

    def _after_unload(self) -> None:
        """Post-cleanup hook. Override for any work after GPU memory is freed."""

    def unload_model(self) -> None:
        """Consistent unload: clear model → GPU cleanup → logging.

        Subclasses that need different behaviour (subprocess one-shots,
        no-ops) can still override this method entirely.
        """
        model = getattr(self, self._model_attr, None)
        if model is None:
            return
        self._on_unload()
        del model
        setattr(self, self._model_attr, None)
        cleanup_gpu_memory()
        engine = getattr(self, "__class__", type(self)).__name__
        logger.info("%s unloaded", engine)
        self._after_unload()


class ModelNotCachedError(Exception):
    """Raised when a model load is attempted but the model is not cached locally.

    The caller should direct the user to the Model Downloads page instead.
    """


@contextmanager
def model_load_progress(
    model_name: str,
    is_cached: bool,
    filter_non_downloads: bool | None = None,
):
    """
    Context manager for model loading with HF download progress tracking.

    Handles the tqdm patching, progress_manager/task_manager lifecycle,
    and error reporting that every backend duplicates.

    Args:
        model_name: Progress tracking key (e.g. "kokoro", "whisper-base").
        is_cached: Whether the model is already downloaded.
        filter_non_downloads: Whether to filter non-download tqdm bars.
                              Defaults to `is_cached`.

    Yields:
        The tracker context (already entered). The caller loads the model
        inside the `with` block. The tqdm patch is torn down on exit.

    Usage:
        with model_load_progress("kokoro", is_cached) as ctx:
            self.model = SomeModel.from_pretrained(...)

    Raises:
        ModelNotCachedError: If the model is not cached locally. Models must
            be downloaded first via the Model Downloads page.
    """
    if not is_cached:
        raise ModelNotCachedError(
            f"Model '{model_name}' is not downloaded. Use the Model Downloads page to download it first."
        )

    if filter_non_downloads is None:
        filter_non_downloads = is_cached

    progress_manager = get_progress_manager()
    task_manager = get_task_manager()

    progress_callback = create_hf_progress_callback(model_name, progress_manager)
    tracker = HFProgressTracker(progress_callback, filter_non_downloads=filter_non_downloads)

    tracker_context = tracker.patch_download()
    tracker_context.__enter__()

    try:
        yield tracker_context
    except (RuntimeError, OSError, ImportError) as e:
        progress_manager.mark_error(model_name, str(e))
        task_manager.error_download(model_name, str(e))
        raise
    finally:
        tracker_context.__exit__(None, None, None)
