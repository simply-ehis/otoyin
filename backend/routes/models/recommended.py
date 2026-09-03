"""Recommended model pack endpoint.

Part of the no-default-model policy: the app never assumes a model is
installed. This endpoint tells the UI which recommended models are still
missing so it can show a dismissible "get started" banner instead of
failing silently with a hardcoded default.
"""

from ...utils.model_status import pick_cached_tts_engine, recommended_pack
from .common import router


@router.get("/models/recommended")
async def get_recommended_models():
    """Return the recommended pack with per-model download state.

    ChatTTS is the top recommended voice engine; whisper-tiny powers
    transcription/STS input; LFM 350M is the on-device assistant brain.
    DeepFilterNet and LavaSR ship inside the ``audiosronnx`` dependency
    and need no download.
    """
    pack = recommended_pack()
    missing = [entry for entry in pack if not entry["downloaded"]]
    return {
        "models": pack,
        "missing": missing,
        "all_downloaded": not missing,
        "current_tts_engine": pick_cached_tts_engine(),
    }
