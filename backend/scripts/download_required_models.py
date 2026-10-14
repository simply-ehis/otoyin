"""Pre-download ONNX weights that ship inside the frozen bundle.

These are tiny models that get bundled into the PyInstaller binary via
``--collect-all`` / ``--add-data`` in ``build_binary.py``.  They must be
cached locally BEFORE building so the bundle ships with them.

    python -m backend.scripts.download_required_models

Larger models (TTS, STT, LLM, voice-conversion, Steam Audio) are NOT
bundled — they download on first launch via the Models tab.
"""

from __future__ import annotations

import logging
import sys

logger = logging.getLogger(__name__)

# ONNX weights bundled into the frozen binary by build_binary.py.
BUNDLED_WEIGHTS = [
    {
        "label": "DeepFilterNet ONNX",
        "repo_id": "soniqo/DeepFilterNet3-ONNX",
        "filename": "deepfilter.onnx",
    },
    # Silero VAD ships inside the silero-vad pip wheel — no HF download.
    # LavaSR is fetched on first use by the audiosronnx resolver (it caches
    # under ~/.local/share/audiosronnx); the wheel itself ships no weights.
]

# Weights deliberately NOT bundled: at 303 MB, Demucs would grow every
# installer by more than the rest of the bundle. Pre-fetching it here still
# helps dev machines; installs resolve it from the HuggingFace cache.
RUNTIME_WEIGHTS = [
    {
        "label": "Demucs v4 ONNX",
        "repo_id": "MrCitron/demucs-v4-onnx",
        "filename": "htdemucs.onnx",
    },
]


def download_required() -> int:
    """Install required weights into the app folder (HF cache cleared).

    The app folder is the source of truth: build_binary.py stages bundled
    weights from data/models/, and runtime resolution never reads the HF
    cache as a fallback.
    """
    from ..services.model_files import install_model_file, is_model_installed

    fetched = 0
    for entry in [*BUNDLED_WEIGHTS, *RUNTIME_WEIGHTS]:
        repo_id = entry["repo_id"]
        filename = entry["filename"]
        label = entry["label"]
        if is_model_installed(repo_id, filename):
            print(f"  [cached] {label}")
        else:
            install_model_file(repo_id, filename)
            print(f"  [fetched] {label}")
            fetched += 1

    print(f"\nDone. {fetched} file(s) newly downloaded.")
    return fetched


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    try:
        import huggingface_hub  # noqa: F401
    except ImportError:
        logger.error("huggingface_hub not installed. Run the project setup first: just setup")
        sys.exit(1)

    download_required()


if __name__ == "__main__":
    main()
