"""
Shared utilities for TTS/STT backend implementations.

Eliminates duplication of cache checking, device detection,
voice prompt combination, and model loading progress tracking.
"""

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
        hf_repo: HuggingFace repo ID (e.g. "k2-fsa/sherpa-onnx-zonos-v0.1")
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


def get_torch_device(
    *,
    allow_xpu: bool = False,
    allow_directml: bool = False,
    allow_mps: bool = False,
    force_cpu_on_mac: bool = False,
) -> str:
    """
    Detect the best available torch device.

    Args:
        allow_xpu: Check for Intel XPU (IPEX) support.
        allow_directml: Check for DirectML (Windows) support.
        allow_mps: Allow MPS (Apple Silicon). If False, MPS falls back to CPU.
        force_cpu_on_mac: Force CPU on macOS regardless of GPU availability.
    """
    if force_cpu_on_mac and platform.system() == "Darwin":
        return "cpu"

    import torch

    if torch.cuda.is_available():
        return "cuda"

    if allow_xpu:
        try:
            import intel_extension_for_pytorch

            if hasattr(torch, "xpu") and torch.xpu.is_available():
                return "xpu"
        except ImportError:
            pass

    if allow_directml:
        try:
            import torch_directml

            if torch_directml.device_count() > 0:
                return torch_directml.device(0)
        except ImportError:
            pass

    if allow_mps and hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"

    return "cpu"


def check_cuda_compatibility() -> tuple[bool, str | None]:
    """Check if the installed PyTorch supports the current GPU's compute capability.

    Returns:
        (compatible, warning_message) — compatible is True if OK or no CUDA GPU,
        warning_message is a human-readable string if there's a problem.
    """
    try:
        import torch
    except ImportError:
        return True, None

    if not torch.cuda.is_available():
        return True, None

    major, minor = torch.cuda.get_device_capability(0)
    capability = f"{major}.{minor}"
    device_name = torch.cuda.get_device_name(0)
    sm_tag = f"sm_{major}{minor}"

    # torch.cuda._get_arch_list() returns the SM architectures this build
    # was compiled for (e.g. ["sm_50", "sm_60", ..., "sm_90"]).
    try:
        arch_list = torch.cuda._get_arch_list()
        if arch_list:
            # Check for both sm_XX and compute_XX (JIT-compiled) entries
            compute_tag = f"compute_{major}{minor}"
            if sm_tag not in arch_list and compute_tag not in arch_list:
                return False, (
                    f"{device_name} (compute capability {capability} / {sm_tag}) "
                    f"is not supported by this PyTorch build. "
                    f"Supported architectures: {', '.join(arch_list)}. "
                    f"Install PyTorch nightly (cu128) for newer GPU support: "
                    f"pip install torch --index-url https://download.pytorch.org/whl/nightly/cu128"
                )
    except AttributeError:
        pass

    return True, None


def empty_device_cache(device: str) -> None:
    """
    Free cached memory on the given device (CUDA or XPU).

    Backends should call this after unloading models so VRAM is returned
    to the OS.
    """
    import torch

    if device == "cuda" and torch.cuda.is_available():
        torch.cuda.empty_cache()
    elif device == "xpu" and hasattr(torch, "xpu"):
        torch.xpu.empty_cache()


def cleanup_gpu_memory(*, log: bool = False) -> None:
    """
    Proactive GPU memory cleanup after inference.

    Runs garbage collection (to free Python objects with circular refs)
    then calls ``empty_cache`` on every active accelerator.  The sequence
    matters: GC must run *first* so that CUDA tensors held by dead Python
    objects are released *before* ``empty_cache`` reclaims the freed blocks.

    Call this at the end of each generation / effect chain to reduce VRAM
    fragmentation and keep the CUDA allocator's free-list compact.

    Parameters
    ----------
    log : bool
        If True, emit an INFO-level log with pre/post VRAM usage so
        operators can verify the cleanup is effective.
    """
    import gc

    try:
        import torch
    except ImportError:
        return

    # --- snapshot before cleanup ---
    vram_before = None
    if log and torch.cuda.is_available():
        vram_before = torch.cuda.memory_allocated() / 1024 / 1024

    # 1. Collect dead Python objects so their CUDA tensors become freeable.
    gc.collect()

    # 2. Return freed blocks to the OS / CUDA allocator.
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    if hasattr(torch, "xpu") and torch.xpu.is_available():
        torch.xpu.empty_cache()

    # --- snapshot after cleanup ---
    if log and torch.cuda.is_available():
        vram_after = torch.cuda.memory_allocated() / 1024 / 1024
        freed = vram_before - vram_after if vram_before is not None else 0
        logger.info(
            "GPU memory cleanup: before=%.1fMB after=%.1fMB freed=%.1fMB",
            vram_before or 0,
            vram_after,
            freed,
        )


def manual_seed(seed: int, device: str) -> None:
    """
    Set the random seed on both CPU and the active accelerator.

    Covers CUDA and Intel XPU so that generation is reproducible
    regardless of which GPU backend is in use.
    """
    import torch

    torch.manual_seed(seed)
    if device == "cuda" and torch.cuda.is_available():
        torch.cuda.manual_seed(seed)
    elif device == "xpu" and hasattr(torch, "xpu"):
        torch.xpu.manual_seed(seed)


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
