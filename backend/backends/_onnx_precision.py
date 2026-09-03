"""
Shared ONNX precision resolver and provider chain for torch-free TTS engines.

Picks the best quantization available on disk, in this priority order:

    int8  >  fp16  >  fp32

This keeps RAM/compute low on CPU while falling back gracefully when an
upstream repo only ships fp32 graphs (most of them). ONNX Runtime's CPU
ExecutionProvider does not *execute* fp16 graphs — a present fp16 file is
loaded and upcast to fp32 internally, so it only saves disk/load bandwidth,
not runtime compute. int8 is the only precision that actually cuts CPU cost
and resident RAM, and only Pocket-TTS ships int8 upstream today.

Every engine calls ``resolve_session_path`` at load time; the chosen
precision is logged once with a clear warning so users on low-RAM hosts
know what they got. No weights are bundled — everything is fetched lazily
from HuggingFace and cached, so this only affects *which cached file* is
used, never the build.
"""

import json
import logging
import os

import onnxruntime as ort

logger = logging.getLogger(__name__)

# Priority order: best (lowest RAM) first.
_PRECISION_SUFFIXES = ("int8", "fp16", "fp32")


def _stem_path(directory: str, stem: str, suffix: str) -> str:
    """Return the onnx path for a stem at a given precision suffix."""
    if suffix == "fp32":
        name = f"{stem}.onnx"
    else:
        name = f"{stem}_{suffix}.onnx"
    return os.path.join(directory, name)


def resolve_session_path(directory: str, stem: str) -> tuple[str, str]:
    """Resolve the best-available quantized onnx path for ``stem`` in ``directory``.

    Args:
        directory: Folder containing the engine's .onnx graphs.
        stem: Base filename without extension or precision suffix
            (e.g. ``"mimi_encoder"`` resolves to ``mimi_encoder_int8.onnx``
            if present, else ``mimi_encoder_fp16.onnx``, else ``mimi_encoder.onnx``).

    Returns:
        ``(abs_path, precision)`` where precision is one of
        ``"int8"``, ``"fp16"``, ``"fp32"``.

    Raises:
        FileNotFoundError: if no variant of the stem exists on disk.
    """
    for suffix in _PRECISION_SUFFIXES:
        candidate = _stem_path(directory, stem, suffix)
        if os.path.isfile(candidate):
            if suffix != "fp32":
                logger.warning(
                    "ONNX precision for '%s': using %s graph (%s). "
                    "Lower precision reduces RAM/CPU; fp32 fallback only if no "
                    "quantized graph is shipped.",
                    stem,
                    suffix,
                    os.path.basename(candidate),
                )
            return candidate, suffix

    raise FileNotFoundError(
        f"No ONNX graph found for stem '{stem}' in {directory} "
        f"(looked for {', '.join(_stem_path(directory, stem, s) for s in _PRECISION_SUFFIXES)})"
    )


def resolve_session_path_meta(directory: str, filename: str) -> tuple[str, str]:
    """Resolve precision when the upstream manifest already names a file.

    Strips any trailing precision suffix (``_int8`` / ``_fp16``) from the
    manifest's filename, then re-resolves so a repo that ships both
    ``foo.onnx`` and ``foo_int8.onnx`` still prefers the quantized graph.
    Falls back to the explicit manifest path if no sibling variant exists.
    """
    base = os.path.basename(str(filename))
    stem = base[:-5] if base.endswith(".onnx") else base
    for suffix in ("_int8", "_fp16"):
        if stem.endswith(suffix):
            stem = stem[: -len(suffix)]
            break
    try:
        return resolve_session_path(directory, stem)
    except FileNotFoundError:
        explicit = os.path.join(directory, base)
        if os.path.isfile(explicit):
            return explicit, "fp32"
        raise


# ---------------------------------------------------------------------------
# Shared ONNX provider chain resolver
# ---------------------------------------------------------------------------

_PROVIDER_CHAIN_LOGGED = False


def _get_recorded_provider() -> str | None:
    """Read the provider recorded by bin/setup-onnx.ps1."""
    from .. import config

    config_path = config.get_data_dir() / "runtime" / "onnx_provider.json"
    try:
        with open(config_path) as f:
            data = json.load(f)
        return data.get("provider")
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def resolve_providers(preferred: str = "auto") -> list[str]:
    """Return an ordered list of ONNX Runtime execution providers.

    Priority (when ``preferred="auto"``):
      1. Read recorded choice from ``data/runtime/onnx_provider.json``
         (written by ``bin/setup-onnx.ps1``)
      2. CUDAExecutionProvider  (NVIDIA GPUs)
      3. DmlExecutionProvider   (AMD / Intel DirectML)
      4. CPUExecutionProvider   (always available)

    Set ``preferred="cpu"`` to force CPU-only (avoids GPU memory overhead).
    """
    global _PROVIDER_CHAIN_LOGGED
    available = set(ort.get_available_providers())

    if preferred == "cpu":
        chain = ["CPUExecutionProvider"]
    else:
        recorded = _get_recorded_provider() if preferred == "auto" else None
        if recorded and recorded in available:
            chain = [recorded, "CPUExecutionProvider"]
        elif "CUDAExecutionProvider" in available:
            chain = ["CUDAExecutionProvider", "CPUExecutionProvider"]
        elif "DmlExecutionProvider" in available:
            chain = ["DmlExecutionProvider", "CPUExecutionProvider"]
        else:
            chain = ["CPUExecutionProvider"]

    if not _PROVIDER_CHAIN_LOGGED:
        _PROVIDER_CHAIN_LOGGED = True
        recorded = _get_recorded_provider()
        logger.info(
            "ONNX provider chain: %s (available: %s, recorded: %s)",
            chain,
            sorted(available),
            recorded,
        )

    return chain


def make_session_options(threads: int | None = None) -> ort.SessionOptions:
    """Create optimised ONNX Runtime session options for CPU inference."""
    opts = ort.SessionOptions()
    n = threads or min(os.cpu_count() or 4, 4)
    opts.intra_op_num_threads = n
    opts.inter_op_num_threads = 1
    return opts
