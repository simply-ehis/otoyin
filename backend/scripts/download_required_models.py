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

# Only ONNX weights that ship inside the frozen binary.
BUNDLED_WEIGHTS = [
    {
        "label": "DeepFilterNet ONNX",
        "repo_id": "soniqo/DeepFilterNet3-ONNX",
        "filename": "deepfilter.onnx",
    },
    {
        "label": "Demucs v4 ONNX",
        "repo_id": "MrCitron/demucs-v4-onnx",
        "filename": "htdemucs.onnx",
    },
    # Silero VAD ships inside the silero-vad pip wheel — no HF download.
    # LavaSR ships inside the audiosronnx pip wheel — no HF download.
]


def _is_cached(repo_id: str, filename: str) -> bool:
    """Return True if the file is fully present in the local HF cache."""
    from huggingface_hub import hf_hub_download

    try:
        hf_hub_download(repo_id=repo_id, filename=filename, local_files_only=True)
        return True
    except Exception:
        return False


def download_required() -> int:
    """Download bundled weights. Returns the number of files fetched."""
    from huggingface_hub import hf_hub_download

    fetched = 0
    for entry in BUNDLED_WEIGHTS:
        repo_id = entry["repo_id"]
        filename = entry["filename"]
        label = entry["label"]
        if _is_cached(repo_id, filename):
            print(f"  ✓ {label} already cached")
        else:
            hf_hub_download(repo_id=repo_id, filename=filename)
            print(f"  ↓ {label} downloaded")
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
